import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, type Updateable, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidReferenceError,
  InvalidStateError,
  NotFoundError,
  SelfActionError,
} from '../errors';
import { writeAudit } from '../internal/audit';
import { hasConversationAccess } from '../internal/conversations';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import type { Page, PageRequest } from '../types/common.types';
import type {
  CreateReportInput,
  CreateReportReasonInput,
  ListReportsFilter,
  MyReport,
  ReportDetails,
  ReportReason,
  ReportStatus,
  ReportSummary,
  ReportTarget,
  ReportTargetDetails,
  UpdateReportReasonPatch,
} from '../types/moderation.types';

/** Constraints of the report tables, mapped to typed errors. */
const REPORT_CONSTRAINTS: Record<string, () => DataError> = {
  uq_report_reason_code: () =>
    new InvalidInputError('Report reason code is already used'),
  fk_report_reporter_id: () => new NotFoundError('User not found'),
  fk_report_assigned_moderator_id: () =>
    new NotFoundError('Moderator not found'),
  fk_audit_log_actor_id: () => new NotFoundError('Moderator not found'),
};

type ReportRow = Selectable<DB['report']> & { reason_code: string };
type ReasonRow = Selectable<DB['report_reason']>;

function toReason(row: ReasonRow): ReportReason {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function targetOf(row: Selectable<DB['report']>): ReportTarget {
  if (row.target_user_id !== null) {
    return { kind: 'user', userId: row.target_user_id };
  }
  if (row.target_event_id !== null) {
    return { kind: 'event', eventId: row.target_event_id };
  }
  if (row.target_message_id !== null) {
    return { kind: 'message', messageId: row.target_message_id };
  }
  return { kind: 'removed' };
}

function toSummary(row: ReportRow): ReportSummary {
  return {
    id: row.id,
    reasonCode: row.reason_code,
    target: targetOf(row),
    status: row.status,
    reporterId: row.reporter_id,
    assignedModeratorId: row.assigned_moderator_id,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    closedAt: row.closed_at,
  };
}

function assertText(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInputError(`${name} is required`);
  }
}

