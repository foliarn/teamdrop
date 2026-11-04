import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  AttendanceWindowClosedError,
  DataError,
  DisputeAlreadyExistsError,
  DisputeWindowClosedError,
  InvalidInputError,
  InvalidStateError,
  NotFoundError,
} from '../errors';
import {
  completeLockedOccurrence,
  endedSql,
  occurrenceTiming,
} from '../internal/attendance';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import {
  findOccurrence,
  isProducedDate,
  loadEvent,
  lockOccurrence,
  originalStartOf,
} from '../internal/occurrences';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { isLocalDate } from '../internal/time';
import type { Page, PageRequest } from '../types/common.types';
import type {
  AttendanceEntry,
  CompleteDueOutcome,
  CompletedOccurrence,
  CompleteOccurrenceOutcome,
  OpenDisputeEntry,
  OpenDisputeOutcome,
  ResolveDisputeOutcome,
  StartDueOutcome,
} from '../types/attendance.types';
import type { AttendanceStatus, OccurrenceKey } from '../types/event.types';

/** Default number of occurrences handled by one run of a job. */
const DEFAULT_JOB_LIMIT = 500;

/** Constraints of the attendance tables, mapped to typed errors. */
const ATTENDANCE_CONSTRAINTS: Record<string, () => DataError> = {
  uq_attendance_dispute_registration_id: () => new DisputeAlreadyExistsError(),
  fk_attendance_dispute_registration_id: () =>
    new NotFoundError('Registration not found'),
  fk_attendance_dispute_resolved_by_id: () =>
    new NotFoundError('Moderator not found'),
  fk_registration_attendance_set_by_id: () =>
    new NotFoundError('User not found'),
};

/** Keyset cursor of the open dispute list: creation instant (as PostgreSQL text, full precision) and id. */
type DisputeCursor = { createdAt: string; id: string };

/** Row of the open dispute list. */
type DisputeRow = {
  dispute_id: string;
  reason: string;
  created_at: Date;
  created_at_key: string;
  registration_id: string;
  user_id: string | null;
  username: string | null;
  occurrence_id: string;
  event_id: string;
  title: string;
  starts_at: Date;
  set_by_id: string | null;
  set_by_username: string | null;
};

/** Parses the open dispute cursor. Throws `INVALID_CURSOR` on bad input. */
function parseDisputeCursor(cursor: string): DisputeCursor {
  const value = decodeCursor<Partial<DisputeCursor>>(cursor);
  if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return { createdAt: value.createdAt, id: value.id };
}

/** Throws `InvalidInputError` unless `limit` is a positive integer (job batch size). */
function assertBatchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidInputError('The batch limit must be a positive integer');
  }
}

/**
 * Attendance after an occurrence: start and completion jobs, early completion, attendance declaration, disputes
 * of no-shows and their resolution (BR-EVT-26, BR-ATT-01 to BR-ATT-02, BR-REG-05).
 * Every method is atomic. Permissions are checked by the developers: organizers for attendance and early completion,
 * moderators for dispute resolution and the dispute list. The jobs are called by the developers on a timer.
 */
