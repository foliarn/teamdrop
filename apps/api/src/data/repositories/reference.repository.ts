import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Updateable, sql } from 'kysely';
import { DataError, InvalidInputError, NotFoundError } from '../errors';
import { escapeLike } from '../internal/expressions';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import {
  toMunicipality,
  toRatingSystem,
  toSkillLevel,
  toSport,
} from '../internal/mappers/reference.mapper';
import { municipalityQuery } from '../internal/municipality-query';
import { clampLimit } from '../internal/pagination';
import { KYSELY } from '../internal/kysely';
import type {
  CreateSportInput,
  Municipality,
  RatingGrade,
  RatingSystem,
  SkillLevel,
  Sport,
  UpdateSportPatch,
} from '../types/reference.types';

/** Constraint names of `sport` mapped to `INVALID_INPUT` (uniqueness and checks of the back office input). */
const SPORT_CONSTRAINTS: Record<string, () => DataError> = {
  uq_sport_code: () => new InvalidInputError('Sport code is already used'),
  ck_sport_default_duration_positive: () =>
    new InvalidInputError('Default duration must be positive'),
  ck_sport_default_min_participants: () =>
    new InvalidInputError('Default minimum participants must be at least 1'),
  ck_sport_default_max_participants: () =>
    new InvalidInputError('Default maximum participants must be at least 1'),
  ck_sport_default_participants_order: () =>
    new InvalidInputError(
      'Default minimum participants cannot exceed the maximum',
    ),
};

/**
 * Reference data: sports, skill levels, rating systems and municipalities.
 * Reads are not filtered by viewer. The admin methods are for the back office; the developers check the admin role.
 */
