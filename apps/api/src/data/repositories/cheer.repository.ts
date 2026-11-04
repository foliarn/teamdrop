import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, type Updateable, sql } from 'kysely';
import {
  AlreadyCheeredError,
  BlockedError,
  CheerNotAllowedError,
  DataError,
  InvalidInputError,
  InvalidReferenceError,
  NotFoundError,
  SelfActionError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import {
  findOccurrence,
  loadEvent,
  originalStartOf,
} from '../internal/occurrences';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { isLocalDate } from '../internal/time';
import {
  asUuid,
  blockedBetween,
  canViewSection,
  isBlocked,
} from '../internal/visibility';
import type {
  CheerCount,
  CheerType,
  CheerableParticipant,
  CreateCheerTypeInput,
  ReceivedCheer,
  UpdateCheerTypePatch,
} from '../types/cheer.types';
import type { Page, PageRequest } from '../types/common.types';
import type { OccurrenceKey, OccurrenceStatus } from '../types/event.types';

/** Constraints of the cheer tables, mapped to typed errors. */
const CHEER_CONSTRAINTS: Record<string, () => DataError> = {
  uq_cheer_giver_recipient_occurrence: () => new AlreadyCheeredError(),
  ck_cheer_not_self: () => new SelfActionError(),
  fk_cheer_giver_id: () => new NotFoundError('User not found'),
  fk_cheer_recipient_id: () => new NotFoundError('User not found'),
  uq_cheer_type_code: () =>
    new InvalidInputError('Cheer type code is already used'),
};

type CheerTypeRow = Selectable<DB['cheer_type']>;

function toCheerType(row: CheerTypeRow): CheerType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function assertText(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInputError(`${name} is required`);
  }
}

