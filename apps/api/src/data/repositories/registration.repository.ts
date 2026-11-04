import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type SqlBool, sql } from 'kysely';
import {
  type DataError,
  AdultsOnlyError,
  AlreadyRegisteredError,
  InvalidInputError,
  InvalidStateError,
  NotFoundError,
  NotVisibleError,
  OccurrenceFullError,
  OccurrenceNotOpenError,
} from '../errors';
import { writeAudit } from '../internal/audit';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { decryptText } from '../internal/crypto';
import { asType } from '../internal/expressions';
import { eventVisibleTo } from '../internal/event-visibility';
import {
  ACTIVE_REGISTRATION_STATUSES,
  assertFits,
  effectiveMaxParticipants,
  findOccurrence,
  isLateCancellation,
  isProducedDate,
  loadEvent,
  lockOccurrence,
  materializeOccurrence,
  originalStartOf,
  promoteFromWaitlist,
  registrationSpots,
  takenSpots,
  type EventRow,
  type OccurrenceRow,
} from '../internal/occurrences';
import { blockedBetween } from '../internal/visibility';
import { isAtLeastAge, isLocalDate, todayLocal } from '../internal/time';
import type {
  CancelRegistrationOutcome,
  OccurrenceKey,
  Participant,
  PromotionOutcome,
  RegistrationOutcome,
  RegistrationQueueEntry,
} from '../types/event.types';

/** Minimum age of an adult, for adults-only events (BR-EVT-11). */
const ADULT_AGE = 18;

/** Constraints of `registration` and `registration_guest`, mapped to typed errors. */
const REGISTRATION_CONSTRAINTS: Record<string, () => DataError> = {
  fk_audit_log_actor_id: () => new NotFoundError('User not found'),
  uq_registration_active: () => new AlreadyRegisteredError(),
  fk_registration_occurrence_id: () =>
    new NotFoundError('Occurrence not found'),
  fk_registration_user_id: () => new NotFoundError('User not found'),
  fk_registration_guest_registration_id: () =>
    new NotFoundError('Registration not found'),
};

/** Trims guest names and rejects empty ones. Guests are unlimited (BR-REG-05). */
function normalizeGuestNames(names: string[] | undefined): string[] {
  return (names ?? []).map((name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new InvalidInputError('Guest names cannot be empty');
    }
    return trimmed;
  });
}

/** Loads a registration with its occurrence and locks the occurrence first (business-rules section 1.4). */
async function lockRegistrationOccurrence(
  trx: Kysely<DB>,
  registrationId: string,
): Promise<{
  occurrence: OccurrenceRow & { upcoming: boolean };
  event: EventRow;
}> {
  const registration = await trx
    .selectFrom('registration')
    .select('occurrence_id')
    .where('id', '=', registrationId)
    .executeTakeFirst();
  if (registration === undefined) {
    throw new NotFoundError('Registration not found');
  }
  const occurrence = await lockOccurrence(trx, registration.occurrence_id);
  const event = await loadEvent(trx, occurrence.event_id);
  return { occurrence, event };
}

/**
 * Registrations to occurrences: register, cancel, approval, waitlist, removal and guests (BR-REG-01 to BR-REG-06).
 * Every method that counts spots or changes a registration locks the occurrence row `FOR UPDATE` first, inside one
 * transaction (business-rules section 1.4). Permissions (who may approve, remove or read the lists) are checked by
 * the developers.
 */
