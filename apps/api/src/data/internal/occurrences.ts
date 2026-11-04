import { type Kysely, type Selectable, sql } from 'kysely';
import {
  InternalDataError,
  NotFoundError,
  OccurrenceFullError,
} from '../errors';
import type { DB } from './generated/database';
import { expandDates, type RecurrenceInput } from './recurrence';
import { instantToLocal, localToInstant } from './time';
import type { LocalDate } from '../types/common.types';
import type { PromotionOutcome } from '../types/event.types';

/** A row of `event`. */
export type EventRow = Selectable<DB['event']>;
/** A row of `event_occurrence`. */
export type OccurrenceRow = Selectable<DB['event_occurrence']>;

/** Registration statuses that hold a place, or wait for one (BR-REG-02). */
export const ACTIVE_REGISTRATION_STATUSES = [
  'pending_approval',
  'confirmed',
  'waitlisted',
] as const;

/** Local start time 'HH:mm' of the event schedule. */
export function startTimeOf(event: Pick<EventRow, 'start_time'>): string {
  return event.start_time.slice(0, 5);
}

/** Recurrence input of an event row: the schedule used by `expandDates`. */
export function scheduleOf(event: EventRow): RecurrenceInput {
  return {
    startDate: event.start_date,
    rule: event.recurrence_rule,
    until: event.recurrence_until,
    count: event.recurrence_count,
  };
}

/**
 * Original start instant of a date of the event schedule: the identity of the occurrence (BR-EVT-04).
 */
export function originalStartOf(event: EventRow, date: LocalDate): Date {
  return localToInstant(date, startTimeOf(event), event.time_zone);
}

/** Original local date (in the event time zone) of an occurrence identified by its original start instant. */
export function originalDateOf(
  event: EventRow,
  originalStartsAt: Date,
): LocalDate {
  return instantToLocal(originalStartsAt, event.time_zone).date;
}

/**
 * True when `date` is a date produced by the event schedule (BR-EVT-03).
 * Does not look at materialized rows: a cancelled occurrence whose date is gone is not produced any more.
 */
export function isProducedDate(event: EventRow, date: LocalDate): boolean {
  return expandDates(scheduleOf(event), date, date).length > 0;
}

/** Finds the materialized occurrence of an event at an original start instant, if it exists. */
export async function findOccurrence(
  db: Kysely<DB>,
  eventId: string,
  originalStartsAt: Date,
): Promise<OccurrenceRow | undefined> {
  return db
    .selectFrom('event_occurrence')
    .selectAll()
    .where('event_id', '=', eventId)
    .where('original_starts_at', '=', originalStartsAt)
    .executeTakeFirst();
}

/** Loads an event row without locking it. */
export async function loadEvent(
  db: Kysely<DB>,
  eventId: string,
): Promise<EventRow> {
  const row = await db
    .selectFrom('event')
    .selectAll()
    .where('id', '=', eventId)
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Event not found');
  }
  return row;
}

/** Loads an event row and locks it `FOR UPDATE` for the rest of the transaction. */
export async function lockEvent(
  trx: Kysely<DB>,
  eventId: string,
): Promise<EventRow> {
  const row = await trx
    .selectFrom('event')
    .selectAll()
    .where('id', '=', eventId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Event not found');
  }
  return row;
}

/**
 * Materializes the occurrence of `date` if it has no row yet (BR-EVT-03), then returns the row.
 * On first creation, a `confirmed` registration is inserted for the owner (when the owner counts toward capacity)
 * and for every co-organizer who counts toward capacity (BR-EVT-21, BR-EVT-22).
 *
 * Callers must have checked the event rights first. A date that is not produced by the schedule and has no row
 * throws `NotFoundError` (BR-EVT-03). The row is returned unlocked: use `lockOccurrence` before counting spots.
 */
