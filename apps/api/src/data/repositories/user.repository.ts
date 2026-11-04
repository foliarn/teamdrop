import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type SqlBool, type Updateable, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidRatingError,
  InvalidReferenceError,
  InvalidSlotError,
  NotFoundError,
  OverlappingSlotsError,
  UsernameTakenError,
} from '../errors';
import { asType } from '../internal/expressions';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { decryptText } from '../internal/crypto';
import {
  type ProfileSportRow,
  type UserRatingRow,
  toAvailabilitySlot,
  toProfileSport,
  toUserRating,
  toUserSettings,
} from '../internal/mappers/account.mapper';
import { toMunicipality } from '../internal/mappers/reference.mapper';
import { municipalityQuery } from '../internal/municipality-query';
import { KYSELY } from '../internal/kysely';
import { decodeCursor, clampLimit, encodeCursor } from '../internal/pagination';
import { asUuid, blockedBetween, canViewSection } from '../internal/visibility';
import { isLocalTime } from '../internal/time';
import type { Page, PageRequest } from '../types/common.types';
import type {
  AvailabilitySlot,
  MeProfile,
  PublicProfile,
  UpdateProfilePatch,
  UserRatingInput,
  UserSearchResult,
  UserSettings,
  UserSportLevel,
} from '../types/account.types';

/** Sports and levels of a user, joined with names. */
function profileSportsQuery(db: Kysely<DB>, userId: string) {
  return db
    .selectFrom('user_sport as us')
    .innerJoin('sport as s', 's.id', 'us.sport_id')
    .innerJoin('skill_level as l', 'l.id', 'us.skill_level_id')
    .where('us.user_id', '=', userId)
    .select([
      's.id as sport_id',
      's.code as sport_code',
      's.name as sport_name',
      'l.id as skill_level_id',
      'l.code as skill_level_code',
      'l.name as skill_level_name',
    ])
    .orderBy('s.name')
    .orderBy('s.id');
}

/** Ratings of a user, resolved to the system code and the numeric value or grade code. */
function ratingsQuery(db: Kysely<DB>, userId: string) {
  return db
    .selectFrom('user_rating as ur')
    .innerJoin('rating_system as rs', 'rs.id', 'ur.rating_system_id')
    .leftJoin('rating_grade as g', 'g.id', 'ur.rating_grade_id')
    .where('ur.user_id', '=', userId)
    .select([
      'ur.rating_system_id',
      'rs.code as system_code',
      'ur.numeric_value',
      'g.code as grade_code',
    ])
    .orderBy('rs.code');
}

/** Availability slots of a user, by day then start time. */
function availabilityQuery(db: Kysely<DB>, userId: string) {
  return db
    .selectFrom('user_availability')
    .select(['day_of_week', 'start_time', 'end_time'])
    .where('user_id', '=', userId)
    .orderBy('day_of_week')
    .orderBy('start_time');
}

/** Throws `InvalidInputError` when a list contains the same id twice. */
function assertUnique(ids: string[], message: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new InvalidInputError(message);
  }
}

/** Locks the account row for the rest of the transaction, so that replacements of its lists are serialized. */
async function lockUser(trx: Kysely<DB>, userId: string): Promise<void> {
  const row = await trx
    .selectFrom('user_account')
    .select('id')
    .where('id', '=', userId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('User not found');
  }
}

/** Constraints of `user_sport` that refer to reference data. */
const SPORT_LINK_CONSTRAINTS: Record<string, () => DataError> = {
  fk_user_sport_sport_id: () => new InvalidReferenceError('Unknown sport'),
  fk_user_sport_skill_level_id: () =>
    new InvalidReferenceError('Unknown skill level'),
  fk_user_sport_user_id: () => new NotFoundError('User not found'),
};

/** Constraints of `user_availability`. */
const AVAILABILITY_CONSTRAINTS: Record<string, () => DataError> = {
  ex_user_availability_no_overlap: () => new OverlappingSlotsError(),
  ck_user_availability_day_of_week: () =>
    new InvalidSlotError('Day of week must be between 1 and 7'),
  ck_user_availability_time_order: () =>
    new InvalidSlotError('End time must be after start time'),
};

