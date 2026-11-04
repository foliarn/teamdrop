import { type Kysely, sql } from 'kysely';
import {
  InvalidInputError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors';
import type { DB } from './generated/database';
import { latitudeOf, longitudeOf } from './geo';
import type { GeoPoint, LocalDate } from '../types/common.types';

/** Location fields given by a caller. `undefined` means "not given"; `null` on `venueId` clears the venue. */
export type LocationInput = {
  venueId?: string | null;
  address?: string;
  municipalityId?: string;
  location?: GeoPoint;
};

/** Location fields after the venue has filled the missing ones (BR-EVT-08). */
export type ResolvedLocation = {
  venueId: string | null | undefined;
  address: string | undefined;
  municipalityId: string | undefined;
  location: GeoPoint | undefined;
};

/**
 * Resolves the location of an event or an occurrence (BR-EVT-08).
 * A saved venue is used only when the owner may see it: a private venue is visible to its creator only.
 * Fields that the caller did not give are copied from the venue. Throws `InvalidReferenceError` for an unknown or
 * invisible venue.
 */
export async function resolveLocation(
  db: Kysely<DB>,
  ownerId: string,
  input: LocationInput,
): Promise<ResolvedLocation> {
  if (input.venueId === undefined || input.venueId === null) {
    return {
      venueId: input.venueId,
      address: input.address,
      municipalityId: input.municipalityId,
      location: input.location,
    };
  }
  const venue = await db
    .selectFrom('venue as v')
    .select([
      'v.address',
      'v.municipality_id',
      latitudeOf(sql`v.location`).as('lat'),
      longitudeOf(sql`v.location`).as('lng'),
    ])
    .where('v.id', '=', input.venueId)
    .where((eb) =>
      eb.or([
        eb('v.is_private', '=', false),
        eb('v.created_by_id', '=', ownerId),
      ]),
    )
    .executeTakeFirst();
  if (venue === undefined) {
    throw new InvalidReferenceError('Unknown venue');
  }
  return {
    venueId: input.venueId,
    address: input.address ?? venue.address,
    municipalityId: input.municipalityId ?? venue.municipality_id,
    location: input.location ?? { lat: venue.lat, lng: venue.lng },
  };
}

/** Checks the level range of an event: both levels exist and min rank <= max rank (BR-EVT-01, BR-ACC-10). */
export async function assertLevelRange(
  db: Kysely<DB>,
  minLevelId: string,
  maxLevelId: string,
): Promise<void> {
  const rows = await db
    .selectFrom('skill_level')
    .select(['id', 'rank'])
    .where('id', 'in', [minLevelId, maxLevelId])
    .execute();
  const minRank = rows.find((row) => row.id === minLevelId)?.rank;
  const maxRank = rows.find((row) => row.id === maxLevelId)?.rank;
  if (minRank === undefined || maxRank === undefined) {
    throw new InvalidReferenceError('Unknown skill level');
  }
  if (minRank > maxRank) {
    throw new InvalidInputError('The minimum level is above the maximum level');
  }
}

/** Rank of a skill level, or `InvalidReferenceError` when it does not exist. */
export async function skillLevelRank(
  db: Kysely<DB>,
  levelId: string,
): Promise<number> {
  const row = await db
    .selectFrom('skill_level')
    .select('rank')
    .where('id', '=', levelId)
    .executeTakeFirst();
  if (row === undefined) {
    throw new InvalidReferenceError('Unknown skill level');
  }
  return row.rank;
}

/** The schedule and place of an event, read back from the database (used to detect significant changes). */
export type EventSnapshot = {
  startDate: LocalDate;
  startTime: string;
  recurrenceRule: string | null;
  recurrenceUntil: LocalDate | null;
  recurrenceCount: number | null;
  durationMinutes: number;
  venueId: string | null;
  address: string;
  municipalityId: string;
  lat: number;
  lng: number;
  skillLevelMinId: string;
  skillLevelMaxId: string;
  adultsOnly: boolean;
};

/** Effective values of one occurrence (override or event value), read back from the database. */
export type OccurrenceSnapshot = {
  startsAt: number;
  durationMinutes: number;
  venueId: string | null;
  address: string;
  municipalityId: string;
  lat: number;
  lng: number;
};

/** Reads the schedule and place of an event. Call it with the event locked to get a stable value. */
export async function snapshotEvent(
  db: Kysely<DB>,
  eventId: string,
): Promise<EventSnapshot> {
  const row = await db
    .selectFrom('event as e')
    .select([
      'e.start_date',
      sql<string>`e.start_time::text`.as('start_time'),
      'e.recurrence_rule',
      'e.recurrence_until',
      'e.recurrence_count',
      'e.duration_minutes',
      'e.venue_id',
      'e.address',
      'e.municipality_id',
      'e.skill_level_min_id',
      'e.skill_level_max_id',
      'e.adults_only',
      latitudeOf(sql`e.location`).as('lat'),
      longitudeOf(sql`e.location`).as('lng'),
    ])
    .where('e.id', '=', eventId)
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Event not found');
  }
  return {
    startDate: row.start_date,
    startTime: row.start_time.slice(0, 5),
    recurrenceRule: row.recurrence_rule,
    recurrenceUntil: row.recurrence_until,
    recurrenceCount: row.recurrence_count,
    durationMinutes: row.duration_minutes,
    venueId: row.venue_id,
    address: row.address,
    municipalityId: row.municipality_id,
    lat: row.lat,
    lng: row.lng,
    skillLevelMinId: row.skill_level_min_id,
    skillLevelMaxId: row.skill_level_max_id,
    adultsOnly: row.adults_only,
  };
}