@Injectable()
export class ReferenceRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Lists the sports, ordered by name.
   *
   * Rules: BR-ACC-17 (sports are managed from the back office; inactive sports are hidden from new choices).
   * Errors: none expected (unexpected database errors become `INTERNAL`).
   * Outcome: the sports; inactive sports only when `includeInactive` is true.
   */
  async listSports(
    options: { includeInactive?: boolean } = {},
  ): Promise<Sport[]> {
    try {
      let query = this.db
        .selectFrom('sport')
        .selectAll()
        .orderBy('name')
        .orderBy('id');
      if (options.includeInactive !== true) {
        query = query.where('is_active', '=', true);
      }
      const rows = await query.execute();
      return rows.map(toSport);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns one sport by id, whether active or not.
   *
   * Rules: BR-ACC-17.
   * Errors: `NotFoundError` when the sport does not exist.
   * Outcome: the sport.
   */
  async getSport(id: string): Promise<Sport> {
    try {
      const row = await this.db
        .selectFrom('sport')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Sport not found');
      }
      return toSport(row);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the shared skill levels, lowest first.
   *
   * Rules: BR-ACC-10 (Beginner, Intermediate, Advanced, Expert).
   * Errors: none expected.
   * Outcome: the levels ordered by rank.
   */
  async listSkillLevels(): Promise<SkillLevel[]> {
    try {
      const rows = await this.db
        .selectFrom('skill_level')
        .selectAll()
        .orderBy('rank')
        .execute();
      return rows.map(toSkillLevel);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the official rating systems, optionally for one sport. Each system carries its grades, lowest first.
   *
   * Rules: BR-ACC-11.
   * Errors: none expected.
   * Outcome: the systems ordered by code; grades ordered by rank within each system.
   */
  async listRatingSystems(sportId?: string): Promise<RatingSystem[]> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        let query = trx.selectFrom('rating_system').selectAll().orderBy('code');
        if (sportId !== undefined) {
          query = query.where('sport_id', '=', sportId);
        }
        const systems = await query.execute();
        if (systems.length === 0) {
          return [];
        }
        const grades = await trx
          .selectFrom('rating_grade')
          .selectAll()
          .where(
            'rating_system_id',
            'in',
            systems.map((system) => system.id),
          )
          .orderBy('rank')
          .execute();

        return systems.map((system) => {
          const systemGrades: RatingGrade[] = grades
            .filter((grade) => grade.rating_system_id === system.id)
            .map((grade) => ({
              id: grade.id,
              code: grade.code,
              rank: grade.rank,
            }));
          return toRatingSystem(system, systemGrades);
        });
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Searches municipalities and arrondissements by name. Accent- and case-insensitive (unaccent + pg_trgm).
   * Names starting with the query come first, then the best trigram matches. The parent city is included.
   *
   * Rules: BR-ACC-13, BR-ACC-19, BR-TECH-10.
   * Errors: none expected. A query shorter than 2 characters (after trimming) returns an empty list without querying.
   * Outcome: at most `limit` municipalities (default 10, max 100).
   */
  async searchMunicipalities(
    query: string,
    limit = 10,
  ): Promise<Municipality[]> {
    const term = query.trim();
    if (term.length < 2) {
      return [];
    }
    const prefixPattern = `${escapeLike(term)}%`;
    try {
      const rows = await municipalityQuery(this.db)
        .where((eb) =>
          eb.or([
            sql<boolean>`immutable_unaccent(m.name) ILIKE immutable_unaccent(${prefixPattern})`,
            sql<boolean>`immutable_unaccent(${term}) <% immutable_unaccent(m.name)`,
          ]),
        )
        .orderBy(
          sql`(immutable_unaccent(m.name) ILIKE immutable_unaccent(${prefixPattern}))`,
          'desc',
        )
        .orderBy(
          sql`similarity(immutable_unaccent(m.name), immutable_unaccent(${term}))`,
          'desc',
        )
        .orderBy('m.name')
        .orderBy('m.id')
        .limit(clampLimit(limit))
        .execute();
      return rows.map(toMunicipality);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns one municipality or arrondissement by id, with its parent city.
   *
   * Rules: BR-ACC-13, BR-ACC-19.
   * Errors: `NotFoundError` when it does not exist.
   * Outcome: the municipality.
   */
  async getMunicipality(id: string): Promise<Municipality> {
    try {
      const row = await municipalityQuery(this.db)
        .where('m.id', '=', id)
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Municipality not found');
      }
      return toMunicipality(row);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Creates a sport (back office). The caller checks the admin role.
   *
   * Rules: BR-ACC-17.
   * Errors: `InvalidInputError` when the code is already used or a default is invalid (duration, participants).
   * Outcome: the created sport, active unless `isActive` is false.
   */
  async createSport(input: CreateSportInput): Promise<Sport> {
    try {
      const row = await this.db
        .insertInto('sport')
        .values({
          code: input.code,
          name: input.name,
          is_team_sport: input.isTeamSport,
          environment: input.environment,
          default_duration_minutes: input.defaultDurationMinutes,
          default_min_participants: input.defaultMinParticipants ?? null,
          default_max_participants: input.defaultMaxParticipants ?? null,
          icon: input.icon ?? null,
          ...(input.isActive === undefined
            ? {}
            : { is_active: input.isActive }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toSport(row);
    } catch (err) {
      throw mapDbError(err, SPORT_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a sport (back office). The caller checks the admin role.
   *
   * Rules: BR-ACC-17.
   * Errors: `NotFoundError` when the sport does not exist; `InvalidInputError` on a duplicate code or an invalid default.
   * Outcome: the updated sport.
   */
  async updateSport(id: string, patch: UpdateSportPatch): Promise<Sport> {
    const values: Updateable<DB['sport']> = {};
    if (patch.code !== undefined) values.code = patch.code;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.isTeamSport !== undefined)
      values.is_team_sport = patch.isTeamSport;
    if (patch.environment !== undefined) values.environment = patch.environment;
    if (patch.defaultDurationMinutes !== undefined) {
      values.default_duration_minutes = patch.defaultDurationMinutes;
    }
    if (patch.defaultMinParticipants !== undefined) {
      values.default_min_participants = patch.defaultMinParticipants;
    }
    if (patch.defaultMaxParticipants !== undefined) {
      values.default_max_participants = patch.defaultMaxParticipants;
    }
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.isActive !== undefined) values.is_active = patch.isActive;

    try {
      if (Object.keys(values).length === 0) {
        const current = await this.db
          .selectFrom('sport')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (current === undefined) {
          throw new NotFoundError('Sport not found');
        }
        return toSport(current);
      }
      const row = await this.db
        .updateTable('sport')
        .set(values)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Sport not found');
      }
      return toSport(row);
    } catch (err) {
      throw mapDbError(err, SPORT_CONSTRAINTS);
    }
  }

  /**
   * Activates or deactivates a sport (back office). Inactive sports are hidden from new choices (BR-ACC-17).
   * The caller checks the admin role.
   *
   * Errors: `NotFoundError` when the sport does not exist.
   * Outcome: nothing.
   */
  async setSportActive(id: string, active: boolean): Promise<void> {
    try {
      const result = await this.db
        .updateTable('sport')
        .set({ is_active: active })
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('Sport not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }
}