@Injectable()
export class AttendanceRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Starts the due occurrences (BR-EVT-26): a `scheduled` materialized occurrence of a `published` event whose effective
   * start is at or before now becomes `ongoing`. Virtual occurrences are never started (BR-EVT-03). Rows are selected
   * with `FOR UPDATE SKIP LOCKED` in one statement, so two runs never update the same row.
   * Errors: `InvalidInputError` (a batch limit that is not a positive integer).
   * Outcome: the ids of the occurrences started by this run. Occurrences beyond `limit` wait for the next run.
   */
  async startDueOccurrences(
    limit = DEFAULT_JOB_LIMIT,
  ): Promise<StartDueOutcome> {
    assertBatchLimit(limit);
    try {
      const result = await sql<{ id: string }>`
        WITH due AS (
          SELECT o.id
          FROM event_occurrence o
          JOIN event e ON e.id = o.event_id
          WHERE o.status = 'scheduled'
            AND e.status = 'published'
            AND o.starts_at <= now()
          ORDER BY o.starts_at, o.id
          LIMIT ${limit}
          FOR UPDATE OF o SKIP LOCKED
        )
        UPDATE event_occurrence o
        SET status = 'ongoing'
        FROM due
        WHERE o.id = due.id
        RETURNING o.id
      `.execute(this.db);
      return { startedOccurrenceIds: result.rows.map((row) => row.id) };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Completes the due occurrences (BR-EVT-26, BR-ATT-01, BR-REG-05): a `scheduled` or `ongoing` materialized occurrence
   * whose effective end (start + duration) is at or before now becomes `completed`. Each occurrence is completed in its
   * own transaction, with its row locked `FOR UPDATE SKIP LOCKED` and the due condition checked again under the lock,
   * so two runs never complete the same occurrence. Confirmed registrations without attendance become `attended`
   * (explicit attendance is kept), and guest names are erased (see `completeLockedOccurrence`).
   * Errors: `InvalidInputError` (a batch limit that is not a positive integer).
   * Outcome: the completed occurrences with their confirmed participants (users with an account). Occurrences beyond
   * `limit` wait for the next run.
   */
  async completeDueOccurrences(
    limit = DEFAULT_JOB_LIMIT,
  ): Promise<CompleteDueOutcome> {
    assertBatchLimit(limit);
    let candidates: { id: string }[];
    try {
      candidates = await this.db
        .selectFrom('event_occurrence as o')
        .innerJoin('event as e', 'e.id', 'o.event_id')
        .select('o.id')
        .where('o.status', 'in', ['scheduled', 'ongoing'])
        .where(endedSql())
        .orderBy('o.starts_at')
        .orderBy('o.id')
        .limit(limit)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }

    const completed: CompletedOccurrence[] = [];
    for (const candidate of candidates) {
      const outcome = await this.completeIfStillDue(candidate.id);
      if (outcome !== null) {
        completed.push(outcome);
      }
    }
    return { completed };
  }

  /**
   * Completes one started occurrence before its end, at the organizer's request (BR-EVT-26). The occurrence must be
   * materialized and started (effective start at or before now), and neither cancelled nor completed. Completion
   * has the same effects as the automatic one (BR-ATT-01, BR-REG-05).
   * Permission: organizers, checked by the developers. The schema keeps no completed-by column, so `actorId` is not
   * stored.
   * Errors: `NotFoundError` (unknown event or date), `InvalidStateError` (not materialized, not started, cancelled or
   * already completed).
   * Outcome: the confirmed participants with a user id, to notify.
   */
  async completeOccurrence(
    key: OccurrenceKey,
    actorId: string,
  ): Promise<CompleteOccurrenceOutcome> {
    void actorId;
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Occurrence not found');
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
          if (!isProducedDate(event, key.date)) {
            throw new NotFoundError('Occurrence not found');
          }
          // BR-EVT-03: nobody can have registered for a date that was never materialized.
          throw new InvalidStateError(
            'The occurrence is not materialized, so it has not started',
          );
        }
        const occurrence = await lockOccurrence(trx, row.id);
        if (
          occurrence.status !== 'scheduled' &&
          occurrence.status !== 'ongoing'
        ) {
          throw new InvalidStateError(
            'Only a started occurrence that is not cancelled or completed can be completed',
          );
        }
        if (occurrence.upcoming) {
          throw new InvalidStateError('The occurrence has not started yet');
        }
        const participantUserIds = await completeLockedOccurrence(
          trx,
          occurrence.id,
        );
        return { participantUserIds };
      });
    } catch (err) {
      throw mapDbError(err, ATTENDANCE_CONSTRAINTS);
    }
  }

  /**
   * Declares the attendance of a confirmed registration (BR-ATT-01, BR-ATT-03). Organizers declare `no_show` or
   * `excused` (or `attended`) from the effective start until one hour after the effective end. The occurrence can be
   * `ongoing` or already `completed`.
   * Permission: organizers, checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError` (the registration is not confirmed), `AttendanceWindowClosedError`
   * (outside the window).
   * Outcome: none.
   */
  async setAttendance(
    registrationId: string,
    attendance: AttendanceStatus,
    byUserId: string,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const registration = await trx
          .selectFrom('registration')
          .select('occurrence_id')
          .where('id', '=', registrationId)
          .executeTakeFirst();
        if (registration === undefined) {
          throw new NotFoundError('Registration not found');
        }
        // Lock order: occurrence first, then the registration (business-rules section 1.4).
        await lockOccurrence(trx, registration.occurrence_id);
        const current = await trx
          .selectFrom('registration')
          .select('status')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        // BR-ATT-03: only a confirmed registration carries attendance.
        if (current.status !== 'confirmed') {
          throw new InvalidStateError(
            'Only a confirmed registration can have an attendance',
          );
        }
        // BR-ATT-01: from the effective start until one hour after the effective end.
        const timing = await occurrenceTiming(trx, registration.occurrence_id);
        if (!timing.started || !timing.attendanceOpen) {
          throw new AttendanceWindowClosedError();
        }
        await trx
          .updateTable('registration')
          .set({
            attendance,
            attendance_set_by_id: byUserId,
            attendance_set_at: sql<Date>`now()`,
          })
          .where('id', '=', registrationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, ATTENDANCE_CONSTRAINTS);
    }
  }

  /**
   * Confirmed registrations of an occurrence with their attendance and dispute status, oldest first (BR-ATT-01,
   * BR-ATT-02). Returns an empty list when the event or the occurrence does not exist (BR-EVT-03).
   * Permission: organizers, checked by the developers.
   * Outcome: the list.
   */
  async listAttendance(key: OccurrenceKey): Promise<AttendanceEntry[]> {
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
        .leftJoin('attendance_dispute as d', 'd.registration_id', 'r.id')
        .select((eb) => [
          'r.id as registration_id',
          'r.user_id',
          sql<string | null>`u.username::text`.as('username'),
          'r.attendance',
          'd.status as dispute_status',
          eb
            .selectFrom('registration_guest as g')
            .select((gb) => gb.fn.countAll<string>().as('guests'))
            .whereRef('g.registration_id', '=', 'r.id')
            .as('guests'),
        ])
        .where('r.occurrence_id', '=', occurrence.id)
        .where('r.status', '=', 'confirmed')
        .orderBy('r.created_at')
        .orderBy('r.id')
        .execute();
      return rows.map((row) => ({
        registrationId: row.registration_id,
        userId: row.user_id,
        username: row.username,
        attendance: row.attendance,
        guestCount: Number(row.guests ?? 0),
        disputeStatus: row.dispute_status,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Disputes a no-show (BR-ATT-02). The registration must belong to the user and carry `no_show`, and the dispute must
   * be opened until seven days after the effective end of the occurrence. One dispute per registration.
   * Errors: `NotFoundError` (no registration of this user), `InvalidInputError` (empty reason),
   * `InvalidStateError` (attendance is not `no_show`), `DisputeWindowClosedError`, `DisputeAlreadyExistsError`.
   * Outcome: the dispute id. Notify a moderator.
   */
  async openDispute(
    registrationId: string,
    userId: string,
    reason: string,
  ): Promise<OpenDisputeOutcome> {
    const text = reason.trim();
    if (text.length === 0) {
      throw new InvalidInputError('The reason cannot be empty');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const owned = await trx
          .selectFrom('registration')
          .select('occurrence_id')
          .where('id', '=', registrationId)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (owned === undefined) {
          throw new NotFoundError('Registration not found');
        }
        await lockOccurrence(trx, owned.occurrence_id);
        const registration = await trx
          .selectFrom('registration')
          .select('attendance')
          .where('id', '=', registrationId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        // BR-ATT-02: only a no-show can be disputed.
        if (registration.attendance !== 'no_show') {
          throw new InvalidStateError('Only a no-show can be disputed');
        }
        // BR-ATT-02: seven days after the effective end.
        const timing = await occurrenceTiming(trx, owned.occurrence_id);
        if (!timing.disputeOpen) {
          throw new DisputeWindowClosedError();
        }
        const dispute = await trx
          .insertInto('attendance_dispute')
          .values({ registration_id: registrationId, reason: text })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { disputeId: dispute.id };
      });
    } catch (err) {
      throw mapDbError(err, ATTENDANCE_CONSTRAINTS);
    }
  }

  /**
   * Decides an open dispute (BR-ATT-02). Upheld: the participant was right, so the attendance becomes `attended`
   * (declared by the moderator, at this instant) whatever the attendance window. Rejected: the attendance stays
   * `no_show`. Both record the moderator and the resolution instant.
   * Permission: moderators, checked by the developers.
   * Errors: `NotFoundError` (unknown dispute or moderator), `InvalidStateError` (already resolved).
   * Outcome: the participant's user id, to notify (NULL after erasure).
   */
  async resolveDispute(
    disputeId: string,
    moderatorId: string,
    uphold: boolean,
  ): Promise<ResolveDisputeOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const found = await trx
          .selectFrom('attendance_dispute as d')
          .innerJoin('registration as r', 'r.id', 'd.registration_id')
          .select(['r.id as registration_id', 'r.occurrence_id', 'r.user_id'])
          .where('d.id', '=', disputeId)
          .executeTakeFirst();
        if (found === undefined) {
          throw new NotFoundError('Dispute not found');
        }
        await lockOccurrence(trx, found.occurrence_id);
        const dispute = await trx
          .selectFrom('attendance_dispute')
          .select('status')
          .where('id', '=', disputeId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (dispute.status !== 'open') {
          throw new InvalidStateError('Only an open dispute can be resolved');
        }
        // BR-ATT-02: an upheld dispute corrects the attendance, whatever the window.
        if (uphold) {
          await trx
            .updateTable('registration')
            .set({
              attendance: 'attended',
              attendance_set_by_id: moderatorId,
              attendance_set_at: sql<Date>`now()`,
            })
            .where('id', '=', found.registration_id)
            .execute();
        }
        await trx
          .updateTable('attendance_dispute')
          .set({
            status: uphold ? 'upheld' : 'rejected',
            resolved_by_id: moderatorId,
            resolved_at: sql<Date>`now()`,
          })
          .where('id', '=', disputeId)
          .execute();
        return { userId: found.user_id };
      });
    } catch (err) {
      throw mapDbError(err, ATTENDANCE_CONSTRAINTS);
    }
  }

  /**
   * Open disputes, oldest first, by keyset on (created_at, id) (BR-ATT-02).
   * Permission: moderators, checked by the developers.
   * Errors: `INVALID_CURSOR` (through `DataError`) on a bad cursor.
   * Outcome: one page of open disputes with the occurrence and the organizer who declared the no-show.
   */
  async listOpenDisputes(
    page: PageRequest = {},
  ): Promise<Page<OpenDisputeEntry>> {
    const limit = clampLimit(page.limit);
    const cursor =
      page.cursor === undefined ? null : parseDisputeCursor(page.cursor);
    try {
      const after =
        cursor === null
          ? sql``
          : sql`AND (d.created_at, d.id) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`;
      const result = await sql<DisputeRow>`
        SELECT
          d.id AS dispute_id,
          d.reason,
          d.created_at,
          d.created_at::text AS created_at_key,
          d.registration_id,
          r.user_id,
          u.username::text AS username,
          o.id AS occurrence_id,
          o.event_id,
          e.title,
          o.starts_at,
          r.attendance_set_by_id AS set_by_id,
          su.username::text AS set_by_username
        FROM attendance_dispute d
        JOIN registration r ON r.id = d.registration_id
        JOIN event_occurrence o ON o.id = r.occurrence_id
        JOIN event e ON e.id = o.event_id
        LEFT JOIN user_account u ON u.id = r.user_id
        LEFT JOIN user_account su ON su.id = r.attendance_set_by_id
        WHERE d.status = 'open'
        ${after}
        ORDER BY d.created_at, d.id
        LIMIT ${limit + 1}
      `.execute(this.db);

      const rows = result.rows;
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      const nextCursor =
        rows.length > limit && last !== undefined
          ? encodeCursor({
              createdAt: last.created_at_key,
              id: last.dispute_id,
            })
          : null;
      return {
        items: pageRows.map((row) => ({
          disputeId: row.dispute_id,
          reason: row.reason,
          createdAt: row.created_at,
          registrationId: row.registration_id,
          user:
            row.user_id === null || row.username === null
              ? null
              : { id: row.user_id, username: row.username },
          occurrence: {
            id: row.occurrence_id,
            eventId: row.event_id,
            title: row.title,
            startsAt: row.starts_at,
          },
          setBy:
            row.set_by_id === null || row.set_by_username === null
              ? null
              : { id: row.set_by_id, username: row.set_by_username },
        })),
        nextCursor,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Completes one occurrence under its row lock, if it is still due after the lock was obtained. Returns null when
   * another run holds the row (`SKIP LOCKED`) or when the row is no longer due (already completed or cancelled).
   */
  private async completeIfStillDue(
    occurrenceId: string,
  ): Promise<CompletedOccurrence | null> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const locked = await trx
          .selectFrom('event_occurrence as o')
          .innerJoin('event as e', 'e.id', 'o.event_id')
          .select(['o.id', 'o.event_id'])
          .where('o.id', '=', occurrenceId)
          .where('o.status', 'in', ['scheduled', 'ongoing'])
          .where(endedSql())
          .forUpdate('o')
          .skipLocked()
          .executeTakeFirst();
        if (locked === undefined) {
          return null;
        }
        const participantUserIds = await completeLockedOccurrence(
          trx,
          locked.id,
        );
        return {
          occurrenceId: locked.id,
          eventId: locked.event_id,
          participantUserIds,
        };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }
}
