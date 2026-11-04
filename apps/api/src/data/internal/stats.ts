import { type Kysely, sql } from 'kysely';
import type { DB } from './generated/database';
import type {
  ProfileStats,
  Reliability,
  ReliabilityPeriod,
  SportActivity,
} from '../types/stats.types';

/** Share of the sessions above which the main sport makes a specialist (BR-STA-04). */
const SPECIALIST_SHARE = 0.7;
/** Past occurrences needed before the reliability rate is shown (BR-ATT-04). */
const RELIABILITY_MINIMUM = 5;

/**
 * Completed sessions of a user (BR-STA-01): a confirmed registration with attendance `attended` on a `completed`
 * occurrence, own events included. Columns: occurrence_id, sport_id, minutes (planned, BR-STA-02), day (Europe/Paris).
 */
function sessionsCte(userId: string) {
  return sql`
    SELECT o.id AS occurrence_id, e.sport_id,
      COALESCE(o.duration_minutes, e.duration_minutes) AS minutes,
      (o.starts_at AT TIME ZONE 'Europe/Paris')::date AS day
    FROM registration r
    JOIN event_occurrence o ON o.id = r.occurrence_id
    JOIN event e ON e.id = o.event_id
    WHERE r.user_id = ${userId}::uuid
      AND r.status = 'confirmed' AND r.attendance = 'attended' AND o.status = 'completed'
  `;
}

/** Profile statistics, computed on demand from registrations and occurrences (BR-STA-01 to BR-STA-05, BR-STA-09). */
export async function computeProfileStats(
  db: Kysely<DB>,
  userId: string,
): Promise<ProfileStats> {
  const bySport = await sql<{
    sport_id: string;
    code: string;
    name: string;
    sessions: number;
    minutes: number;
  }>`
    WITH s AS (${sessionsCte(userId)})
    SELECT s.sport_id, sp.code, sp.name, count(*)::int AS sessions, sum(s.minutes)::int AS minutes
    FROM s JOIN sport sp ON sp.id = s.sport_id
    GROUP BY s.sport_id, sp.code, sp.name
    ORDER BY sessions DESC, minutes DESC, sp.code
  `.execute(db);

  // BR-STA-03: distinct other users who attended the same occurrences. Guests are not registrations, so they never
  // count (BR-REG-05). An erased user is counted by the anonymous key of the registration (BR-GDP-05).
  const met = await sql<{ people_met: number }>`
    WITH s AS (${sessionsCte(userId)})
    SELECT count(DISTINCT COALESCE(r2.user_id::text, r2.anonymous_key::text))::int AS people_met
    FROM s
    JOIN registration r2 ON r2.occurrence_id = s.occurrence_id
    WHERE r2.status = 'confirmed' AND r2.attendance = 'attended'
      AND r2.user_id IS DISTINCT FROM ${userId}::uuid
  `.execute(db);

  // BR-STA-05: islands of consecutive days (Europe/Paris), no grace period. The current streak is the island that ends
  // today or yesterday: a streak is not broken before the end of a day without a session.
  const streaks = await sql<{ longest: number; current: number }>`
    WITH s AS (${sessionsCte(userId)}),
    days AS (SELECT DISTINCT day FROM s),
    islands AS (
      SELECT day, day - (row_number() OVER (ORDER BY day))::int AS island FROM days
    ),
    runs AS (SELECT count(*)::int AS length, max(day) AS last_day FROM islands GROUP BY island)
    SELECT
      COALESCE(max(length), 0)::int AS longest,
      COALESCE(max(length) FILTER (
        WHERE last_day >= (now() AT TIME ZONE 'Europe/Paris')::date - 1
      ), 0)::int AS current
    FROM runs
  `.execute(db);

  const sports: SportActivity[] = bySport.rows.map((row) => ({
    sportId: row.sport_id,
    code: row.code,
    name: row.name,
    sessions: row.sessions,
    minutes: row.minutes,
  }));
  const sessions = sports.reduce((sum, s) => sum + s.sessions, 0);
  const minutes = sports.reduce((sum, s) => sum + s.minutes, 0);
  const mainBySessions = sports[0] ?? null;
  const mainByHours =
    [...sports].sort(
      (a, b) =>
        b.minutes - a.minutes ||
        b.sessions - a.sessions ||
        a.code.localeCompare(b.code),
    )[0] ?? null;
  return {
    sessions,
    minutes,
    peopleMet: met.rows[0]?.people_met ?? 0,
    mainSportBySessions: mainBySessions,
    mainSportByHours: mainByHours,
    // BR-STA-04: specialist when the main sport is at least 70% of the sessions.
    profile:
      mainBySessions === null
        ? null
        : mainBySessions.sessions >= SPECIALIST_SHARE * sessions
          ? 'specialist'
          : 'all_rounder',
    currentStreakDays: streaks.rows[0]?.current ?? 0,
    longestStreakDays: streaks.rows[0]?.longest ?? 0,
    bySport: sports,
  };
}

function period(
  attended: number,
  noShows: number,
  lateCancellations: number,
): ReliabilityPeriod {
  const denominator = attended + noShows + 0.5 * lateCancellations;
  return {
    attended,
    noShows,
    lateCancellations,
    rate: denominator === 0 ? null : attended / denominator,
  };
}

/**
 * Reliability (BR-ATT-04): attended / (attended + no_show + 0.5 × late cancellations), all time and over the last 90
 * days (by occurrence start). `excused` and normal cancellations are neutral. Hidden until 5 past occurrences.
 */
export async function computeReliability(
  db: Kysely<DB>,
  userId: string,
): Promise<Reliability> {
  const result = await sql<{
    attended: number;
    no_shows: number;
    late: number;
    past: number;
    attended_90: number;
    no_shows_90: number;
    late_90: number;
  }>`
    SELECT
      count(*) FILTER (WHERE done AND r.attendance = 'attended')::int AS attended,
      count(*) FILTER (WHERE done AND r.attendance = 'no_show')::int AS no_shows,
      count(*) FILTER (WHERE late)::int AS late,
      count(*) FILTER (WHERE done OR late)::int AS past,
      count(*) FILTER (WHERE recent AND done AND r.attendance = 'attended')::int AS attended_90,
      count(*) FILTER (WHERE recent AND done AND r.attendance = 'no_show')::int AS no_shows_90,
      count(*) FILTER (WHERE recent AND late)::int AS late_90
    FROM registration r
    JOIN event_occurrence o ON o.id = r.occurrence_id
    CROSS JOIN LATERAL (
      SELECT
        (r.status = 'confirmed' AND o.status = 'completed') AS done,
        (r.status = 'cancelled' AND r.is_late_cancellation) AS late,
        (o.starts_at >= now() - interval '90 days' AND o.starts_at <= now()) AS recent
    ) f
    WHERE r.user_id = ${userId}::uuid
  `.execute(db);
  const row = result.rows[0];
  const past = row?.past ?? 0;
  const hidden = past < RELIABILITY_MINIMUM;
  return {
    pastOccurrences: past,
    hidden,
    allTime: hidden
      ? null
      : period(row?.attended ?? 0, row?.no_shows ?? 0, row?.late ?? 0),
    last90Days: hidden
      ? null
      : period(row?.attended_90 ?? 0, row?.no_shows_90 ?? 0, row?.late_90 ?? 0),
  };
}
