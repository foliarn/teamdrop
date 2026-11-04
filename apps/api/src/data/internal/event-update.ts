import {
  type InsertObject,
  type Kysely,
  type RawBuilder,
  type Updateable,
  sql,
} from 'kysely';
import {
  CapacityBelowConfirmedError,
  InvalidInputError,
  InvalidStateError,
  NotCoOrganizerError,
} from '../errors';
import type { DB } from './generated/database';
import {
  activeRegistrantIds,
  takenSpots,
  type EventRow,
  type OccurrenceRow,
  lockOccurrence,
  loadEvent,
  materializeOccurrence,
  originalStartOf,
  scheduleOf,
  upcomingScheduledOccurrences,
} from './occurrences';
import { applyScheduleChange } from './schedule-change';
import {
  assertLevelRange,
  isScheduleChanged,
  isSignificantEventChange,
  isSignificantOccurrenceChange,
  resolveLocation,
  snapshotEvent,
  snapshotOccurrence,
} from './event-values';
import { geographyPoint } from './geo';
import {
  addDays,
  instantToLocal,
  isLocalDate,
  isLocalTime,
  localToInstant,
} from './time';
import { expandDates } from './recurrence';
import type {
  UpdateEventOutcome,
  UpdateEventPatch,
} from '../types/event.types';

/** Fields of an occurrence that a single-date edit may change (BR-EVT-04). */
const OCCURRENCE_EDITABLE_FIELDS = new Set<keyof UpdateEventPatch>([
  'startDate',
  'startTime',
  'durationMinutes',
  'venueId',
  'address',
  'municipalityId',
  'location',
  'maxParticipants',
]);

/** Copies an object without some of its keys (no `delete`, typed). */
function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) {
    delete copy[key];
  }
  return copy as Omit<T, K>;
}

/** Checks the time and date formats of a schedule patch. */
function assertScheduleFormats(patch: UpdateEventPatch): void {
  if (patch.startDate !== undefined && !isLocalDate(patch.startDate)) {
    throw new InvalidInputError('Invalid start date');
  }
  if (patch.startTime !== undefined && !isLocalTime(patch.startTime)) {
    throw new InvalidInputError('Invalid start time');
  }
  if (patch.durationMinutes !== undefined && patch.durationMinutes < 1) {
    throw new InvalidInputError('Duration must be at least one minute');
  }
}

/**
 * Builds the column values of an event patch. Level and place fields are resolved here (venue copy, BR-EVT-08).
 * The result is used for an UPDATE, or merged into a copied row for an INSERT (split).
 */
async function eventPatchValues(
  db: Kysely<DB>,
  ownerId: string,
  patch: UpdateEventPatch,
): Promise<{
  values: Updateable<DB['event']>;
  location: RawBuilder<string> | undefined;
}> {
  const values: Updateable<DB['event']> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.sportId !== undefined) values.sport_id = patch.sportId;
  if (patch.skillLevelMinId !== undefined)
    values.skill_level_min_id = patch.skillLevelMinId;
  if (patch.skillLevelMaxId !== undefined)
    values.skill_level_max_id = patch.skillLevelMaxId;
  if (patch.adultsOnly !== undefined) values.adults_only = patch.adultsOnly;
  if (patch.minParticipants !== undefined)
    values.min_participants = patch.minParticipants;
  if (patch.maxParticipants !== undefined)
    values.max_participants = patch.maxParticipants;
  if (patch.registrationMode !== undefined)
    values.registration_mode = patch.registrationMode;
  if (patch.visibility !== undefined) values.visibility = patch.visibility;
  if (patch.circlePriorityHours !== undefined)
    values.circle_priority_hours = patch.circlePriorityHours;
  if (patch.communityId !== undefined) values.community_id = patch.communityId;
  if (patch.locationHidden !== undefined)
    values.location_hidden = patch.locationHidden;
  if (patch.startDate !== undefined) values.start_date = patch.startDate;
  if (patch.startTime !== undefined) values.start_time = patch.startTime;
  if (patch.durationMinutes !== undefined)
    values.duration_minutes = patch.durationMinutes;
  if (patch.recurrence !== undefined) {
    if (patch.recurrence === null) {
      values.recurrence_rule = null;
      values.recurrence_until = null;
      values.recurrence_count = null;
    } else {
      values.recurrence_rule = patch.recurrence.rule;
      values.recurrence_until = patch.recurrence.until ?? null;
      values.recurrence_count = patch.recurrence.count ?? null;
    }
  }

  const location = await resolveLocation(db, ownerId, {
    venueId: patch.venueId,
    address: patch.address,
    municipalityId: patch.municipalityId,
    location: patch.location,
  });
  if (patch.venueId !== undefined) values.venue_id = patch.venueId;
  if (location.address !== undefined) values.address = location.address;
  if (location.municipalityId !== undefined)
    values.municipality_id = location.municipalityId;
  return {
    values,
    location:
      location.location === undefined
        ? undefined
        : geographyPoint(location.location),
  };
}