/** SQL condition: `userId` attended the occurrence `occurrenceId` (confirmed and `attended`, BR-SOC-11). */
function attendedSql(occurrenceId: string, userId: ReturnType<typeof asUuid>) {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM registration r
    WHERE r.occurrence_id = ${occurrenceId}::uuid AND r.user_id = ${userId}
      AND r.status = 'confirmed' AND r.attendance = 'attended'
  )`;
}

/**
 * Cheers (BR-SOC-11, BR-SOC-12): typed positive feedback between participants who attended the same completed
 * occurrence, at most one per giver, recipient and occurrence, with no deadline. The recipient sees who gave each cheer;
 * everyone else sees only the counts per type. Users blocked with each other cannot cheer each other (BR-SOC-02).
 * The back office manages the cheer types (the developers check the admin role).
 */
@Injectable()
export class CheerRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Gives a cheer (BR-SOC-11). The occurrence must be `completed`, and both users must hold a confirmed registration with
   * attendance `attended` (a validated attendance). There is no deadline. One cheer per giver, recipient and occurrence.
   * Errors: `SelfActionError`; `NotFoundError` (event or occurrence); `CheerNotAllowedError` (not completed, or one of
   * them did not attend); `BlockedError` (BR-SOC-02); `InvalidReferenceError` (unknown or inactive type);
   * `AlreadyCheeredError`.
   * Outcome: the cheer id. Notify the recipient with the `cheer_received` notification type.
   */
  async giveCheer(
    giverId: string,
    recipientId: string,
    key: OccurrenceKey,
    cheerTypeCode: string,
  ): Promise<{ cheerId: string }> {
    if (giverId === recipientId) {
      throw new SelfActionError();
    }
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Occurrence not found');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const occurrence = await this.completedOccurrence(trx, key);
        const both = await trx
          .selectNoFrom([
            attendedSql(occurrence.id, asUuid(giverId)).as('giver'),
            attendedSql(occurrence.id, asUuid(recipientId)).as('recipient'),
          ])
          .executeTakeFirstOrThrow();
        if (!both.giver || !both.recipient) {
          throw new CheerNotAllowedError();
        }
        // BR-SOC-02: no cheers between users blocked with each other.
        if (await isBlocked(trx, giverId, recipientId)) {
          throw new BlockedError();
        }
        const type = await trx
          .selectFrom('cheer_type')
          .select('id')
          .where('code', '=', cheerTypeCode)
          .where('is_active', '=', true)
          .executeTakeFirst();
        if (type === undefined) {
          throw new InvalidReferenceError('Unknown cheer type');
        }
        // BR-SOC-11: one cheer per giver, recipient and occurrence (unique index, race-proof).
        const row = await trx
          .insertInto('cheer')
          .values({
            occurrence_id: occurrence.id,
            giver_id: giverId,
            recipient_id: recipientId,
            cheer_type_id: type.id,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { cheerId: row.id };
      });
    } catch (err) {
      throw mapDbError(err, CHEER_CONSTRAINTS);
    }
  }

  /**
   * Lists the other participants who attended the completed occurrence, with the cheer the viewer already gave each one
   * (BR-SOC-11). Users blocked with the viewer and erased accounts are left out (BR-SOC-02).
   * Errors: `NotFoundError` (event or occurrence).
   * Outcome: `null` when the viewer cannot give cheers there (occurrence not completed, or the viewer did not attend).
   */
  async listCheerableParticipants(
    viewerId: string,
    key: OccurrenceKey,
  ): Promise<CheerableParticipant[] | null> {
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Occurrence not found');
    }
    const viewer = asUuid(viewerId);
    try {
      const event = await loadEvent(this.db, key.eventId);
      const occurrence = await findOccurrence(
        this.db,
        event.id,
        originalStartOf(event, key.date),
      );
      if (occurrence === undefined) {
        throw new NotFoundError('Occurrence not found');
      }
      if (occurrence.status !== 'completed') {
        return null;
      }
      const eligible = await this.db
        .selectNoFrom([attendedSql(occurrence.id, viewer).as('ok')])
        .executeTakeFirstOrThrow();
      if (!eligible.ok) {
        return null;
      }
      const result = await sql<{
        id: string;
        username: string;
        avatar_path: string | null;
        given_code: string | null;
      }>`
        SELECT u.id, u.username, u.avatar_path, ct.code AS given_code
        FROM registration r
        JOIN user_account u ON u.id = r.user_id
        LEFT JOIN cheer c ON c.occurrence_id = r.occurrence_id AND c.giver_id = ${viewer} AND c.recipient_id = u.id
        LEFT JOIN cheer_type ct ON ct.id = c.cheer_type_id
        WHERE r.occurrence_id = ${occurrence.id}::uuid
          AND r.status = 'confirmed' AND r.attendance = 'attended'
          AND u.id <> ${viewer}
          AND NOT ${blockedBetween(viewer, sql<string>`u.id`)}
        ORDER BY u.username, u.id
      `.execute(this.db);
      return result.rows.map((row) => ({
        userId: row.id,
        username: row.username,
        avatarPath: row.avatar_path,
        givenCheerTypeCode: row.given_code,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the cheers the user received, newest first, with who gave each one (BR-SOC-12: only the recipient calls this
   * for themself). Cheers of givers blocked with the user are left out of the list (BR-SOC-02), but still count
   * (BR-SOC-04). An erased giver shows as `giver: null` (BR-GDP-05).
   * Errors: `INVALID_CURSOR`.
   * Outcome: a page.
   */
  async listReceivedCheers(
    userId: string,
    page: PageRequest = {},
  ): Promise<Page<ReceivedCheer>> {
    const limit = clampLimit(page.limit);
    let beforeId: string | undefined;
    if (page.cursor !== undefined) {
      const value = decodeCursor<{ id?: unknown }>(page.cursor);
      if (typeof value.id !== 'string') {
        throw new DataError('INVALID_CURSOR', 'Invalid cursor');
      }
      beforeId = value.id;
    }
    const recipient = asUuid(userId);
    try {
      const result = await sql<{
        id: string;
        type_code: string;
        type_name: string;
        giver_id: string | null;
        giver_username: string | null;
        giver_avatar_path: string | null;
        occurrence_id: string;
        event_id: string;
        title: string;
        starts_at: Date;
        local_date: string;
        created_at: Date;
      }>`
        SELECT c.id, ct.code AS type_code, ct.name AS type_name,
          g.id AS giver_id, g.username AS giver_username, g.avatar_path AS giver_avatar_path,
          o.id AS occurrence_id, e.id AS event_id, e.title, o.starts_at,
          to_char(o.original_starts_at AT TIME ZONE e.time_zone, 'YYYY-MM-DD') AS local_date,
          c.created_at
        FROM cheer c
        JOIN cheer_type ct ON ct.id = c.cheer_type_id
        JOIN event_occurrence o ON o.id = c.occurrence_id
        JOIN event e ON e.id = o.event_id
        LEFT JOIN user_account g ON g.id = c.giver_id
        WHERE c.recipient_id = ${recipient}
          AND NOT ${blockedBetween(recipient, sql<string>`c.giver_id`)}
          ${beforeId === undefined ? sql`` : sql`AND c.id < ${beforeId}::uuid`}
        ORDER BY c.id DESC
        LIMIT ${limit + 1}
      `.execute(this.db);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageRows.map((row) => ({
          id: row.id,
          type: { code: row.type_code, name: row.type_name },
          giver:
            row.giver_id === null || row.giver_username === null
              ? null
              : {
                  userId: row.giver_id,
                  username: row.giver_username,
                  avatarPath: row.giver_avatar_path,
                },
          occurrence: {
            occurrenceId: row.occurrence_id,
            key: { eventId: row.event_id, date: row.local_date },
            title: row.title,
            startsAt: row.starts_at,
          },
          createdAt: row.created_at,
        })),
        nextCursor: hasMore
          ? encodeCursor({ id: pageRows[pageRows.length - 1].id })
          : null,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Counts the cheers a user received, per type (BR-SOC-12: others see only the counts). Every active type is listed,
   * with 0 when none was received, plus inactive types the user received. Gated by the user's `stats_visibility`
   * (BR-ACC-14) and hidden when blocked either way (BR-SOC-02). Counts include every cheer, also from users blocked later
   * (BR-SOC-04).
   * Outcome: the counts ordered by `sort_order`, or `null` when the viewer may not see them (or the user does not exist).
   */
  async getCheerCounts(
    viewerId: string,
    userId: string,
  ): Promise<CheerCount[] | null> {
    const viewer = asUuid(viewerId);
    const owner = asUuid(userId);
    try {
      const visible = await sql<{ ok: boolean }>`
        SELECT ${canViewSection(sql`s.stats_visibility`, viewer, owner)} AS ok
        FROM user_setting s WHERE s.user_id = ${owner}
      `.execute(this.db);
      if (visible.rows[0]?.ok !== true) {
        return null;
      }
      const result = await sql<{ code: string; name: string; count: number }>`
        SELECT ct.code, ct.name, count(c.id)::int AS count
        FROM cheer_type ct
        LEFT JOIN cheer c ON c.cheer_type_id = ct.id AND c.recipient_id = ${owner}
        GROUP BY ct.id, ct.code, ct.name, ct.sort_order, ct.is_active
        HAVING ct.is_active OR count(c.id) > 0
        ORDER BY ct.sort_order, ct.code
      `.execute(this.db);
      return result.rows;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Lists the cheer types by `sort_order`; inactive ones only with `includeInactive` (BR-TECH-12). */
  async listCheerTypes(
    options: { includeInactive?: boolean } = {},
  ): Promise<CheerType[]> {
    try {
      let query = this.db
        .selectFrom('cheer_type')
        .selectAll()
        .orderBy('sort_order')
        .orderBy('code');
      if (options.includeInactive !== true) {
        query = query.where('is_active', '=', true);
      }
      return (await query.execute()).map(toCheerType);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Creates a cheer type (back office; the caller checks the admin role and writes the audit entry).
   * Errors: `InvalidInputError` (code already used, blank code or name).
   */
  async createCheerType(input: CreateCheerTypeInput): Promise<CheerType> {
    assertText(input.code, 'code');
    assertText(input.name, 'name');
    try {
      const row = await this.db
        .insertInto('cheer_type')
        .values({
          code: input.code,
          name: input.name,
          icon: input.icon ?? null,
          sort_order: input.sortOrder,
          ...(input.isActive === undefined
            ? {}
            : { is_active: input.isActive }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCheerType(row);
    } catch (err) {
      throw mapDbError(err, CHEER_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a cheer type (back office). Deactivate a type instead of deleting it: given cheers keep it.
   * Errors: `NotFoundError`, `InvalidInputError`.
   */
  async updateCheerType(
    id: string,
    patch: UpdateCheerTypePatch,
  ): Promise<CheerType> {
    const values: Updateable<DB['cheer_type']> = {};
    if (patch.code !== undefined) {
      assertText(patch.code, 'code');
      values.code = patch.code;
    }
    if (patch.name !== undefined) {
      assertText(patch.name, 'name');
      values.name = patch.name;
    }
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.sortOrder !== undefined) values.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) values.is_active = patch.isActive;
    try {
      const row =
        Object.keys(values).length === 0
          ? await this.db
              .selectFrom('cheer_type')
              .selectAll()
              .where('id', '=', id)
              .executeTakeFirst()
          : await this.db
              .updateTable('cheer_type')
              .set(values)
              .where('id', '=', id)
              .returningAll()
              .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Cheer type not found');
      }
      return toCheerType(row);
    } catch (err) {
      throw mapDbError(err, CHEER_CONSTRAINTS);
    }
  }

  /** Loads the occurrence of `key` and checks it is completed (BR-SOC-11). */
  private async completedOccurrence(
    trx: Kysely<DB>,
    key: OccurrenceKey,
  ): Promise<{ id: string; status: OccurrenceStatus }> {
    const event = await loadEvent(trx, key.eventId);
    const occurrence = await findOccurrence(
      trx,
      event.id,
      originalStartOf(event, key.date),
    );
    if (occurrence === undefined) {
      throw new NotFoundError('Occurrence not found');
    }
    if (occurrence.status !== 'completed') {
      throw new CheerNotAllowedError();
    }
    return { id: occurrence.id, status: occurrence.status };
  }
}