export async function materializeOccurrence(
  trx: Kysely<DB>,
  event: EventRow,
  date: LocalDate,
): Promise<{ row: OccurrenceRow; created: boolean }> {
  const originalStartsAt = originalStartOf(event, date);
  const existing = await findOccurrence(trx, event.id, originalStartsAt);
  if (existing !== undefined) {
    return { row: existing, created: false };
  }
  if (!isProducedDate(event, date)) {
    throw new NotFoundError('Occurrence not found');
  }

  // BR-EVT-03: insert-or-reuse. Two concurrent requests create the row once.
  const inserted = await trx
    .insertInto('event_occurrence')
    .values({
      event_id: event.id,
      original_starts_at: originalStartsAt,
      starts_at: originalStartsAt,
    })
    .onConflict((oc) =>
      oc.constraint('uq_event_occurrence_event_original').doNothing(),
    )
    .returningAll()
    .executeTakeFirst();

  if (inserted === undefined) {
    const row = await findOccurrence(trx, event.id, originalStartsAt);
    if (row === undefined) {
      throw new InternalDataError();
    }
    return { row, created: false };
  }

  // BR-EVT-22, BR-EVT-21: organizers who play hold a registration, as everyone else does.
  const organizerIds: string[] = [];
  if (event.owner_counts_toward_capacity) {
    organizerIds.push(event.owner_id);
  }
  const playingCoOrganizers = await trx
    .selectFrom('event_co_organizer')
    .select('user_id')
    .where('event_id', '=', event.id)
    .where('counts_toward_capacity', '=', true)
    .orderBy('added_at')
    .orderBy('user_id')
    .execute();
  organizerIds.push(...playingCoOrganizers.map((row) => row.user_id));

  if (organizerIds.length > 0) {
    await trx
      .insertInto('registration')
      .values(
        organizerIds.map((userId) => ({
          occurrence_id: inserted.id,
          user_id: userId,
          status: 'confirmed' as const,
          confirmed_at: sql<Date>`now()`,
        })),
      )
      .execute();
  }
  return { row: inserted, created: true };
}

/** Locks an occurrence row `FOR UPDATE` and returns it with `upcoming` (starts after the database now). */
export async function lockOccurrence(
  trx: Kysely<DB>,
  occurrenceId: string,
): Promise<OccurrenceRow & { upcoming: boolean }> {
  const row = await trx
    .selectFrom('event_occurrence')
    .selectAll()
    .select(sql<boolean>`starts_at > now()`.as('upcoming'))
    .where('id', '=', occurrenceId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Occurrence not found');
  }
  return row;
}

/** Effective capacity of an occurrence: its override, or the event value (BR-EVT-04). */
export function effectiveMaxParticipants(
  event: Pick<EventRow, 'max_participants'>,
  occurrence: Pick<OccurrenceRow, 'max_participants'>,
): number {
  return occurrence.max_participants ?? event.max_participants;
}

/** Number of spots a registration takes: itself plus its guests (BR-REG-05). */
export async function registrationSpots(
  db: Kysely<DB>,
  registrationId: string,
): Promise<number> {
  const row = await db
    .selectFrom('registration_guest')
    .select((eb) => eb.fn.countAll<string>().as('guests'))
    .where('registration_id', '=', registrationId)
    .executeTakeFirst();
  return 1 + Number(row?.guests ?? 0);
}

/**
 * Taken spots of a materialized occurrence: the sum of (1 + guests) over its confirmed registrations
 * (BR-REG-05, BR-EVT-21). Call it with the occurrence locked.
 */
export async function takenSpots(
  db: Kysely<DB>,
  occurrenceId: string,
): Promise<number> {
  const row = await sql<{ taken: string }>`
    SELECT COALESCE(SUM(1 + (
      SELECT COUNT(*) FROM registration_guest g WHERE g.registration_id = r.id
    )), 0) AS taken
    FROM registration r
    WHERE r.occurrence_id = ${occurrenceId}::uuid AND r.status = 'confirmed'
  `.execute(db);
  return Number(row.rows[0]?.taken ?? 0);
}

/** Throws `OccurrenceFullError` unless `spots` more spots fit in the occurrence (BR-REG-04). */
export async function assertFits(
  db: Kysely<DB>,
  occurrence: OccurrenceRow,
  maxParticipants: number,
  spots: number,
): Promise<void> {
  const taken = await takenSpots(db, occurrence.id);
  if (taken + spots > maxParticipants) {
    throw new OccurrenceFullError();
  }
}