@Injectable()
export class RegistrationRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Registers a user for one occurrence (BR-REG-01, BR-REG-02, BR-REG-03, BR-REG-04, BR-REG-05, BR-EVT-11, BR-SOC-02).
   * Steps, in one transaction: materialize the occurrence if needed (BR-EVT-03); lock it; check the event is visible
   * (BR-EVT-23, BR-SOC-02); check it is open (published, scheduled, starting later); for adults-only events, check the
   * age from the decrypted birth date (BR-EVT-11); refuse a second active registration; then the status:
   * - `approval` mode: `pending_approval`;
   * - `automatic` mode: `confirmed` if (1 + guests) fits and nobody is waiting, otherwise `waitlisted` (BR-REG-04).
   * A newcomer never jumps a non-empty waitlist: the queue is strictly first come, first served.
   * Errors: `NotFoundError`, `NotVisibleError`, `OccurrenceNotOpenError`, `AdultsOnlyError`, `AlreadyRegisteredError`,
   * `InvalidInputError` (empty guest name).
   * Outcome: the registration id and its status.
   */
  async register(
    key: OccurrenceKey,
    userId: string,
    input: { guestNames?: string[] } = {},
  ): Promise<RegistrationOutcome> {
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Occurrence not found');
    }
    const guestNames = normalizeGuestNames(input.guestNames);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await loadEvent(trx, key.eventId);
        const visible = await trx
          .selectFrom('event as e')
          .select('e.id')
          .where('e.id', '=', key.eventId)
          .where(eventVisibleTo(userId))
          .executeTakeFirst();
        if (visible === undefined) {
          throw new NotVisibleError();
        }

        const { row } = await materializeOccurrence(trx, event, key.date);
        const occurrence = await lockOccurrence(trx, row.id);
        const current = await trx
          .selectFrom('event')
          .select('status')
          .where('id', '=', event.id)
          .executeTakeFirstOrThrow();
        if (
          current.status !== 'published' ||
          occurrence.status !== 'scheduled' ||
          !occurrence.upcoming
        ) {
          throw new OccurrenceNotOpenError();
        }

        // BR-EVT-11: adults-only events refuse minors. Only the data layer can read the birth date.
        if (event.adults_only) {
          const user = await trx
            .selectFrom('user_account')
            .select(
              asType<string>(
                decryptText('user_account.birth_date_ciphertext'),
              ).as('birth_date'),
            )
            .where('id', '=', userId)
            .executeTakeFirst();
          if (user === undefined) {
            throw new NotFoundError('User not found');
          }
          if (!isAtLeastAge(user.birth_date, ADULT_AGE, todayLocal())) {
            throw new AdultsOnlyError();
          }
        }

        const existing = await trx
          .selectFrom('registration')
          .select('id')
          .where('occurrence_id', '=', occurrence.id)
          .where('user_id', '=', userId)
          .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
          .executeTakeFirst();
        if (existing !== undefined) {
          throw new AlreadyRegisteredError();
        }

        // BR-REG-03, BR-REG-04: the status depends on the mode and on the free spots.
        let status: RegistrationOutcome['status'];
        if (event.registration_mode === 'approval') {
          status = 'pending_approval';
        } else {
          const waiting = await trx
            .selectFrom('registration')
            .select('id')
            .where('occurrence_id', '=', occurrence.id)
            .where('status', '=', 'waitlisted')
            .executeTakeFirst();
          const taken = await takenSpots(trx, occurrence.id);
          const fits =
            taken + 1 + guestNames.length <=
            effectiveMaxParticipants(event, occurrence);
          status = fits && waiting === undefined ? 'confirmed' : 'waitlisted';
        }

        const registration = await trx
          .insertInto('registration')
          .values({
            occurrence_id: occurrence.id,
            user_id: userId,
            status,
            confirmed_at: status === 'confirmed' ? sql<Date>`now()` : null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (guestNames.length > 0) {
          await trx
            .insertInto('registration_guest')
            .values(
              guestNames.map((name) => ({
                registration_id: registration.id,
                display_name: name,
              })),
            )
            .execute();
        }
        return { registrationId: registration.id, status };
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Cancels the user's active registration for an occurrence (BR-REG-06, BR-REG-04, BR-EVT-07).
   * The late flag is computed by the database clock and frozen: only for a confirmed registration, less than 24 hours
   * before the start, and not within 24 hours after a significant change. A cancellation that frees a confirmed spot
   * promotes the waitlist in automatic mode.
   * Errors: `NotFoundError` (no active registration).
   * Outcome: `wasLate` and the promoted users, to notify.
   */
  async cancelRegistration(
    key: OccurrenceKey,
    userId: string,
  ): Promise<CancelRegistrationOutcome> {
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Registration not found');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await loadEvent(trx, key.eventId);
        const row = await findOccurrence(
          trx,
          event.id,
          originalStartOf(event, key.date),
        );
        if (row === undefined) {
          throw new NotFoundError('Registration not found');
        }
        const occurrence = await lockOccurrence(trx, row.id);
        const registration = await trx
          .selectFrom('registration')
          .select(['id', 'status'])
          .where('occurrence_id', '=', occurrence.id)
          .where('user_id', '=', userId)
          .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
          .forUpdate()
          .executeTakeFirst();
        if (registration === undefined) {
          throw new NotFoundError('Registration not found');
        }

        const wasConfirmed = registration.status === 'confirmed';
        // BR-REG-06: the flag is computed only for a confirmed place and frozen now.
        const late =
          wasConfirmed && (await isLateCancellation(trx, occurrence.id));
        await trx
          .updateTable('registration')
          .set({
            status: 'cancelled',
            cancelled_at: sql<Date>`now()`,
            is_late_cancellation: late,
          })
          .where('id', '=', registration.id)
          .execute();

        const promotion = wasConfirmed
          ? await promoteFromWaitlist(trx, event, occurrence)
          : { promotedUserIds: [] };
        return { wasLate: late, promotedUserIds: promotion.promotedUserIds };
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Approves a pending registration in approval mode (BR-REG-03). The spots, guests included, must fit.
   * Permission: organizers, checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError` (not pending), `OccurrenceFullError`.
   * Outcome: none.
   */
  async approveRegistration(registrationId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const { occurrence, event } = await lockRegistrationOccurrence(
          trx,
          registrationId,
        );
        const registration = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (registration.status !== 'pending_approval') {
          throw new InvalidStateError(
            'Only a pending registration can be approved',
          );
        }
        const spots = await registrationSpots(trx, registrationId);
        await assertFits(
          trx,
          occurrence,
          effectiveMaxParticipants(event, occurrence),
          spots,
        );
        await trx
          .updateTable('registration')
          .set({ status: 'confirmed', confirmed_at: sql<Date>`now()` })
          .where('id', '=', registrationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Declines a pending or waitlisted registration (BR-REG-03, BR-REG-04). Neither holds a spot, so nobody is promoted.
   * Permission: organizers, checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError`.
   * Outcome: none.
   */
  async declineRegistration(registrationId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockRegistrationOccurrence(trx, registrationId);
        const registration = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (
          registration.status !== 'pending_approval' &&
          registration.status !== 'waitlisted'
        ) {
          throw new InvalidStateError(
            'Only a pending or waitlisted registration can be declined',
          );
        }
        await trx
          .updateTable('registration')
          .set({ status: 'declined' })
          .where('id', '=', registrationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Accepts a waitlisted registration as the organizer chooses, in any order (BR-REG-04, approval mode).
   * The spots must fit, guests included.
   * Permission: organizers, checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError` (not waitlisted), `OccurrenceFullError`.
   * Outcome: none.
   */
  async acceptFromWaitlist(registrationId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const { occurrence, event } = await lockRegistrationOccurrence(
          trx,
          registrationId,
        );
        const registration = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (registration.status !== 'waitlisted') {
          throw new InvalidStateError(
            'Only a waitlisted registration can be accepted',
          );
        }
        const spots = await registrationSpots(trx, registrationId);
        await assertFits(
          trx,
          occurrence,
          effectiveMaxParticipants(event, occurrence),
          spots,
        );
        await trx
          .updateTable('registration')
          .set({ status: 'confirmed', confirmed_at: sql<Date>`now()` })
          .where('id', '=', registrationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Removes an active participant (BR-REG-02). A confirmed place is freed, so the waitlist is promoted in automatic mode.
   * The organizer who removed the participant is recorded in the audit log (`registration.removed`, BR-MOD-05).
   * Permission: organizers, checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError` (not active).
   * Outcome: the promoted users, to notify.
   */
  async removeParticipant(
    registrationId: string,
    byUserId: string,
  ): Promise<PromotionOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const { occurrence, event } = await lockRegistrationOccurrence(
          trx,
          registrationId,
        );
        const registration = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (
          !(ACTIVE_REGISTRATION_STATUSES as readonly string[]).includes(
            registration.status,
          )
        ) {
          throw new InvalidStateError('The registration is not active');
        }
        const wasConfirmed = registration.status === 'confirmed';
        await trx
          .updateTable('registration')
          .set({ status: 'removed', cancelled_at: sql<Date>`now()` })
          .where('id', '=', registrationId)
          .execute();
        // BR-MOD-05 (handover item 6): who removed the participant is kept in the audit log.
        await writeAudit(trx, byUserId, {
          action: 'registration.removed',
          targetTable: 'registration',
          targetId: registrationId,
          details: { occurrenceId: occurrence.id, eventId: event.id },
        });
        if (!wasConfirmed) {
          return { promotedUserIds: [] };
        }
        return promoteFromWaitlist(trx, event, occurrence);
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Replaces the guests of an active registration (BR-REG-05). For a confirmed registration, the new total must fit.
   * A reduction may free spots, so the waitlist is promoted in automatic mode (BR-REG-04).
   * Errors: `NotFoundError`, `InvalidStateError` (not active), `OccurrenceFullError`, `InvalidInputError`.
   * Outcome: the promoted users, to notify. (Declared as an outcome object: the change can free spots.)
   */
  async setGuests(
    registrationId: string,
    guestNames: string[],
  ): Promise<PromotionOutcome> {
    const names = normalizeGuestNames(guestNames);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const { occurrence, event } = await lockRegistrationOccurrence(
          trx,
          registrationId,
        );
        const registration = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (
          !(ACTIVE_REGISTRATION_STATUSES as readonly string[]).includes(
            registration.status,
          )
        ) {
          throw new InvalidStateError('The registration is not active');
        }
        if (registration.status === 'confirmed') {
          const oldSpots = await registrationSpots(trx, registrationId);
          const taken = await takenSpots(trx, occurrence.id);
          if (
            taken - oldSpots + 1 + names.length >
            effectiveMaxParticipants(event, occurrence)
          ) {
            throw new OccurrenceFullError();
          }
        }
        await trx
          .deleteFrom('registration_guest')
          .where('registration_id', '=', registrationId)
          .execute();
        if (names.length > 0) {
          await trx
            .insertInto('registration_guest')
            .values(
              names.map((name) => ({
                registration_id: registrationId,
                display_name: name,
              })),
            )
            .execute();
        }
        return promoteFromWaitlist(trx, event, occurrence);
      });
    } catch (err) {
      throw mapDbError(err, REGISTRATION_CONSTRAINTS);
    }
  }

  /**
   * Confirmed participants of an occurrence, as seen by the viewer (BR-SOC-02, BR-REG-05).
   * - Null when the event is not visible to the viewer, or the date is neither produced nor materialized.
   * - Users blocked with the viewer are left out.
   * - Guest names are returned for organizers only.
   * - A virtual occurrence lists its playing organizers only (BR-EVT-22).
   * Outcome: the list, or null.
   */
  async listParticipants(
    viewerId: string,
    key: OccurrenceKey,
  ): Promise<Participant[] | null> {
    if (!isLocalDate(key.date)) {
      return null;
    }
    try {
      const event = await this.db
        .selectFrom('event as e')
        .selectAll('e')
        .where('e.id', '=', key.eventId)
        .where(eventVisibleTo(viewerId))
        .executeTakeFirst();
      if (event === undefined) {
        return null;
      }
      const viewerIsOrganizer = await this.isOrganizer(event, viewerId);
      const occurrence = await findOccurrence(
        this.db,
        event.id,
        originalStartOf(event, key.date),
      );
      if (occurrence === undefined) {
        if (!isProducedDate(event, key.date)) {
          return null;
        }
        return this.virtualParticipants(event, viewerId, viewerIsOrganizer);
      }

      const rows = await this.db
        .selectFrom('registration as r')
        .leftJoin('user_account as u', 'u.id', 'r.user_id')
        .select((eb) => [
          'r.id as registration_id',
          'r.user_id',
          'u.username',
          'u.avatar_path',
          eb
            .selectFrom('registration_guest as g')
            .select((gb) => gb.fn.countAll<string>().as('guests'))
            .whereRef('g.registration_id', '=', 'r.id')
            .as('guests'),
        ])
        .where('r.occurrence_id', '=', occurrence.id)
        .where('r.status', '=', 'confirmed')
        .where(
          sql<SqlBool>`NOT ${blockedBetween(sql<string>`${viewerId}::uuid`, sql<string>`r.user_id`)}`,
        )
        .orderBy('r.created_at')
        .orderBy('r.id')
        .execute();
      const guestNames = viewerIsOrganizer
        ? await this.guestNamesOf(rows.map((row) => row.registration_id))
        : new Map<string, string[]>();
      const organizerIds = await this.organizerIds(event);
      return rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        avatarPath: row.avatar_path,
        isOrganizer: row.user_id !== null && organizerIds.has(row.user_id),
        guestCount: Number(row.guests ?? 0),
        guestNames: viewerIsOrganizer
          ? (guestNames.get(row.registration_id) ?? [])
          : null,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Waitlisted registrations of an occurrence, oldest first (BR-REG-04). Developers check the organizer role.
   * Outcome: the queue, or an empty list when the occurrence does not exist.
   */
  async listWaitlist(key: OccurrenceKey): Promise<RegistrationQueueEntry[]> {
    return this.listQueue(key, 'waitlisted');
  }

  /**
   * Pending approvals of an occurrence, oldest first (BR-REG-03). Developers check the organizer role.
   * Outcome: the queue, or an empty list when the occurrence does not exist.
   */
  async listPendingApprovals(
    key: OccurrenceKey,
  ): Promise<RegistrationQueueEntry[]> {
    return this.listQueue(key, 'pending_approval');
  }

  /** Lists registrations of one status for an occurrence, ordered by (created_at, id). */
  private async listQueue(
    key: OccurrenceKey,
    status: 'waitlisted' | 'pending_approval',
  ): Promise<RegistrationQueueEntry[]> {
    if (!isLocalDate(key.date)) {
      return [];
    }
    try {
      const event = await this.db
        .selectFrom('event')
        .selectAll()
        .where('id', '=', key.eventId)
        .executeTakeFirst();
      if (event === undefined) {
        return [];
      }
      const occurrence = await findOccurrence(
        this.db,
        event.id,
        originalStartOf(event, key.date),
      );
      if (occurrence === undefined) {
        return [];
      }
      const rows = await this.db
        .selectFrom('registration as r')
        .leftJoin('user_account as u', 'u.id', 'r.user_id')
        .select((eb) => [
          'r.id as registration_id',
          'r.user_id',
          'u.username',
          'u.avatar_path',
          'r.created_at',
          eb
            .selectFrom('registration_guest as g')
            .select((gb) => gb.fn.countAll<string>().as('guests'))
            .whereRef('g.registration_id', '=', 'r.id')
            .as('guests'),
        ])
        .where('r.occurrence_id', '=', occurrence.id)
        .where('r.status', '=', status)
        .orderBy('r.created_at')
        .orderBy('r.id')
        .execute();
      return rows.map((row) => ({
        registrationId: row.registration_id,
        userId: row.user_id,
        username: row.username,
        avatarPath: row.avatar_path,
        guestCount: Number(row.guests ?? 0),
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** True when the user owns or co-organizes the event. */
  private async isOrganizer(
    event: { id: string; owner_id: string | null },
    userId: string,
  ): Promise<boolean> {
    if (event.owner_id === userId) {
      return true;
    }
    const row = await this.db
      .selectFrom('event_co_organizer')
      .select('user_id')
      .where('event_id', '=', event.id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Ids of the owner and of the co-organizers who count toward capacity or not. */
  private async organizerIds(event: {
    id: string;
    owner_id: string | null;
  }): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('event_co_organizer')
      .select('user_id')
      .where('event_id', '=', event.id)
      .execute();
    const ids = new Set(rows.map((row) => row.user_id));
    if (event.owner_id !== null) {
      ids.add(event.owner_id);
    }
    return ids;
  }

  /** Guest names of a set of registrations, keyed by registration id. */
  private async guestNamesOf(
    registrationIds: string[],
  ): Promise<Map<string, string[]>> {
    const names = new Map<string, string[]>();
    if (registrationIds.length === 0) {
      return names;
    }
    const rows = await this.db
      .selectFrom('registration_guest')
      .select(['registration_id', 'display_name', 'created_at', 'id'])
      .where('registration_id', 'in', registrationIds)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    for (const row of rows) {
      const list = names.get(row.registration_id) ?? [];
      if (row.display_name !== null) {
        list.push(row.display_name);
      }
      names.set(row.registration_id, list);
    }
    return names;
  }

  /** Playing organizers of a virtual occurrence (BR-EVT-22), block-filtered for the viewer. Never throws. */
  private async virtualParticipants(
    event: EventRow,
    viewerId: string,
    viewerIsOrganizer: boolean,
  ): Promise<Participant[]> {
    const coOrganizers = await this.db
      .selectFrom('event_co_organizer as eco')
      .innerJoin('user_account as u', 'u.id', 'eco.user_id')
      .select(['u.id', 'u.username', 'u.avatar_path'])
      .where('eco.event_id', '=', event.id)
      .where('eco.counts_toward_capacity', '=', true)
      .where(
        sql<SqlBool>`NOT ${blockedBetween(sql<string>`${viewerId}::uuid`, sql<string>`eco.user_id`)}`,
      )
      .orderBy('eco.added_at')
      .orderBy('u.id')
      .execute();
    const owner = await this.db
      .selectFrom('user_account')
      .select(['id', 'username', 'avatar_path'])
      .where('id', '=', event.owner_id)
      .where(
        sql<SqlBool>`NOT ${blockedBetween(sql<string>`${viewerId}::uuid`, sql<string>`${event.owner_id}::uuid`)}`,
      )
      .executeTakeFirst();

    const playing = [
      ...(event.owner_counts_toward_capacity && owner !== undefined
        ? [owner]
        : []),
      ...coOrganizers,
    ];
    return playing.map((user) => ({
      userId: user.id,
      username: user.username,
      avatarPath: user.avatar_path,
      isOrganizer: true,
      guestCount: 0,
      guestNames: viewerIsOrganizer ? [] : null,
    }));
  }
}