/**
 * Capacity check of a series change (BR-EVT-06): the new capacity must not be below the taken spots of any upcoming
 * scheduled occurrence that inherits it, nor below the playing organizers of virtual occurrences.
 */
async function assertSeriesCapacity(
  db: Kysely<DB>,
  event: EventRow,
  upcoming: OccurrenceRow[],
): Promise<void> {
  const playing = await db
    .selectFrom('event_co_organizer')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('event_id', '=', event.id)
    .where('counts_toward_capacity', '=', true)
    .executeTakeFirst();
  const playingOrganizers =
    (event.owner_counts_toward_capacity ? 1 : 0) + Number(playing?.count ?? 0);
  if (playingOrganizers > event.max_participants) {
    throw new CapacityBelowConfirmedError();
  }
  for (const occurrence of upcoming) {
    if (occurrence.max_participants !== null) {
      continue;
    }
    const taken = await takenSpots(db, occurrence.id);
    if (taken > event.max_participants) {
      throw new CapacityBelowConfirmedError();
    }
  }
}

/**
 * Edits the whole series (BR-EVT-04, BR-EVT-06, BR-EVT-07). Schedule changes are applied to the upcoming scheduled
 * occurrences. Returns the active registrants of those occurrences (BR-EVT-06).
 */
export async function updateSeries(
  trx: Kysely<DB>,
  event: EventRow,
  actorId: string,
  patch: UpdateEventPatch,
): Promise<UpdateEventOutcome> {
  assertScheduleFormats(patch);
  if (
    patch.skillLevelMinId !== undefined ||
    patch.skillLevelMaxId !== undefined
  ) {
    await assertLevelRange(
      trx,
      patch.skillLevelMinId ?? event.skill_level_min_id,
      patch.skillLevelMaxId ?? event.skill_level_max_id,
    );
  }
  const before = await snapshotEvent(trx, event.id);
  const { values, location } = await eventPatchValues(
    trx,
    event.owner_id,
    patch,
  );
  const changed = Object.keys(values).length > 0 || location !== undefined;
  if (changed) {
    await trx
      .updateTable('event')
      .set({ ...values, ...(location === undefined ? {} : { location }) })
      .where('id', '=', event.id)
      .execute();
  }
  const after = await snapshotEvent(trx, event.id);
  const updated = await loadEvent(trx, event.id);

  // BR-EVT-06: upcoming scheduled occurrences are locked before any count or change.
  const upcoming = await upcomingScheduledOccurrences(trx, event.id);
  if (patch.maxParticipants !== undefined) {
    await assertSeriesCapacity(trx, updated, upcoming);
  }
  const affected = new Set<string>();
  for (const occurrence of upcoming) {
    for (const userId of await activeRegistrantIds(trx, occurrence.id)) {
      affected.add(userId);
    }
  }

  if (isScheduleChanged(before, after)) {
    await applyScheduleChange(trx, updated, actorId, upcoming);
  }

  // BR-EVT-07: a significant change starts the 24-hour withdrawal window of the series.
  const significantChange = isSignificantEventChange(before, after);
  if (significantChange) {
    await trx
      .updateTable('event')
      .set({ significant_change_at: sql<Date>`now()` })
      .where('id', '=', event.id)
      .execute();
  }
  return {
    affectedUserIds: changed
      ? [...affected].filter((id) => id !== actorId)
      : [],
    significantChange,
  };
}

/**
 * Edits one occurrence, identified by its original date (BR-EVT-04). Only the fields listed in
 * `OCCURRENCE_EDITABLE_FIELDS` may be given. The occurrence is materialized first.
 * Returns the active registrants of the occurrence (BR-EVT-06).
 */
