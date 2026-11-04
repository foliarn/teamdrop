import { type Kysely, type RawBuilder, type SqlBool, sql } from 'kysely';
import { InternalDataError } from '../errors';
import type { DB } from './generated/database';

/** Timing of a materialized occurrence, read with the database clock (BR-EVT-26, BR-ATT-01, BR-ATT-02). */
export type OccurrenceTiming = {
  /** Effective start, from the event or the occurrence override. */
  startsAt: Date;
  /** Effective end: effective start + effective duration (BR-ATT-01). */
  endsAt: Date;
  /** True once the effective start is reached (BR-EVT-26). */
  started: boolean;
  /** True until one hour after the effective end (BR-ATT-01). */
  attendanceOpen: boolean;
  /** True until seven days after the effective end (BR-ATT-02). */
  disputeOpen: boolean;
};

/**
 * True when an occurrence has reached its effective end (BR-EVT-26). Expects the aliases `o` (event_occurrence)
 * and `e` (event) in the surrounding query. Used by the completion job and its locked re-check.
 */
export function endedSql(): RawBuilder<SqlBool> {
  return sql<SqlBool>`(o.starts_at + COALESCE(o.duration_minutes, e.duration_minutes) * interval '1 minute' <= now())`;
}

/**
 * Reads the timing of a materialized occurrence with the database clock. Effective values: the occurrence override,
 * or the event value (BR-EVT-04). Call it inside the transaction that holds the occurrence lock.
 */
export async function occurrenceTiming(
  db: Kysely<DB>,
  occurrenceId: string,
): Promise<OccurrenceTiming> {
  const result = await sql<{
    starts_at: Date;
    ends_at: Date;
    started: boolean;
    attendance_open: boolean;
    dispute_open: boolean;
  }>`
    SELECT
      o.starts_at,
      ends.ends_at,
      (o.starts_at <= now()) AS started,
      (now() <= ends.ends_at + interval '1 hour') AS attendance_open,
      (now() <= ends.ends_at + interval '7 days') AS dispute_open
    FROM event_occurrence o
    JOIN event e ON e.id = o.event_id
    CROSS JOIN LATERAL (
      SELECT o.starts_at + COALESCE(o.duration_minutes, e.duration_minutes) * interval '1 minute' AS ends_at
    ) ends
    WHERE o.id = ${occurrenceId}::uuid
  `.execute(db);
  const row = result.rows[0];
  if (row === undefined) {
    throw new InternalDataError();
  }
  return {
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    started: row.started,
    attendanceOpen: row.attendance_open,
    disputeOpen: row.dispute_open,
  };
}

/**
 * Completes one occurrence whose row the caller has locked, inside the caller's transaction (BR-EVT-26, BR-ATT-01,
 * BR-REG-05). In this order:
 * - the occurrence becomes `completed` with `completed_at = now()` (BR-EVT-26);
 * - every confirmed registration without attendance becomes `attended`; attendance already declared (for example an
 *   explicit `no_show`) is kept (BR-ATT-01). Waitlisted and pending registrations are left unchanged;
 * - the names of all guests of the occurrence are erased, the guest rows are kept for global statistics (BR-REG-05).
 * Returns the confirmed registrants with a user id, to notify.
 */
export async function completeLockedOccurrence(
  trx: Kysely<DB>,
  occurrenceId: string,
): Promise<string[]> {
  await trx
    .updateTable('event_occurrence')
    .set({ status: 'completed', completed_at: sql<Date>`now()` })
    .where('id', '=', occurrenceId)
    .execute();

  // BR-ATT-01: confirmed participants are attended by default.
  await trx
    .updateTable('registration')
    .set({
      attendance: 'attended',
      attendance_set_at: sql<Date>`now()`,
      attendance_set_by_id: null,
    })
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '=', 'confirmed')
    .where('attendance', 'is', null)
    .execute();

  // BR-REG-05: guest names are erased on completion; the rows stay for global statistics.
  await trx
    .updateTable('registration_guest')
    .set({ display_name: null })
    .where(
      'registration_id',
      'in',
      trx
        .selectFrom('registration')
        .select('id')
        .where('occurrence_id', '=', occurrenceId),
    )
    .execute();

  const participants = await trx
    .selectFrom('registration')
    .select('user_id')
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '=', 'confirmed')
    .where('user_id', 'is not', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return participants.flatMap((row) =>
    row.user_id === null ? [] : [row.user_id],
  );
}
