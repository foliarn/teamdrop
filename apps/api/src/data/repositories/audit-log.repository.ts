import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DataError, InvalidInputError, NotFoundError } from '../errors';
import { writeAudit } from '../internal/audit';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import type { PageRequest } from '../types/common.types';
import type {
  AuditEntryInput,
  AuditPage,
  ListAuditFilter,
} from '../types/moderation.types';

const AUDIT_CONSTRAINTS: Record<string, () => DataError> = {
  fk_audit_log_actor_id: () => new NotFoundError('Actor not found'),
  fk_audit_log_report_id: () => new NotFoundError('Report not found'),
  ck_audit_log_details_object: () =>
    new InvalidInputError('details must be a JSON object'),
};

/**
 * Audit log (BR-MOD-05): every moderator and admin action, kept 3 years (purged by the database, BR-GDP-09).
 * Report, sanction, dispute, circle invitation rejection and participant removal methods already write their entry in
 * their own transaction. Call `record` for the other actions (back-office CRUD, role changes...). The developers check
 * the admin role before listing.
 */
@Injectable()
export class AuditLogRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Records an action (BR-MOD-05). `details` holds ids and codes only: never emails, birth dates, tokens or message bodies.
   * Errors: `NotFoundError` (actor or report), `InvalidInputError` (details not an object).
   * Outcome: the entry id.
   */
  async record(
    actorId: string,
    entry: AuditEntryInput,
  ): Promise<{ id: string }> {
    if (
      entry.details !== undefined &&
      (typeof entry.details !== 'object' ||
        entry.details === null ||
        Array.isArray(entry.details))
    ) {
      throw new InvalidInputError('details must be a JSON object');
    }
    try {
      return { id: await writeAudit(this.db, actorId, entry) };
    } catch (err) {
      throw mapDbError(err, AUDIT_CONSTRAINTS);
    }
  }

  /**
   * Lists audit entries, newest first, with optional filters (admins).
   * Errors: `INVALID_CURSOR`.
   */
  async list(
    filter: ListAuditFilter = {},
    page: PageRequest = {},
  ): Promise<AuditPage> {
    const limit = clampLimit(page.limit);
    let beforeId: string | undefined;
    if (page.cursor !== undefined) {
      const value = decodeCursor<{ id?: unknown }>(page.cursor);
      if (typeof value.id !== 'string') {
        throw new DataError('INVALID_CURSOR', 'Invalid cursor');
      }
      beforeId = value.id;
    }
    try {
      let query = this.db
        .selectFrom('audit_log')
        .selectAll()
        .orderBy('id', 'desc')
        .limit(limit + 1);
      if (filter.actorId !== undefined) {
        query = query.where('actor_id', '=', filter.actorId);
      }
      if (filter.action !== undefined) {
        query = query.where('action', '=', filter.action);
      }
      if (filter.targetTable !== undefined) {
        query = query.where('target_table', '=', filter.targetTable);
      }
      if (filter.targetId !== undefined) {
        query = query.where('target_id', '=', filter.targetId);
      }
      if (filter.reportId !== undefined) {
        query = query.where('report_id', '=', filter.reportId);
      }
      if (filter.from !== undefined) {
        query = query.where('created_at', '>=', filter.from);
      }
      if (filter.to !== undefined) {
        query = query.where('created_at', '<', filter.to);
      }
      if (beforeId !== undefined) {
        query = query.where('id', '<', beforeId);
      }
      const rows = await query.execute();
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageRows.map((row) => ({
          id: row.id,
          actorId: row.actor_id,
          action: row.action,
          targetTable: row.target_table,
          targetId: row.target_id,
          reportId: row.report_id,
          details: row.details as Record<string, unknown> | null,
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
}
