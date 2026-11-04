import { type Kysely, sql } from 'kysely';
import type { DB } from './generated/database';
import {
  type EventRow,
  isProducedDate,
  originalDateOf,
  type OccurrenceRow,
  startTimeOf,
} from './occurrences';
import { localToInstant } from './time';

/**
 * Applies a schedule change to materialized, scheduled, upcoming occurrences (BR-EVT-06, BR-EVT-04).
 * `event` is the event AFTER the change.
 * - Dates still produced by the new schedule keep their occurrence: the original start is recomputed with the new
 *   start time. If the effective start was not overridden for that date, it follows the new original start.
 * - Dates no longer produced are cancelled with the reason 'Schedule changed'.
 * The occurrences must be locked by the caller. Returns the ids of the cancelled occurrences.
 */
export async function applyScheduleChange(
  trx: Kysely<DB>,
  event: EventRow,
  actorId: string,
  occurrences: OccurrenceRow[],
): Promise<{ cancelledOccurrenceIds: string[] }> {
  const cancelledOccurrenceIds: string[] = [];
  for (const occurrence of occurrences) {
    const date = originalDateOf(event, occurrence.original_starts_at);
    if (isProducedDate(event, date)) {
      const newOriginal = localToInstant(
        date,
        startTimeOf(event),
        event.time_zone,
      );
      if (newOriginal.getTime() === occurrence.original_starts_at.getTime()) {
        continue;
      }
      // BR-EVT-04: a start that equalled the original start follows the schedule; an explicit override is kept.
      const followsSchedule =
        occurrence.starts_at.getTime() ===
        occurrence.original_starts_at.getTime();
      await trx
        .updateTable('event_occurrence')
        .set({
          original_starts_at: newOriginal,
          ...(followsSchedule ? { starts_at: newOriginal } : {}),
        })
        .where('id', '=', occurrence.id)
        .execute();
    } else {
      // BR-EVT-06: the date is gone from the schedule, so the occurrence is cancelled. Its registrants are returned to the caller.
      await trx
        .updateTable('event_occurrence')
        .set({
          status: 'cancelled',
          cancelled_at: sql<Date>`now()`,
          cancelled_by_id: actorId,
          cancellation_reason: 'Schedule changed',
        })
        .where('id', '=', occurrence.id)
        .execute();
      cancelledOccurrenceIds.push(occurrence.id);
    }
  }
  return { cancelledOccurrenceIds };
}