function parseIdCursor(cursor: string): string {
  const value = decodeCursor<{ id?: unknown }>(cursor);
  if (typeof value.id !== 'string') {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return value.id;
}

/**
 * Reports (BR-MOD-01, BR-MOD-02): a user reports exactly one user, event or message with a reason; moderators assign,
 * resolve or dismiss them. Moderator actions write their audit entry in the same transaction (BR-MOD-05). A report is kept
 * when its reporter or target is erased or deleted, without that identity (BR-GDP-04). The developers check the
 * moderator role before calling the moderator methods, and the admin role for the report reasons.
 */
@Injectable()
export class ReportRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Files a report about exactly one target (BR-MOD-01) with an active reason. The target must exist; a message must be
   * in a conversation the reporter has access to. A user cannot report themself.
   * Errors: `InvalidInputError` (not exactly one target), `InvalidReferenceError` (unknown or inactive reason),
   * `NotFoundError` (target, or a message the reporter cannot see), `SelfActionError`.
   * Outcome: the report id.
   */
  async createReport(
    reporterId: string,
    input: CreateReportInput,
  ): Promise<{ reportId: string }> {
    const target = input.target as Partial<
      Record<'userId' | 'eventId' | 'messageId', unknown>
    >;
    const set = (['userId', 'eventId', 'messageId'] as const).filter(
      (k) => typeof target[k] === 'string',
    );
    if (set.length !== 1) {
      throw new InvalidInputError('A report has exactly one target');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const reason = await trx
          .selectFrom('report_reason')
          .select('id')
          .where('code', '=', input.reasonCode)
          .where('is_active', '=', true)
          .executeTakeFirst();
        if (reason === undefined) {
          throw new InvalidReferenceError('Unknown report reason');
        }
        const values = {
          reporter_id: reporterId,
          report_reason_id: reason.id,
          details:
            input.details === undefined || input.details.trim() === ''
              ? null
              : input.details,
          target_user_id: null as string | null,
          target_event_id: null as string | null,
          target_message_id: null as string | null,
        };
        if ('userId' in input.target) {
          if (input.target.userId === reporterId) {
            throw new SelfActionError();
          }
          const found = await trx
            .selectFrom('user_account')
            .select('id')
            .where('id', '=', input.target.userId)
            .executeTakeFirst();
          if (found === undefined) {
            throw new NotFoundError('User not found');
          }
          values.target_user_id = found.id;
        } else if ('eventId' in input.target) {
          const found = await trx
            .selectFrom('event')
            .select('id')
            .where('id', '=', input.target.eventId)
            .executeTakeFirst();
          if (found === undefined) {
            throw new NotFoundError('Event not found');
          }
          values.target_event_id = found.id;
        } else {
          const found = await trx
            .selectFrom('message')
            .select(['id', 'conversation_id'])
            .where('id', '=', input.target.messageId)
            .executeTakeFirst();
          if (
            found === undefined ||
            !(await hasConversationAccess(
              trx,
              reporterId,
              found.conversation_id,
            ))
          ) {
            throw new NotFoundError('Message not found');
          }
          values.target_message_id = found.id;
        }
        const row = await trx
          .insertInto('report')
          .values(values)
          .returning('id')
          .executeTakeFirstOrThrow();
        return { reportId: row.id };
      });
    } catch (err) {
      throw mapDbError(err, REPORT_CONSTRAINTS);
    }
  }

  /**
   * Assigns an open or assigned report to a moderator (BR-MOD-02), or reassigns it. Writes `report.assigned`.
   * Errors: `NotFoundError`, `InvalidStateError` (already resolved or dismissed).
   */
  async assignReport(reportId: string, moderatorId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await this.lockOpen(trx, reportId);
        await trx
          .updateTable('report')
          .set({
            status: 'assigned',
            assigned_moderator_id: moderatorId,
            assigned_at: sql<Date>`now()`,
          })
          .where('id', '=', reportId)
          .execute();
        // BR-MOD-05: every moderator action is audited.
        await writeAudit(trx, moderatorId, {
          action: 'report.assigned',
          targetTable: 'report',
          targetId: reportId,
          reportId,
        });
      });
    } catch (err) {
      throw mapDbError(err, REPORT_CONSTRAINTS);
    }
  }

  /**
   * Resolves a report (BR-MOD-02) with a note of what was decided; sanctions are issued separately with
   * `SanctionRepository` (pass the report id). An open report is assigned to the moderator at the same time.
   * Writes `report.resolved`.
   * Errors: `NotFoundError`, `InvalidStateError` (already closed), `InvalidInputError` (blank note).
   */
  async resolveReport(
    reportId: string,
    moderatorId: string,
    note: string,
  ): Promise<void> {
    await this.close(reportId, moderatorId, note, 'resolved');
  }

  /**
   * Dismisses a report (BR-MOD-02) with a note. Writes `report.dismissed`.
   * Errors: `NotFoundError`, `InvalidStateError` (already closed), `InvalidInputError` (blank note).
   */
  async dismissReport(
    reportId: string,
    moderatorId: string,
    note: string,
  ): Promise<void> {
    await this.close(reportId, moderatorId, note, 'dismissed');
  }

  /**
   * Lists reports for moderators, oldest first (a queue), optionally by status and assigned moderator (BR-MOD-02).
   * Errors: `INVALID_CURSOR`.
   */
  async listReports(
    filter: ListReportsFilter = {},
    page: PageRequest = {},
  ): Promise<Page<ReportSummary>> {
    const limit = clampLimit(page.limit);
    const afterId =
      page.cursor === undefined ? undefined : parseIdCursor(page.cursor);
    try {
      let query = this.baseQuery()
        .orderBy('r.id')
        .limit(limit + 1);
      if (filter.status !== undefined) {
        const statuses: ReportStatus[] = Array.isArray(filter.status)
          ? filter.status
          : [filter.status];
        if (statuses.length === 0) {
          return { items: [], nextCursor: null };
        }
        query = query.where('r.status', 'in', statuses);
      }
      if (filter.assignedModeratorId !== undefined) {
        query = query.where(
          'r.assigned_moderator_id',
          '=',
          filter.assignedModeratorId,
        );
      }
      if (afterId !== undefined) {
        query = query.where('r.id', '>', afterId);
      }
      const rows = await query.execute();
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageRows.map(toSummary),
        nextCursor: hasMore
          ? encodeCursor({ id: pageRows[pageRows.length - 1].id })
          : null,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns a report with its content, for moderators only (BR-MOD-02). A reported message body is included: never log it.
   * Errors: `NotFoundError`.
   */
  async getReport(reportId: string): Promise<ReportDetails> {
    try {
      const row = await this.baseQuery()
        .where('r.id', '=', reportId)
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Report not found');
      }
      return {
        ...toSummary(row),
        details: row.details,
        resolutionNote: row.resolution_note,
        targetDetails: await this.targetDetails(row),
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Lists the reports the user filed, newest first, with their status only. */
  async listMyReports(reporterId: string): Promise<MyReport[]> {
    try {
      const rows = await this.baseQuery()
        .where('r.reporter_id', '=', reporterId)
        .orderBy('r.id', 'desc')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        reasonCode: row.reason_code,
        targetKind: targetOf(row).kind,
        status: row.status,
        createdAt: row.created_at,
        closedAt: row.closed_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Lists the report reasons by `sort_order`; inactive ones only with `includeInactive` (BR-MOD-01, BR-TECH-12). */
  async listReportReasons(
    options: { includeInactive?: boolean } = {},
  ): Promise<ReportReason[]> {
    try {
      let query = this.db
        .selectFrom('report_reason')
        .selectAll()
        .orderBy('sort_order')
        .orderBy('code');
      if (options.includeInactive !== true) {
        query = query.where('is_active', '=', true);
      }
      return (await query.execute()).map(toReason);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Creates a report reason (back office; the caller checks the admin role and writes the audit entry).
   * Errors: `InvalidInputError` (code already used, blank code or name).
   */
  async createReportReason(
    input: CreateReportReasonInput,
  ): Promise<ReportReason> {
    assertText(input.code, 'code');
    assertText(input.name, 'name');
    try {
      const row = await this.db
        .insertInto('report_reason')
        .values({
          code: input.code,
          name: input.name,
          sort_order: input.sortOrder,
          ...(input.isActive === undefined
            ? {}
            : { is_active: input.isActive }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toReason(row);
    } catch (err) {
      throw mapDbError(err, REPORT_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a report reason (back office). Deactivate a reason instead of deleting it.
   * Errors: `NotFoundError`, `InvalidInputError`.
   */
  async updateReportReason(
    id: string,
    patch: UpdateReportReasonPatch,
  ): Promise<ReportReason> {
    const values: Updateable<DB['report_reason']> = {};
    if (patch.code !== undefined) {
      assertText(patch.code, 'code');
      values.code = patch.code;
    }
    if (patch.name !== undefined) {
      assertText(patch.name, 'name');
      values.name = patch.name;
    }
    if (patch.sortOrder !== undefined) values.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) values.is_active = patch.isActive;
    try {
      const row =
        Object.keys(values).length === 0
          ? await this.db
              .selectFrom('report_reason')
              .selectAll()
              .where('id', '=', id)
              .executeTakeFirst()
          : await this.db
              .updateTable('report_reason')
              .set(values)
              .where('id', '=', id)
              .returningAll()
              .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Report reason not found');
      }
      return toReason(row);
    } catch (err) {
      throw mapDbError(err, REPORT_CONSTRAINTS);
    }
  }

  private baseQuery() {
    return this.db
      .selectFrom('report as r')
      .innerJoin('report_reason as rr', 'rr.id', 'r.report_reason_id')
      .selectAll('r')
      .select('rr.code as reason_code');
  }

  /** Locks a report and checks it is open or assigned. */
  private async lockOpen(trx: Kysely<DB>, reportId: string): Promise<void> {
    const row = await trx
      .selectFrom('report')
      .select('status')
      .where('id', '=', reportId)
      .forUpdate()
      .executeTakeFirst();
    if (row === undefined) {
      throw new NotFoundError('Report not found');
    }
    if (row.status !== 'open' && row.status !== 'assigned') {
      throw new InvalidStateError('The report is already closed');
    }
  }

  private async close(
    reportId: string,
    moderatorId: string,
    note: string,
    status: 'resolved' | 'dismissed',
  ): Promise<void> {
    assertText(note, 'note');
    try {
      await this.db.transaction().execute(async (trx) => {
        await this.lockOpen(trx, reportId);
        await trx
          .updateTable('report')
          .set({
            status,
            resolution_note: note,
            closed_at: sql<Date>`now()`,
            assigned_moderator_id: sql<string>`COALESCE(assigned_moderator_id, ${moderatorId}::uuid)`,
            assigned_at: sql<Date>`COALESCE(assigned_at, now())`,
          })
          .where('id', '=', reportId)
          .execute();
        // BR-MOD-05: every moderator action is audited.
        await writeAudit(trx, moderatorId, {
          action:
            status === 'resolved' ? 'report.resolved' : 'report.dismissed',
          targetTable: 'report',
          targetId: reportId,
          reportId,
        });
      });
    } catch (err) {
      throw mapDbError(err, REPORT_CONSTRAINTS);
    }
  }

  private async targetDetails(
    row: Selectable<DB['report']>,
  ): Promise<ReportTargetDetails> {
    if (row.target_user_id !== null) {
      const user = await this.db
        .selectFrom('user_account')
        .select(['id', 'username'])
        .where('id', '=', row.target_user_id)
        .executeTakeFirstOrThrow();
      return { kind: 'user', userId: user.id, username: user.username };
    }
    if (row.target_event_id !== null) {
      const event = await this.db
        .selectFrom('event')
        .select(['id', 'title', 'owner_id'])
        .where('id', '=', row.target_event_id)
        .executeTakeFirstOrThrow();
      return {
        kind: 'event',
        eventId: event.id,
        title: event.title,
        ownerId: event.owner_id,
      };
    }
    if (row.target_message_id !== null) {
      const message = await this.db
        .selectFrom('message as m')
        .leftJoin('user_account as u', 'u.id', 'm.sender_id')
        .select([
          'm.id',
          'm.conversation_id',
          'm.sender_id',
          'u.username',
          'm.body',
          'm.created_at',
        ])
        .where('m.id', '=', row.target_message_id)
        .executeTakeFirstOrThrow();
      return {
        kind: 'message',
        messageId: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        senderUsername: message.username,
        body: message.body,
        createdAt: message.created_at,
      };
    }
    return { kind: 'removed' };
  }
}