/** Reads the effective values of an occurrence (BR-EVT-04): its override, or the event value. */
export async function snapshotOccurrence(
  db: Kysely<DB>,
  eventId: string,
  occurrenceId: string,
): Promise<OccurrenceSnapshot> {
  const row = await db
    .selectFrom('event_occurrence as o')
    .innerJoin('event as e', 'e.id', 'o.event_id')
    .select([
      sql<number>`EXTRACT(EPOCH FROM o.starts_at) * 1000`.as('starts_at_ms'),
      sql<number>`COALESCE(o.duration_minutes, e.duration_minutes)`.as(
        'duration_minutes',
      ),
      sql<string | null>`COALESCE(o.venue_id, e.venue_id)`.as('venue_id'),
      sql<string>`COALESCE(o.address, e.address)`.as('address'),
      sql<string>`COALESCE(o.municipality_id, e.municipality_id)`.as(
        'municipality_id',
      ),
      latitudeOf(sql`COALESCE(o.location, e.location)`).as('lat'),
      longitudeOf(sql`COALESCE(o.location, e.location)`).as('lng'),
    ])
    .where('o.id', '=', occurrenceId)
    .where('e.id', '=', eventId)
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Occurrence not found');
  }
  return {
    startsAt: Number(row.starts_at_ms),
    durationMinutes: Number(row.duration_minutes),
    venueId: row.venue_id,
    address: row.address,
    municipalityId: row.municipality_id,
    lat: row.lat,
    lng: row.lng,
  };
}

/** True when the schedule itself changed: start date, start time or recurrence (BR-EVT-07, BR-EVT-06). */
export function isScheduleChanged(
  before: EventSnapshot,
  after: EventSnapshot,
): boolean {
  return (
    before.startDate !== after.startDate ||
    before.startTime !== after.startTime ||
    before.recurrenceRule !== after.recurrenceRule ||
    before.recurrenceUntil !== after.recurrenceUntil ||
    before.recurrenceCount !== after.recurrenceCount
  );
}

/**
 * BR-EVT-07: a significant change is a change of the start date or time, schedule, duration, location
 * (venue, address, point, municipality), level range or adults-only flag.
 */
export function isSignificantEventChange(
  before: EventSnapshot,
  after: EventSnapshot,
): boolean {
  return (
    isScheduleChanged(before, after) ||
    before.durationMinutes !== after.durationMinutes ||
    before.venueId !== after.venueId ||
    before.address !== after.address ||
    before.municipalityId !== after.municipalityId ||
    before.lat !== after.lat ||
    before.lng !== after.lng ||
    before.skillLevelMinId !== after.skillLevelMinId ||
    before.skillLevelMaxId !== after.skillLevelMaxId ||
    before.adultsOnly !== after.adultsOnly
  );
}

/** BR-EVT-07: significant change of one occurrence (start, duration or location). */
export function isSignificantOccurrenceChange(
  before: OccurrenceSnapshot,
  after: OccurrenceSnapshot,
): boolean {
  return (
    before.startsAt !== after.startsAt ||
    before.durationMinutes !== after.durationMinutes ||
    before.venueId !== after.venueId ||
    before.address !== after.address ||
    before.municipalityId !== after.municipalityId ||
    before.lat !== after.lat ||
    before.lng !== after.lng
  );
}
