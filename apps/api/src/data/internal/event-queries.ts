import { type RawBuilder, type SqlBool, sql } from 'kysely';
import type { GeoPoint, LocalDate } from '../types/common.types';
import type {
  EventRecurrenceInput,
  EventStatus,
  EventVisibility,
  OccurrenceStatus,
  OccurrenceSummary,
  RegistrationMode,
} from '../types/event.types';
import { geographyPoint } from './geo';
import { isOrganizerSql } from './event-visibility';

/** Search point and radius of a location query (BR-GDP-02: sent with the request, never stored). */
export type NearFilter = { point: GeoPoint; radiusMeters: number };

/**
 * One event of a search or a single-occurrence read, with the viewer's display values.
 * `lat`/`lng`/`approx` describe the displayed location (BR-EVT-09) and `distance_m` its distance to the search point.
 * Counts come back as strings (int8) and are converted by the mappers.
 */
export type EventSourceRow = {
  event_id: string;
  title: string;
  description: string | null;
  event_status: EventStatus;
  /** NULL when the owner's account was erased without a co-organizer to take over (BR-GDP-04). */
  owner_id: string | null;
  owner_username: string | null;
  community_id: string | null;
  community_name: string | null;
  sport_id: string;
  sport_code: string;
  sport_name: string;
  min_code: string;
  min_rank: number;
  max_code: string;
  max_rank: number;
  adults_only: boolean;
  min_participants: number | null;
  max_participants: number;
  owner_counts_toward_capacity: boolean;
  registration_mode: RegistrationMode;
  visibility: EventVisibility;
  location_hidden: boolean;
  time_zone: string;
  start_date: LocalDate;
  start_time: string;
  duration_minutes: number;
  recurrence_rule: string | null;
  recurrence_until: LocalDate | null;
  recurrence_count: number | null;
  address: string;
  municipality_id: string;
  municipality_name: string;
  lat: number;
  lng: number;
  approx: boolean;
  is_organizer: boolean;
  playing_organizers: string;
  distance_m: number | null;
};

/**
 * One materialized occurrence with its effective values (BR-EVT-04), counts and displayed location.
 * `taken` is the sum of (1 + guests) over confirmed registrations (BR-REG-05).
 */
export type OccurrenceSourceRow = {
  occurrence_id: string;
  event_id: string;
  original_starts_at: Date;
  starts_at: Date;
  occurrence_status: OccurrenceStatus;
  duration_minutes: number;
  max_participants: number;
  address: string;
  municipality_id: string;
  municipality_name: string;
  lat: number;
  lng: number;
  approx: boolean;
  distance_m: number | null;
  taken: string;
  waitlist: string;
};

/** Event rows with the owner, sport, levels, municipality and displayed location of the viewer. */
export function eventSourceSql(
  viewerId: string,
  near: NearFilter | null,
  where: RawBuilder<SqlBool>,
): RawBuilder<EventSourceRow> {
  const distance = near
    ? sql<number>`ST_Distance(pos.disp, ${geographyPoint(near.point)})`
    : sql<number | null>`NULL::double precision`;
  return sql<EventSourceRow>`
    SELECT
      e.id AS event_id,
      e.title,
      e.description,
      e.status AS event_status,
      e.owner_id,
      ou.username::text AS owner_username,
      e.community_id,
      c.name AS community_name,
      e.sport_id,
      sp.code AS sport_code,
      sp.name AS sport_name,
      smin.code AS min_code,
      smin.rank AS min_rank,
      smax.code AS max_code,
      smax.rank AS max_rank,
      e.adults_only,
      e.min_participants,
      e.max_participants,
      e.owner_counts_toward_capacity,
      e.registration_mode,
      e.visibility,
      e.location_hidden,
      e.time_zone,
      e.start_date::text AS start_date,
      e.start_time::text AS start_time,
      e.duration_minutes,
      e.recurrence_rule,
      e.recurrence_until::text AS recurrence_until,
      e.recurrence_count,
      e.address,
      em.id AS municipality_id,
      em.name AS municipality_name,
      ST_Y((pos.disp)::geometry) AS lat,
      ST_X((pos.disp)::geometry) AS lng,
      pos.approx,
      org.is_org AS is_organizer,
      (CASE WHEN e.owner_counts_toward_capacity THEN 1 ELSE 0 END) + (
        SELECT COUNT(*) FROM event_co_organizer eco
        WHERE eco.event_id = e.id AND eco.counts_toward_capacity
      ) AS playing_organizers,
      ${distance} AS distance_m
    FROM event e
    LEFT JOIN user_account ou ON ou.id = e.owner_id
    LEFT JOIN community c ON c.id = e.community_id
    JOIN sport sp ON sp.id = e.sport_id
    JOIN skill_level smin ON smin.id = e.skill_level_min_id
    JOIN skill_level smax ON smax.id = e.skill_level_max_id
    JOIN municipality em ON em.id = e.municipality_id
    CROSS JOIN LATERAL (SELECT ${isOrganizerSql(viewerId)} AS is_org) org
    CROSS JOIN LATERAL (
      SELECT (e.location_hidden AND NOT org.is_org) AS approx
    ) hid
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN hid.approx THEN em.center ELSE e.location END AS disp,
        hid.approx AS approx
    ) pos
    WHERE ${where}
  `;
}