/**
 * Promotes waitlisted registrations in automatic mode, strictly first come, first served (BR-REG-04).
 * Takes the oldest waitlisted registration (created_at, id). If it fits the remaining capacity it is confirmed and the
 * next one is examined. If it does not fit, the queue stops: nobody behind it is promoted.
 * The occurrence must be locked by the caller. Returns the promoted user ids (notification outcome).
 */
export async function promoteFromWaitlist(
  trx: Kysely<DB>,
  event: EventRow,
  occurrence: OccurrenceRow,
): Promise<PromotionOutcome> {
  // BR-REG-04: approval mode does not promote automatically; organizers decide.
  if (event.registration_mode !== 'automatic') {
    return { promotedUserIds: [] };
  }
  const capacity = effectiveMaxParticipants(event, occurrence);
  const promotedUserIds: string[] = [];

  for (;;) {
    const head = await trx
      .selectFrom('registration as r')
      .select(['r.id', 'r.user_id'])
      .select((eb) =>
        eb
          .selectFrom('registration_guest as g')
          .select((gb) => gb.fn.countAll<string>().as('guests'))
          .whereRef('g.registration_id', '=', 'r.id')
          .as('guests'),
      )
      .where('r.occurrence_id', '=', occurrence.id)
      .where('r.status', '=', 'waitlisted')
      .orderBy('r.created_at')
      .orderBy('r.id')
      .limit(1)
      .executeTakeFirst();
    if (head === undefined) {
      break;
    }
    const needed = 1 + Number(head.guests ?? 0);
    const taken = await takenSpots(trx, occurrence.id);
    if (taken + needed > capacity) {
      // BR-REG-04: strict first come, first served. The head of the queue blocks the rest.
      break;
    }
    await trx
      .updateTable('registration')
      .set({ status: 'confirmed', confirmed_at: sql<Date>`now()` })
      .where('id', '=', head.id)
      .execute();
    if (head.user_id !== null) {
      promotedUserIds.push(head.user_id);
    }
  }
  return { promotedUserIds };
}

/**
 * Whether a cancellation made now is late (BR-REG-06), evaluated by the database clock:
 * the start is less than 24 hours away, and no significant change (event or occurrence) happened in the last 24 hours
 * (BR-EVT-07). Takes the occurrence id; the result is the value to freeze in `is_late_cancellation`.
 */
export async function isLateCancellation(
  db: Kysely<DB>,
  occurrenceId: string,
): Promise<boolean> {
  const row = await sql<{ late: boolean }>`
    SELECT (
      (o.starts_at - now() < interval '24 hours')
      AND NOT COALESCE(
        GREATEST(e.significant_change_at, o.significant_change_at) > now() - interval '24 hours',
        false
      )
    ) AS late
    FROM event_occurrence o
    JOIN event e ON e.id = o.event_id
    WHERE o.id = ${occurrenceId}::uuid
  `.execute(db);
  return row.rows[0]?.late === true;
}

/** Ids of the users with an active registration on an occurrence (distinct, anonymised users excluded). */
export async function activeRegistrantIds(
  db: Kysely<DB>,
  occurrenceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('registration')
    .select('user_id')
    .where('occurrence_id', '=', occurrenceId)
    .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
    .where('user_id', 'is not', null)
    .execute();
  return [
    ...new Set(
      rows.flatMap((row) => (row.user_id === null ? [] : [row.user_id])),
    ),
  ];
}

/** Upcoming materialized occurrences of an event that are still scheduled, oldest first. */
export async function upcomingScheduledOccurrences(
  trx: Kysely<DB>,
  eventId: string,
): Promise<OccurrenceRow[]> {
  return trx
    .selectFrom('event_occurrence')
    .selectAll()
    .where('event_id', '=', eventId)
    .where('status', '=', 'scheduled')
    .where(sql<boolean>`starts_at > now()`)
    .orderBy('starts_at')
    .orderBy('id')
    .forUpdate()
    .execute();
}