/** Validates one availability slot before writing (BR-ACC-12). */
function assertValidSlot(slot: AvailabilitySlot): void {
  if (
    !Number.isInteger(slot.dayOfWeek) ||
    slot.dayOfWeek < 1 ||
    slot.dayOfWeek > 7
  ) {
    throw new InvalidSlotError('Day of week must be between 1 and 7');
  }
  if (!isLocalTime(slot.startTime) || !isLocalTime(slot.endTime)) {
    throw new InvalidSlotError('Times must be HH:mm');
  }
  if (slot.startTime >= slot.endTime) {
    throw new InvalidSlotError('End time must be after start time');
  }
}

/**
 * Own and public profile, sports, ratings, availability, settings, username search, and account deletion request.
 * Every read that depends on who is looking takes `viewerId` first and applies profile visibility (BR-ACC-14).
 * Lists that a user replaces (sports, ratings, availability) are replaced in one transaction.
 */
@Injectable()
export class UserRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Returns the full profile of the account, including the decrypted email and birth date. Only the account owner
   * may call this; the caller passes the authenticated user's id.
   *
   * Rules: BR-ACC-01, BR-ACC-04 (decryption), BR-ACC-09 to BR-ACC-15 (own data is never filtered), BR-GDP-03
   * (deletion request date).
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: the own profile, read in one transaction.
   */
  async getMe(userId: string): Promise<MeProfile> {
    try {
      return await this.db
        .transaction()
        .execute(async (trx): Promise<MeProfile> => {
          const user = await trx
            .selectFrom('user_account as u')
            .where('u.id', '=', userId)
            .select([
              'u.id',
              'u.username',
              'u.first_name',
              'u.gender',
              'u.avatar_path',
              'u.role',
              'u.municipality_id',
              'u.created_at',
              'u.email_verified_at',
              'u.last_active_at',
              'u.deletion_requested_at',
              asType<string>(decryptText('u.email_ciphertext')).as('email'),
              asType<string>(decryptText('u.birth_date_ciphertext')).as(
                'birth_date',
              ),
            ])
            .executeTakeFirst();
          if (user === undefined) {
            throw new NotFoundError('User not found');
          }

          const municipality = await municipalityQuery(trx)
            .where('m.id', '=', user.municipality_id)
            .executeTakeFirstOrThrow();
          const settings = await trx
            .selectFrom('user_setting')
            .selectAll()
            .where('user_id', '=', userId)
            .executeTakeFirstOrThrow();
          const sports: ProfileSportRow[] = await profileSportsQuery(
            trx,
            userId,
          ).execute();
          const ratings: UserRatingRow[] = await ratingsQuery(
            trx,
            userId,
          ).execute();
          const availability = await availabilityQuery(trx, userId).execute();

          return {
            id: user.id,
            username: user.username,
            email: user.email,
            emailVerified: user.email_verified_at !== null,
            firstName: user.first_name,
            birthDate: user.birth_date,
            gender: user.gender,
            avatarPath: user.avatar_path,
            role: user.role,
            municipality: toMunicipality(municipality),
            sports: sports.map(toProfileSport),
            ratings: ratings.map(toUserRating),
            availability: availability.map(toAvailabilitySlot),
            settings: toUserSettings(settings),
            createdAt: user.created_at,
            lastActiveAt: user.last_active_at,
            deletionRequestedAt: user.deletion_requested_at,
          };
        });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns the profile of `userId` as seen by `viewerId`. The profile section visibility decides what is returned:
   * a hidden profile gives only the identity fields and `isHidden: true`. Email, birth date and role are never returned.
   *
   * Rules: BR-ACC-14 (profile visibility: `public` and `members` for any viewer, `friends` for friends, `only_me`
   * for the owner only), BR-SOC-01 (friends), BR-SOC-02 (blocked in either direction).
   * Errors: none expected.
   * Outcome: `null` when the account does not exist or when either user blocked the other; otherwise the public profile.
   */
  async getProfile(
    viewerId: string,
    userId: string,
  ): Promise<PublicProfile | null> {
    try {
      return await this.db
        .transaction()
        .execute(async (trx): Promise<PublicProfile | null> => {
          const user = await trx
            .selectFrom('user_account as u')
            .innerJoin('user_setting as s', 's.user_id', 'u.id')
            .where('u.id', '=', userId)
            .select((eb) => [
              'u.id',
              'u.username',
              'u.avatar_path',
              'u.first_name',
              'u.gender',
              'u.municipality_id',
              blockedBetween(asUuid(viewerId), eb.ref('u.id')).as('blocked'),
              canViewSection(
                eb.ref('s.profile_visibility'),
                asUuid(viewerId),
                eb.ref('u.id'),
              ).as('can_view'),
            ])
            .executeTakeFirst();
          // BR-SOC-02: a block in either direction hides the profile entirely.
          if (user === undefined || user.blocked === true) {
            return null;
          }

          const identity = {
            id: user.id,
            username: user.username,
            avatarPath: user.avatar_path,
          };
          // BR-ACC-14: the profile section is hidden from viewers it is not visible to.
          if (user.can_view !== true) {
            return { ...identity, isHidden: true };
          }

          const municipality = await trx
            .selectFrom('municipality')
            .select(['id', 'name'])
            .where('id', '=', user.municipality_id)
            .executeTakeFirstOrThrow();
          const sports: ProfileSportRow[] = await profileSportsQuery(
            trx,
            userId,
          ).execute();
          const ratings: UserRatingRow[] = await ratingsQuery(
            trx,
            userId,
          ).execute();
          const availability = await availabilityQuery(trx, userId).execute();

          return {
            ...identity,
            isHidden: false,
            firstName: user.first_name,
            gender: user.gender,
            municipality: { id: municipality.id, name: municipality.name },
            sports: sports.map(toProfileSport),
            ratings: ratings.map(toUserRating),
            availability: availability.map(toAvailabilitySlot),
          };
        });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Updates the given fields of the own profile. Only the fields present in `patch` change.
   *
   * Rules: BR-ACC-01, BR-ACC-09 (gender, optional), BR-ACC-13 and BR-ACC-19 (municipality), BR-ACC-16 (avatar path).
   * Errors: `NotFoundError`; `InvalidReferenceError` (unknown municipality).
   * Outcome: nothing.
   */
  async updateProfile(
    userId: string,
    patch: UpdateProfilePatch,
  ): Promise<void> {
    const values: Updateable<DB['user_account']> = {};
    if (patch.firstName !== undefined) values.first_name = patch.firstName;
    if (patch.municipalityId !== undefined)
      values.municipality_id = patch.municipalityId;
    if (patch.gender !== undefined) values.gender = patch.gender;
    if (patch.avatarPath !== undefined) values.avatar_path = patch.avatarPath;

    try {
      if (Object.keys(values).length === 0) {
        await this.assertUserExists(userId);
        return;
      }
      const result = await this.db
        .updateTable('user_account')
        .set(values)
        .where('id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('User not found');
      }
    } catch (err) {
      throw mapDbError(err, {
        fk_user_account_municipality_id: () =>
          new InvalidReferenceError('Unknown municipality'),
      });
    }
  }

  /**
   * Changes the username. Usernames are unique and case-insensitive.
   *
   * Rules: BR-ACC-02.
   * Errors: `UsernameTakenError`; `NotFoundError`.
   * Outcome: nothing.
   */
  async setUsername(userId: string, username: string): Promise<void> {
    try {
      const result = await this.db
        .updateTable('user_account')
        .set({ username })
        .where('id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('User not found');
      }
    } catch (err) {
      throw mapDbError(err, {
        uq_user_account_username: () => new UsernameTakenError(),
      });
    }
  }

  /**
   * Replaces all sports of the user with the given levels, in one transaction.
   *
   * Rules: BR-ACC-10 (one self-declared level per sport on the shared scale).
   * Errors: `InvalidInputError` (a sport given twice); `InvalidReferenceError` (unknown sport or level); `NotFoundError`.
   * Outcome: nothing. An empty list removes all sports.
   */
  async setSports(userId: string, items: UserSportLevel[]): Promise<void> {
    assertUnique(
      items.map((item) => item.sportId),
      'A sport can only be declared once',
    );
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockUser(trx, userId);
        await trx
          .deleteFrom('user_sport')
          .where('user_id', '=', userId)
          .execute();
        if (items.length > 0) {
          await trx
            .insertInto('user_sport')
            .values(
              items.map((item) => ({
                user_id: userId,
                sport_id: item.sportId,
                skill_level_id: item.skillLevelId,
              })),
            )
            .execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, SPORT_LINK_CONSTRAINTS);
    }
  }

  /**
   * Replaces all official ratings of the user, in one transaction. Each rating is checked against its system:
   * a numeric system takes a number within its bounds and no grade; a graded system takes a grade of that system and no number.
   *
   * Rules: BR-ACC-11.
   * Errors: `InvalidRatingError` (value does not match its system); `InvalidReferenceError` (unknown system or grade);
   * `InvalidInputError` (a system given twice); `NotFoundError`.
   * Outcome: nothing. An empty list removes all ratings.
   */
  async setRatings(userId: string, items: UserRatingInput[]): Promise<void> {
    assertUnique(
      items.map((item) => item.ratingSystemId),
      'A rating system can only be declared once',
    );
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockUser(trx, userId);

        const systems =
          items.length === 0
            ? []
            : await trx
                .selectFrom('rating_system')
                .select(['id', 'value_kind', 'min_value', 'max_value'])
                .where(
                  'id',
                  'in',
                  items.map((item) => item.ratingSystemId),
                )
                .execute();

        const gradeIds = items.flatMap((item) =>
          item.ratingGradeId === undefined ? [] : [item.ratingGradeId],
        );
        const grades =
          gradeIds.length === 0
            ? []
            : await trx
                .selectFrom('rating_grade')
                .select(['id', 'rating_system_id'])
                .where('id', 'in', gradeIds)
                .execute();

        const rows = items.map((item) => {
          const system = systems.find(
            (candidate) => candidate.id === item.ratingSystemId,
          );
          if (system === undefined) {
            throw new InvalidReferenceError('Unknown rating system');
          }
          return {
            user_id: userId,
            rating_system_id: system.id,
            ...ratingValues(item, system, grades),
          };
        });

        await trx
          .deleteFrom('user_rating')
          .where('user_id', '=', userId)
          .execute();
        if (rows.length > 0) {
          await trx.insertInto('user_rating').values(rows).execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, {
        fk_user_rating_rating_grade_id: () =>
          new InvalidReferenceError('Unknown rating grade'),
        fk_user_rating_rating_system_id: () =>
          new InvalidReferenceError('Unknown rating system'),
        ck_user_rating_one_value: () =>
          new InvalidRatingError('A rating holds one value'),
      });
    }
  }

  /**
   * Returns the availability slots of a user, if the viewer may see the profile.
   *
   * Rules: BR-ACC-12, BR-ACC-14 (the availability follows the profile visibility).
   * Errors: none expected.
   * Outcome: `null` when the account does not exist or the viewer may not see it; otherwise the slots by day then start time.
   */
  async getAvailability(
    viewerId: string,
    userId: string,
  ): Promise<AvailabilitySlot[] | null> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const setting = await trx
          .selectFrom('user_setting as s')
          .where('s.user_id', '=', userId)
          .select((eb) => [
            blockedBetween(asUuid(viewerId), eb.ref('s.user_id')).as('blocked'),
            canViewSection(
              eb.ref('s.profile_visibility'),
              asUuid(viewerId),
              eb.ref('s.user_id'),
            ).as('can_view'),
          ])
          .executeTakeFirst();
        // BR-SOC-02 and BR-ACC-14: null when blocked in either direction or not visible to the viewer.
        if (
          setting === undefined ||
          setting.blocked === true ||
          setting.can_view !== true
        ) {
          return null;
        }
        const rows = await availabilityQuery(trx, userId).execute();
        return rows.map(toAvailabilitySlot);
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Replaces all availability slots of the user, in one transaction. Times are 'HH:mm' in local time.
   *
   * Rules: BR-ACC-12 (slots of one user never overlap; day 1 to 7, ISO; end after start).
   * Errors: `OverlappingSlotsError`; `InvalidSlotError` (day out of range, end not after start, bad time format); `NotFoundError`.
   * Outcome: nothing. An empty list removes all slots.
   */
  async setAvailability(
    userId: string,
    slots: AvailabilitySlot[],
  ): Promise<void> {
    for (const slot of slots) {
      assertValidSlot(slot);
    }
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockUser(trx, userId);
        await trx
          .deleteFrom('user_availability')
          .where('user_id', '=', userId)
          .execute();
        if (slots.length > 0) {
          await trx
            .insertInto('user_availability')
            .values(
              slots.map((slot) => ({
                user_id: userId,
                day_of_week: slot.dayOfWeek,
                start_time: slot.startTime,
                end_time: slot.endTime,
              })),
            )
            .execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, AVAILABILITY_CONSTRAINTS);
    }
  }

  /**
   * Returns the privacy and interaction settings of the account.
   *
   * Rules: BR-ACC-14, BR-ACC-15.
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: the settings.
   */
  async getSettings(userId: string): Promise<UserSettings> {
    try {
      const row = await this.db
        .selectFrom('user_setting')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('User not found');
      }
      return toUserSettings(row);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Updates the given settings. Only the fields present in `patch` change.
   *
   * Rules: BR-ACC-14 (section visibility), BR-ACC-15 (hide from rankings, invite policy).
   * Errors: `NotFoundError`.
   * Outcome: the settings after the update.
   */
  async updateSettings(
    userId: string,
    patch: Partial<UserSettings>,
  ): Promise<UserSettings> {
    const values: Updateable<DB['user_setting']> = {};
    if (patch.profileVisibility !== undefined)
      values.profile_visibility = patch.profileVisibility;
    if (patch.statsVisibility !== undefined)
      values.stats_visibility = patch.statsVisibility;
    if (patch.badgesVisibility !== undefined)
      values.badges_visibility = patch.badgesVisibility;
    if (patch.reliabilityVisibility !== undefined) {
      values.reliability_visibility = patch.reliabilityVisibility;
    }
    if (patch.circlesVisibility !== undefined)
      values.circles_visibility = patch.circlesVisibility;
    if (patch.historyVisibility !== undefined)
      values.history_visibility = patch.historyVisibility;
    if (patch.followsVisibility !== undefined)
      values.follows_visibility = patch.followsVisibility;
    if (patch.isPrivateAccount !== undefined)
      values.is_private_account = patch.isPrivateAccount;
    if (patch.hideFromRankings !== undefined)
      values.hide_from_rankings = patch.hideFromRankings;
    if (patch.circleInvitePolicy !== undefined) {
      values.circle_invite_policy = patch.circleInvitePolicy;
    }

    try {
      return await this.db.transaction().execute(async (trx) => {
        if (Object.keys(values).length > 0) {
          const result = await trx
            .updateTable('user_setting')
            .set(values)
            .where('user_id', '=', userId)
            .executeTakeFirst();
          if (Number(result.numUpdatedRows) === 0) {
            throw new NotFoundError('User not found');
          }
        }
        const row = await trx
          .selectFrom('user_setting')
          .selectAll()
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (row === undefined) {
          throw new NotFoundError('User not found');
        }
        return toUserSettings(row);
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Records that the user was active now. Used for the inactivity rules.
   *
   * Rules: BR-GDP-08 (inactive accounts).
   * Errors: none expected. An unknown account is ignored.
   * Outcome: nothing.
   */
  async touchLastActive(userId: string): Promise<void> {
    try {
      await this.db
        .updateTable('user_account')
        .set({ last_active_at: sql<Date>`now()` })
        .where('id', '=', userId)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Searches users by username: accent- and case-insensitive trigram match (BR-TECH-10). The viewer is excluded.
   * Results are ordered by username then id (keyset pagination, the cursor holds the last username and id).
   * Ordering by similarity was not chosen to keep the cursor stable.
   *
   * Rules: BR-TECH-10.
   * Errors: `INVALID_CURSOR` (malformed cursor).
   * Outcome: a page of at most `limit` users (default 20, max 100). A query shorter than 2 characters returns an empty page.
   */
  async searchUsers(
    viewerId: string,
    query: string,
    page: PageRequest = {},
  ): Promise<Page<UserSearchResult>> {
    const term = query.trim();
    if (term.length < 2) {
      return { items: [], nextCursor: null };
    }
    const limit = clampLimit(page.limit);
    try {
      let builder = this.db
        .selectFrom('user_account as u')
        .select(['u.id', 'u.username', 'u.avatar_path'])
        .where('u.id', '<>', viewerId)
        // BR-SOC-02: users blocked in either direction are never found.
        .where(
          sql<SqlBool>`NOT ${blockedBetween(asUuid(viewerId), sql<string>`u.id`)}`,
        )
        .where(
          sql<boolean>`immutable_unaccent(${term}::text) <% immutable_unaccent(u.username::text)`,
        )
        .orderBy('u.username')
        .orderBy('u.id')
        .limit(limit + 1);

      if (page.cursor !== undefined) {
        const key = decodeCursor<{ username?: unknown; id?: unknown }>(
          page.cursor,
        );
        if (typeof key.username !== 'string' || typeof key.id !== 'string') {
          throw new DataError('INVALID_CURSOR', 'Invalid cursor');
        }
        builder = builder.where(
          sql<boolean>`(u.username, u.id) > (${key.username}::citext, ${key.id}::uuid)`,
        );
      }

      const rows = await builder.execute();
      const items = rows.slice(0, limit).map((row) => ({
        id: row.id,
        username: row.username,
        avatarPath: row.avatar_path,
      }));
      const last = items[items.length - 1];
      const nextCursor =
        rows.length > limit && last !== undefined
          ? encodeCursor({ username: last.username, id: last.id })
          : null;
      return { items, nextCursor };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Records a request to delete the account. The erasure itself runs after a 30-day grace period (batch 6).
   * A second request keeps the first date.
   *
   * Rules: BR-GDP-03.
   * Errors: `NotFoundError`.
   * Outcome: the instant of the request.
   */
  async requestDeletion(
    userId: string,
  ): Promise<{ deletionRequestedAt: Date }> {
    try {
      const row = await this.db
        .updateTable('user_account')
        .set({
          deletion_requested_at: sql<Date>`COALESCE(deletion_requested_at, now())`,
        })
        .where('id', '=', userId)
        .returning('deletion_requested_at')
        .executeTakeFirst();
      if (row === undefined || row.deletion_requested_at === null) {
        throw new NotFoundError('User not found');
      }
      return { deletionRequestedAt: row.deletion_requested_at };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Cancels a pending account deletion request.
   *
   * Rules: BR-GDP-03.
   * Errors: `NotFoundError`.
   * Outcome: nothing.
   */
  async cancelDeletion(userId: string): Promise<void> {
    try {
      const result = await this.db
        .updateTable('user_account')
        .set({ deletion_requested_at: null })
        .where('id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('User not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Throws `NotFoundError` when the account does not exist. */
  private async assertUserExists(userId: string): Promise<void> {
    const row = await this.db
      .selectFrom('user_account')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    if (row === undefined) {
      throw new NotFoundError('User not found');
    }
  }
}

/** Row of `rating_system` used to validate a rating. */
type RatingSystemRow = {
  id: string;
  value_kind: 'numeric' | 'graded';
  min_value: string | null;
  max_value: string | null;
};

/**
 * Validates one rating against its system (BR-ACC-11) and returns the column values to store.
 * A numeric system takes a number within its bounds and no grade; a graded system takes a grade of that system and no number.
 */
function ratingValues(
  item: UserRatingInput,
  system: RatingSystemRow,
  grades: { id: string; rating_system_id: string }[],
): { numeric_value: number | null; rating_grade_id: string | null } {
  if (system.value_kind === 'numeric') {
    // BR-ACC-11: a numeric system needs a number within its bounds and no grade.
    const value = item.numericValue;
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      item.ratingGradeId !== undefined
    ) {
      throw new InvalidRatingError(
        'A numeric rating needs a number and no grade',
      );
    }
    const min = system.min_value === null ? null : Number(system.min_value);
    const max = system.max_value === null ? null : Number(system.max_value);
    if ((min !== null && value < min) || (max !== null && value > max)) {
      throw new InvalidRatingError(
        'Rating is outside the bounds of its rating system',
      );
    }
    return { numeric_value: value, rating_grade_id: null };
  }

  // BR-ACC-11: a graded system needs a grade of that system and no number.
  if (item.ratingGradeId === undefined || item.numericValue !== undefined) {
    throw new InvalidRatingError('A graded rating needs a grade and no number');
  }
  const grade = grades.find((candidate) => candidate.id === item.ratingGradeId);
  if (grade === undefined) {
    throw new InvalidReferenceError('Unknown rating grade');
  }
  if (grade.rating_system_id !== system.id) {
    throw new InvalidRatingError(
      'Rating grade does not belong to the rating system',
    );
  }
  return { numeric_value: null, rating_grade_id: item.ratingGradeId };
}