/** Materialized occurrences of the events selected by `eventSourceSql`, with effective values. */
export function occurrenceSourceSql(
  viewerId: string,
  near: NearFilter | null,
  where: RawBuilder<SqlBool>,
): RawBuilder<OccurrenceSourceRow> {
  const viewer = sql<string>`${viewerId}::uuid`;
  const distance = near
    ? sql<number>`ST_Distance(pos.disp, ${geographyPoint(near.point)})`
    : sql<number | null>`NULL::double precision`;
  return sql<OccurrenceSourceRow>`
    SELECT
      o.id AS occurrence_id,
      o.event_id,
      o.original_starts_at,
      o.starts_at,
      o.status AS occurrence_status,
      COALESCE(o.duration_minutes, e.duration_minutes) AS duration_minutes,
      COALESCE(o.max_participants, e.max_participants) AS max_participants,
      COALESCE(o.address, e.address) AS address,
      om.id AS municipality_id,
      om.name AS municipality_name,
      ST_Y((pos.disp)::geometry) AS lat,
      ST_X((pos.disp)::geometry) AS lng,
      pos.approx,
      ${distance} AS distance_m,
      (
        SELECT COALESCE(SUM(1 + (
          SELECT COUNT(*) FROM registration_guest g WHERE g.registration_id = r.id
        )), 0)
        FROM registration r
        WHERE r.occurrence_id = o.id AND r.status = 'confirmed'
      )::text AS taken,
      (
        SELECT COUNT(*) FROM registration r
        WHERE r.occurrence_id = o.id AND r.status = 'waitlisted'
      )::text AS waitlist
    FROM event_occurrence o
    JOIN event e ON e.id = o.event_id
    JOIN municipality om ON om.id = COALESCE(o.municipality_id, e.municipality_id)
    CROSS JOIN LATERAL (SELECT ${isOrganizerSql(viewerId)} AS is_org) org
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM registration vr
        WHERE vr.occurrence_id = o.id
          AND vr.user_id = ${viewer}
          AND vr.status IN ('pending_approval', 'confirmed', 'waitlisted')
      ) AS is_reg
    ) reg
    CROSS JOIN LATERAL (
      SELECT (e.location_hidden AND NOT org.is_org AND NOT reg.is_reg) AS approx
    ) hid
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN hid.approx THEN om.center ELSE COALESCE(o.location, e.location) END AS disp,
        hid.approx AS approx
    ) pos
    WHERE ${where}
  `;
}

/** Recurrence fields of an event source row, as `EventRecurrenceInput`-shaped data. */
export function recurrenceOf(row: EventSourceRow): EventRecurrenceInput | null {
  if (row.recurrence_rule === null) {
    return null;
  }
  return {
    rule: row.recurrence_rule,
    until: row.recurrence_until ?? undefined,
    count: row.recurrence_count ?? undefined,
  };
}

/** Summary of a virtual occurrence (no row yet, BR-EVT-03): effective values are the event's values. */
export function summaryOfVirtual(
  row: EventSourceRow,
  date: LocalDate,
  startsAt: Date,
): OccurrenceSummary {
  const taken = Number(row.playing_organizers);
  return {
    key: { eventId: row.event_id, date },
    eventId: row.event_id,
    title: row.title,
    sport: { id: row.sport_id, code: row.sport_code, name: row.sport_name },
    startsAt,
    durationMinutes: row.duration_minutes,
    location: { lat: row.lat, lng: row.lng },
    locationIsApproximate: row.approx,
    municipality: { id: row.municipality_id, name: row.municipality_name },
    distanceMeters: row.distance_m,
    maxParticipants: row.max_participants,
    takenSpots: taken,
    freeSpots: row.max_participants - taken,
    waitlistCount: 0,
    registrationMode: row.registration_mode,
    visibility: row.visibility,
    adultsOnly: row.adults_only,
    levelRange: { minCode: row.min_code, maxCode: row.max_code },
    isMaterialized: false,
  };
}

/** Summary of a materialized occurrence, with its effective values, counts and displayed location. */
export function summaryOfMaterialized(
  event: EventSourceRow,
  occurrence: OccurrenceSourceRow,
  date: LocalDate,
): OccurrenceSummary {
  const taken = Number(occurrence.taken);
  return {
    key: { eventId: event.event_id, date },
    eventId: event.event_id,
    title: event.title,
    sport: {
      id: event.sport_id,
      code: event.sport_code,
      name: event.sport_name,
    },
    startsAt: occurrence.starts_at,
    durationMinutes: occurrence.duration_minutes,
    location: { lat: occurrence.lat, lng: occurrence.lng },
    locationIsApproximate: occurrence.approx,
    municipality: {
      id: occurrence.municipality_id,
      name: occurrence.municipality_name,
    },
    distanceMeters: occurrence.distance_m,
    maxParticipants: occurrence.max_participants,
    takenSpots: taken,
    freeSpots: occurrence.max_participants - taken,
    waitlistCount: Number(occurrence.waitlist),
    registrationMode: event.registration_mode,
    visibility: event.visibility,
    adultsOnly: event.adults_only,
    levelRange: { minCode: event.min_code, maxCode: event.max_code },
    isMaterialized: true,
  };
}