export async function updateOccurrence(
  trx: Kysely<DB>,
  event: EventRow,
  actorId: string,
  date: string,
  patch: UpdateEventPatch,
): Promise<UpdateEventOutcome> {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== undefined &&
      !OCCURRENCE_EDITABLE_FIELDS.has(key as keyof UpdateEventPatch)
    ) {
      throw new InvalidInputError(
        `${key} cannot be changed for one occurrence`,
      );
    }
  }
  assertScheduleFormats(patch);

  const { row } = await materializeOccurrence(trx, event, date);
  const occurrence = await lockOccurrence(trx, row.id);
  if (occurrence.status !== 'scheduled') {
    throw new InvalidStateError('Only scheduled occurrences can be edited');
  }
  if (patch.maxParticipants !== undefined && patch.maxParticipants < 1) {
    throw new InvalidInputError('Capacity must be at least one');
  }
  const before = await snapshotOccurrence(trx, event.id, occurrence.id);

  const updates: Updateable<DB['event_occurrence']> = {};
  if (patch.startDate !== undefined || patch.startTime !== undefined) {
    // BR-EVT-04: the override is the effective start of this date only; the original start is unchanged.
    const local = instantToLocal(occurrence.starts_at, event.time_zone);
    updates.starts_at = localToInstant(
      patch.startDate ?? local.date,
      patch.startTime ?? local.time,
      event.time_zone,
    );
  }
  if (patch.durationMinutes !== undefined) {
    updates.duration_minutes = patch.durationMinutes;
  }
  if (patch.maxParticipants !== undefined) {
    updates.max_participants = patch.maxParticipants;
  }
  const location = await resolveLocation(trx, event.owner_id, {
    venueId: patch.venueId,
    address: patch.address,
    municipalityId: patch.municipalityId,
    location: patch.location,
  });
  if (patch.venueId !== undefined) updates.venue_id = patch.venueId;
  if (location.address !== undefined) updates.address = location.address;
  if (location.municipalityId !== undefined)
    updates.municipality_id = location.municipalityId;
  const point =
    location.location === undefined
      ? undefined
      : geographyPoint(location.location);

  if (Object.keys(updates).length === 0 && point === undefined) {
    return { affectedUserIds: [], significantChange: false };
  }
  if (patch.maxParticipants !== undefined) {
    // BR-EVT-06: capacity below the confirmed spots is refused, nothing changes.
    const taken = await takenSpots(trx, occurrence.id);
    if (taken > patch.maxParticipants) {
      throw new CapacityBelowConfirmedError();
    }
  }
  await trx
    .updateTable('event_occurrence')
    .set({ ...updates, ...(point === undefined ? {} : { location: point }) })
    .where('id', '=', occurrence.id)
    .execute();

  const after = await snapshotOccurrence(trx, event.id, occurrence.id);
  // BR-EVT-07: a significant change of this date is recorded on the occurrence.
  const significantChange = isSignificantOccurrenceChange(before, after);
  if (significantChange) {
    await trx
      .updateTable('event_occurrence')
      .set({ significant_change_at: sql<Date>`now()` })
      .where('id', '=', occurrence.id)
      .execute();
  }
  const affected = await activeRegistrantIds(trx, occurrence.id);
  return {
    affectedUserIds: affected.filter((id) => id !== actorId),
    significantChange,
  };
}

/**
 * "This and following" (BR-EVT-05): ends the series the day before `fromDate` and creates a new event from `fromDate`
 * that copies the old one with the patch applied, linked by `split_from_event_id`. Occurrences from `fromDate` on
 * move to the new event with their registrations. Schedule changes are then applied to them.
 * Returns the active registrants of the moved upcoming occurrences (BR-EVT-06).
 */
export async function splitSeries(
  trx: Kysely<DB>,
  event: EventRow,
  actorId: string,
  patch: UpdateEventPatch,
  fromDate: string,
): Promise<UpdateEventOutcome> {
  if (event.recurrence_rule === null) {
    throw new InvalidInputError('"This and following" needs a recurring event');
  }
  if (!isLocalDate(fromDate) || fromDate <= event.start_date) {
    throw new InvalidInputError(
      'fromDate must be after the first date of the series',
    );
  }
  if (patch.recurrence === null) {
    throw new InvalidInputError(
      '"This and following" cannot remove the recurrence',
    );
  }
  assertScheduleFormats(patch);
  if (
    patch.skillLevelMinId !== undefined ||
    patch.skillLevelMaxId !== undefined
  ) {
    await assertLevelRange(
      trx,
      patch.skillLevelMinId ?? event.skill_level_min_id,
      patch.skillLevelMaxId ?? event.skill_level_max_id,
    );
  }

  const before = await snapshotEvent(trx, event.id);
  const endOfOldSeries = addDays(fromDate, -1);

  // Count of dates the old series produced before fromDate: the count of a new series starts from what is left.
  let remainingCount: number | null = null;
  if (event.recurrence_count !== null && patch.recurrence === undefined) {
    const producedBefore = expandDates(
      scheduleOf(event),
      event.start_date,
      endOfOldSeries,
    ).length;
    remainingCount = event.recurrence_count - producedBefore;
    if (remainingCount < 1) {
      throw new InvalidInputError('No occurrence is left after fromDate');
    }
  }

  // The new schedule is anchored on the series start (or the patched start), so that the interval keeps its phase.
  const anchorStart = patch.startDate ?? event.start_date;
  const newRule = patch.recurrence?.rule ?? event.recurrence_rule;
  const newUntil =
    patch.recurrence !== undefined
      ? (patch.recurrence.until ?? null)
      : event.recurrence_until;
  const newCount =
    patch.recurrence !== undefined
      ? (patch.recurrence.count ?? null)
      : remainingCount;
  const firstDates = expandDates(
    {
      startDate: anchorStart,
      rule: newRule,
      until: newUntil,
      count: patch.recurrence?.count ?? null,
    },
    fromDate,
    addDays(fromDate, 400),
  );
  if (firstDates.length === 0) {
    throw new InvalidInputError('No occurrence is left after fromDate');
  }

  // The old series ends the day before fromDate (BR-EVT-05). A count is replaced by that end date.
  const oldUntil =
    event.recurrence_until !== null && event.recurrence_until < endOfOldSeries
      ? event.recurrence_until
      : endOfOldSeries;
  await trx
    .updateTable('event')
    .set({ recurrence_until: oldUntil, recurrence_count: null })
    .where('id', '=', event.id)
    .execute();

  // The new event copies the old one, with the patch applied and the new schedule.
  const { values, location } = await eventPatchValues(
    trx,
    event.owner_id,
    patch,
  );
  const copy = withoutKeys(event, [
    'id',
    'created_at',
    'updated_at',
    'split_from_event_id',
  ]);
  const insertValues: InsertObject<DB, 'event'> = {
    ...copy,
    ...values,
    location: location ?? event.location,
    start_date: firstDates[0],
    recurrence_rule: newRule,
    recurrence_until: newUntil,
    recurrence_count: newCount,
    split_from_event_id: event.id,
  };
  const created = await trx
    .insertInto('event')
    .values(insertValues)
    .returning('id')
    .executeTakeFirstOrThrow();

  // Co-organizers and target circles are copied.
  const coOrganizers = await trx
    .selectFrom('event_co_organizer')
    .selectAll()
    .where('event_id', '=', event.id)
    .execute();
  if (coOrganizers.length > 0) {
    await trx
      .insertInto('event_co_organizer')
      .values(
        coOrganizers.map((row) => ({
          event_id: created.id,
          user_id: row.user_id,
          counts_toward_capacity: row.counts_toward_capacity,
          added_at: row.added_at,
        })),
      )
      .execute();
  }
  const circles = await trx
    .selectFrom('event_circle')
    .select('circle_id')
    .where('event_id', '=', event.id)
    .execute();
  if (circles.length > 0) {
    await trx
      .insertInto('event_circle')
      .values(
        circles.map((row) => ({
          event_id: created.id,
          circle_id: row.circle_id,
        })),
      )
      .execute();
  }

  // Occurrences from fromDate on move to the new event, keeping their registrations (BR-EVT-05).
  const splitInstant = originalStartOf(event, fromDate);
  await trx
    .updateTable('event_occurrence')
    .set({ event_id: created.id })
    .where('event_id', '=', event.id)
    .where('original_starts_at', '>=', splitInstant)
    .execute();

  const newEvent = await loadEvent(trx, created.id);
  const upcoming = await upcomingScheduledOccurrences(trx, created.id);
  if (patch.maxParticipants !== undefined) {
    await assertSeriesCapacity(trx, newEvent, upcoming);
  }
  const affected = new Set<string>();
  for (const occurrence of upcoming) {
    for (const userId of await activeRegistrantIds(trx, occurrence.id)) {
      affected.add(userId);
    }
  }
  await applyScheduleChange(trx, newEvent, actorId, upcoming);

  // BR-EVT-07: the significance is judged on the patch only: the new start date and end are the split itself.
  const after = await snapshotEvent(trx, created.id);
  const significantChange = isSignificantEventChange(
    {
      ...before,
      startDate: after.startDate,
      recurrenceUntil: after.recurrenceUntil,
      recurrenceCount: after.recurrenceCount,
    },
    after,
  );
  if (significantChange) {
    await trx
      .updateTable('event')
      .set({ significant_change_at: sql<Date>`now()` })
      .where('id', '=', created.id)
      .execute();
  }
  return {
    affectedUserIds: [...affected].filter((id) => id !== actorId),
    significantChange,
  };
}

/** Throws `NotCoOrganizerError` when the user is not a co-organizer of the event. */
export async function assertCoOrganizer(
  trx: Kysely<DB>,
  eventId: string,
  userId: string,
): Promise<void> {
  const row = await trx
    .selectFrom('event_co_organizer')
    .select('user_id')
    .where('event_id', '=', eventId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotCoOrganizerError();
  }
}
