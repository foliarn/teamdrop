import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import { InvalidInputError, NotFoundError } from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { isLocalDate } from '../internal/time';
import type {
  AreaFilter,
  CityRanking,
  HeatmapCell,
  HeatmapFilters,
  PlatformStats,
  PopularSport,
  RankingMetric,
  RankingPeriod,
  Season,
  Trend,
  TrendWindow,
} from '../types/analytics.types';
import type { LocalDate } from '../types/common.types';

/** Minimum occurrences for a heatmap cell to be shown (BR-STA-07). */
const HEATMAP_MINIMUM = 3;
/** Minimum active users for a city ranking to be shown (BR-STA-06). */
const RANKING_MINIMUM_USERS = 100;
/** Maximum cells returned by one heatmap read. */
const HEATMAP_MAX_CELLS = 5000;
/** Window lengths in days (BR-STA-08). */
const WINDOW_DAYS: Record<TrendWindow, number> = {
  month: 30,
  season: 91,
  year: 365,
};
const SEASON_MONTHS: Record<Season, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

/** Ratio of change, `null` when there was nothing before. */
function change(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

/** Municipalities of an area: the municipality and, for a city, its arrondissements (BR-ACC-19). */
function areaCondition(
  column: RawBuilder<unknown>,
  area: AreaFilter,
): RawBuilder<unknown> {
  if (area.municipalityId === undefined) {
    return sql`true`;
  }
  return sql`${column} IN (
    SELECT m.id FROM municipality m
    WHERE m.id = ${area.municipalityId}::uuid OR m.parent_municipality_id = ${area.municipalityId}::uuid
  )`;
}

/** Bounds of the current and previous windows, ending yesterday in Europe/Paris (BR-STA-08). */
function windowBounds(window: TrendWindow): RawBuilder<unknown> {
  const days = WINDOW_DAYS[window];
  return sql`
    SELECT
      (now() AT TIME ZONE 'Europe/Paris')::date - ${days}::int AS cur_from,
      (now() AT TIME ZONE 'Europe/Paris')::date - 1 AS cur_to,
      (now() AT TIME ZONE 'Europe/Paris')::date - ${2 * days}::int AS prev_from,
      (now() AT TIME ZONE 'Europe/Paris')::date - ${days + 1}::int AS prev_to
  `;
}

/**
 * Global statistics, read from the anonymous aggregates refreshed by the database (BR-STA-06 to BR-STA-10, DB-JOB):
 * heatmap, city rankings, popular sports and trends, back-office statistics. Never recomputed here
 * (data-layer notes §11). The refresh runs nightly, the current month ranking hourly (BR-STA-09), so reads lag behind.
 * Back-office reads (`getPlatformStats`) are for admins: the developers check the role.
 */
@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Heatmap hexagons (BR-STA-07): held occurrences per H3 cell, summed over the filters. All event visibilities are
   * included. A cell is returned only with at least 3 occurrences. At most 5000 cells, the busiest first.
   * Errors: `InvalidInputError` (bad resolution, month, weekday or hour).
   */
  async getHeatmap(filters: HeatmapFilters): Promise<HeatmapCell[]> {
    if (![6, 8, 9].includes(filters.resolution)) {
      throw new InvalidInputError('Resolution must be 6, 8 or 9');
    }
    for (const month of [filters.fromMonth, filters.toMonth]) {
      if (month !== undefined && !isLocalDate(month)) {
        throw new InvalidInputError('Months are YYYY-MM-DD dates');
      }
    }
    if (
      filters.daysOfWeek?.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
    ) {
      throw new InvalidInputError('Weekdays are 1 to 7');
    }
    for (const hour of [filters.hourFrom, filters.hourTo]) {
      if (
        hour !== undefined &&
        (!Number.isInteger(hour) || hour < 0 || hour > 23)
      ) {
        throw new InvalidInputError('Hours are 0 to 23');
      }
    }
    const conditions: RawBuilder<unknown>[] = [
      sql`resolution = ${filters.resolution}`,
      filters.fromMonth === undefined
        ? sql`month >= (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') - interval '11 months')::date`
        : sql`month >= date_trunc('month', ${filters.fromMonth}::date)::date`,
    ];
    if (filters.toMonth !== undefined) {
      conditions.push(sql`month <= ${filters.toMonth}::date`);
    }
    if (filters.sportId !== undefined) {
      conditions.push(sql`sport_id = ${filters.sportId}::uuid`);
    }
    if (filters.season !== undefined) {
      conditions.push(
        sql`extract(month FROM month)::int = ANY(${SEASON_MONTHS[filters.season]}::int[])`,
      );
    }
    if (filters.daysOfWeek !== undefined && filters.daysOfWeek.length > 0) {
      conditions.push(sql`day_of_week = ANY(${filters.daysOfWeek}::int[])`);
    }
    if (filters.hourFrom !== undefined) {
      conditions.push(sql`hour_of_day >= ${filters.hourFrom}`);
    }
    if (filters.hourTo !== undefined) {
      conditions.push(sql`hour_of_day <= ${filters.hourTo}`);
    }
    const bounds = filters.bounds;
    try {
      const result = await sql<{
        h3_index: string;
        lng: number;
        lat: number;
        occurrences: number;
        participants: number;
      }>`
            WITH cells AS (
              SELECT h3_index, sum(occurrence_count)::int AS occurrences, sum(participant_count)::int AS participants
              FROM heatmap_cell
              WHERE ${sql.join(conditions, sql` AND `)}
              GROUP BY h3_index
              HAVING sum(occurrence_count) >= ${HEATMAP_MINIMUM}
            ),
            centered AS (
              SELECT c.*, h3_cell_to_lat_lng(c.h3_index) AS p FROM cells c
            )
            SELECT h3_index::text AS h3_index, p[0] AS lng, p[1] AS lat, occurrences, participants
            FROM centered
            ${
              bounds === undefined
                ? sql``
                : sql`WHERE p[1] BETWEEN ${bounds.south} AND ${bounds.north}
                       AND p[0] BETWEEN ${bounds.west} AND ${bounds.east}`
            }
            ORDER BY occurrences DESC, h3_index
            LIMIT ${HEATMAP_MAX_CELLS}
          `.execute(this.db);
      return result.rows.map((row) => ({
        h3Index: row.h3_index,
        center: { lat: row.lat, lng: row.lng },
        occurrences: row.occurrences,
        participants: row.participants,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * The viewer's place in the ranking of a city (BR-STA-06): by the events' municipalities, arrondissements grouped under
   * their city, for the current month or all time, by hours or sessions. Shown only with at least 100 active users;
   * users who hide from rankings are left out (BR-ACC-15).
   * Errors: `NotFoundError` (unknown municipality).
   * Outcome: the ranking; `viewer` is `null` when the viewer is not ranked there.
   */
  async getCityRanking(
    viewerId: string,
    cityId: string,
    period: RankingPeriod,
    metric: RankingMetric,
  ): Promise<CityRanking> {
    try {
      const city = await this.db
        .selectFrom('municipality')
        .select(['id', 'name', 'parent_municipality_id'])
        .where('id', '=', cityId)
        .executeTakeFirst();
      if (city === undefined) {
        throw new NotFoundError('Municipality not found');
      }
      // Rankings use the city: an arrondissement is ranked under its parent (BR-ACC-19).
      const rankedCity =
        city.parent_municipality_id === null
          ? city
          : await this.db
              .selectFrom('municipality')
              .select(['id', 'name', 'parent_municipality_id'])
              .where('id', '=', city.parent_municipality_id)
              .executeTakeFirstOrThrow();
      const [ranking] = await this.rankings(viewerId, period, metric, [
        rankedCity.id,
      ]);
      return (
        ranking ?? {
          cityId: rankedCity.id,
          cityName: rankedCity.name,
          period,
          metric,
          activeUsers: 0,
          shown: false,
          viewer: null,
        }
      );
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * The viewer's rankings in every city where the viewer was active over the period (BR-STA-06: a user can rank in
   * several cities), most active city first. Cities under 100 active users are returned with `shown: false`.
   */
  async listMyCityRankings(
    viewerId: string,
    period: RankingPeriod,
    metric: RankingMetric,
  ): Promise<CityRanking[]> {
    try {
      const cities = await sql<{ municipality_id: string }>`
        SELECT municipality_id FROM user_city_activity
        WHERE user_id = ${viewerId}::uuid ${this.periodCondition(period)}
        GROUP BY municipality_id
        ORDER BY sum(${this.metricColumn(metric)}) DESC, municipality_id
      `.execute(this.db);
      if (cities.rows.length === 0) {
        return [];
      }
      const rankings = await this.rankings(
        viewerId,
        period,
        metric,
        cities.rows.map((row) => row.municipality_id),
      );
      const order = cities.rows.map((row) => row.municipality_id);
      return rankings.sort(
        (a, b) => order.indexOf(a.cityId) - order.indexOf(b.cityId),
      );
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Popular sports of an area over a rolling window ending yesterday, compared with the previous window of the same
   * length (BR-STA-08). Most participants first.
   */
  async getPopularSports(
    area: AreaFilter,
    window: TrendWindow,
  ): Promise<PopularSport[]> {
    try {
      const result = await sql<{
        sport_id: string;
        code: string;
        name: string;
        occurrences: number;
        participants: number;
        prev_occurrences: number;
        prev_participants: number;
      }>`
        WITH w AS (${windowBounds(window)})
        SELECT s.id AS sport_id, s.code, s.name,
          COALESCE(sum(a.occurrence_count) FILTER (WHERE a.day BETWEEN w.cur_from AND w.cur_to), 0)::int AS occurrences,
          COALESCE(sum(a.participant_count) FILTER (WHERE a.day BETWEEN w.cur_from AND w.cur_to), 0)::int AS participants,
          COALESCE(sum(a.occurrence_count) FILTER (WHERE a.day BETWEEN w.prev_from AND w.prev_to), 0)::int AS prev_occurrences,
          COALESCE(sum(a.participant_count) FILTER (WHERE a.day BETWEEN w.prev_from AND w.prev_to), 0)::int AS prev_participants
        FROM sport_activity_daily a
        CROSS JOIN w
        JOIN sport s ON s.id = a.sport_id
        WHERE a.day BETWEEN w.prev_from AND w.cur_to
          AND ${areaCondition(sql`a.municipality_id`, area)}
        GROUP BY s.id, s.code, s.name
        ORDER BY participants DESC, occurrences DESC, s.code
      `.execute(this.db);
      return result.rows.map((row) => ({
        sport: { id: row.sport_id, code: row.code, name: row.name },
        occurrences: row.occurrences,
        participants: row.participants,
        previousOccurrences: row.prev_occurrences,
        previousParticipants: row.prev_participants,
        participantChange: change(row.participants, row.prev_participants),
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Trend of an area, optionally for one sport (BR-STA-08): totals of the rolling window ending yesterday and of the
   * previous window of the same length, and the daily series of the current window.
   */
  async getTrends(
    area: AreaFilter,
    window: TrendWindow,
    sportId?: string,
  ): Promise<Trend> {
    const sport =
      sportId === undefined ? sql`true` : sql`a.sport_id = ${sportId}::uuid`;
    try {
      const bounds = await sql<{
        cur_from: string;
        cur_to: string;
        prev_from: string;
        prev_to: string;
      }>`${windowBounds(window)}`.execute(this.db);
      const b = bounds.rows[0];
      const series = await sql<{
        day: string;
        occurrences: number;
        participants: number;
      }>`
        SELECT a.day::text AS day, sum(a.occurrence_count)::int AS occurrences, sum(a.participant_count)::int AS participants
        FROM sport_activity_daily a
        WHERE a.day BETWEEN ${b.prev_from}::date AND ${b.cur_to}::date
          AND ${sport} AND ${areaCondition(sql`a.municipality_id`, area)}
        GROUP BY a.day
        ORDER BY a.day
      `.execute(this.db);
      const inCurrent = series.rows.filter((row) => row.day >= b.cur_from);
      const inPrevious = series.rows.filter((row) => row.day < b.cur_from);
      const total = (rows: typeof series.rows) => ({
        occurrences: rows.reduce((sum, row) => sum + row.occurrences, 0),
        participants: rows.reduce((sum, row) => sum + row.participants, 0),
      });
      const current = total(inCurrent);
      const previous = total(inPrevious);
      return {
        window,
        current: { from: b.cur_from, to: b.cur_to, ...current },
        previous: { from: b.prev_from, to: b.prev_to, ...previous },
        participantChange: change(current.participants, previous.participants),
        series: inCurrent,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Back-office statistics over a range of local days, inclusive (BR-STA-10): the daily rows, users, monthly active
   * users, 30-day retention, no-show rate, reports by status and handling time, top sports and cities.
   * Errors: `InvalidInputError` (bad dates).
   */
  async getPlatformStats(
    from: LocalDate,
    to: LocalDate,
  ): Promise<PlatformStats> {
    if (!isLocalDate(from) || !isLocalDate(to) || from > to) {
      throw new InvalidInputError(
        'from and to are YYYY-MM-DD dates, from <= to',
      );
    }
    try {
      const days = await this.db
        .selectFrom('platform_daily_stat')
        .selectAll()
        .where('day', '>=', from)
        .where('day', '<=', to)
        .orderBy('day')
        .execute();
      const users = await sql<{
        total: number;
        active_30: number;
        cohort: number;
        retained: number;
      }>`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE last_active_at >= now() - interval '30 days')::int AS active_30,
          count(*) FILTER (WHERE created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days')::int AS cohort,
          count(*) FILTER (WHERE created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
                             AND last_active_at >= created_at + interval '30 days')::int AS retained
        FROM user_account
      `.execute(this.db);
      const range = sql`(o.starts_at AT TIME ZONE 'Europe/Paris')::date BETWEEN ${from}::date AND ${to}::date`;
      const attendance = await sql<{ attended: number; no_shows: number }>`
        SELECT count(*) FILTER (WHERE r.attendance = 'attended')::int AS attended,
          count(*) FILTER (WHERE r.attendance = 'no_show')::int AS no_shows
        FROM registration r JOIN event_occurrence o ON o.id = r.occurrence_id
        WHERE o.status = 'completed' AND r.status = 'confirmed' AND ${range}
      `.execute(this.db);
      const reports = await sql<{ status: string; count: number }>`
        SELECT status::text, count(*)::int AS count FROM report GROUP BY status
      `.execute(this.db);
      const handling = await sql<{ hours: number | null }>`
        SELECT avg(extract(epoch FROM closed_at - created_at) / 3600)::float8 AS hours
        FROM report
        WHERE (closed_at AT TIME ZONE 'Europe/Paris')::date BETWEEN ${from}::date AND ${to}::date
      `.execute(this.db);
      const topSports = await sql<{
        sport_id: string;
        code: string;
        name: string;
        participants: number;
      }>`
        SELECT s.id AS sport_id, s.code, s.name, sum(a.participant_count)::int AS participants
        FROM sport_activity_daily a JOIN sport s ON s.id = a.sport_id
        WHERE a.day BETWEEN ${from}::date AND ${to}::date
        GROUP BY s.id, s.code, s.name
        ORDER BY participants DESC, s.code LIMIT 10
      `.execute(this.db);
      const topCities = await sql<{
        municipality_id: string;
        name: string;
        participants: number;
      }>`
        SELECT c.id AS municipality_id, c.name, sum(a.participant_count)::int AS participants
        FROM sport_activity_daily a
        JOIN municipality m ON m.id = a.municipality_id
        JOIN municipality c ON c.id = COALESCE(m.parent_municipality_id, m.id)
        WHERE a.day BETWEEN ${from}::date AND ${to}::date
        GROUP BY c.id, c.name
        ORDER BY participants DESC, c.name LIMIT 10
      `.execute(this.db);

      const u = users.rows[0];
      const att = attendance.rows[0];
      const byStatus = { open: 0, assigned: 0, resolved: 0, dismissed: 0 };
      for (const row of reports.rows) {
        byStatus[row.status as keyof typeof byStatus] = row.count;
      }
      return {
        days: days.map((d) => ({
          day: d.day,
          signups: d.signups,
          activeUsers: d.active_users,
          eventsCreated: d.events_created,
          occurrencesHeld: d.occurrences_held,
          occurrencesCancelled: d.occurrences_cancelled,
          noShows: d.no_shows,
          reportsOpened: d.reports_opened,
          reportsClosed: d.reports_closed,
        })),
        totalUsers: u.total,
        activeUsersLast30Days: u.active_30,
        retention30Days: u.cohort === 0 ? null : u.retained / u.cohort,
        noShowRate:
          att.attended + att.no_shows === 0
            ? null
            : att.no_shows / (att.attended + att.no_shows),
        reports: {
          byStatus,
          averageHandlingHours: handling.rows[0]?.hours ?? null,
        },
        topSports: topSports.rows.map((row) => ({
          sportId: row.sport_id,
          code: row.code,
          name: row.name,
          participants: row.participants,
        })),
        topCities: topCities.rows.map((row) => ({
          municipalityId: row.municipality_id,
          name: row.name,
          participants: row.participants,
        })),
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  private periodCondition(period: RankingPeriod): RawBuilder<unknown> {
    return period === 'current_month'
      ? sql`AND month = date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date`
      : sql``;
  }

  private metricColumn(metric: RankingMetric): RawBuilder<unknown> {
    return metric === 'hours' ? sql`minutes` : sql`sessions`;
  }

  /** Rankings of the given cities for the viewer (BR-STA-06, BR-ACC-15). */
  private async rankings(
    viewerId: string,
    period: RankingPeriod,
    metric: RankingMetric,
    cityIds: string[],
  ): Promise<CityRanking[]> {
    const result = await sql<{
      city_id: string;
      city_name: string;
      active_users: number;
      value: number | null;
      rank: number | null;
      percentile: number | null;
    }>`
      WITH totals AS (
        SELECT a.municipality_id, a.user_id, sum(${this.metricColumn(metric)})::int AS value
        FROM user_city_activity a
        JOIN user_setting s ON s.user_id = a.user_id AND NOT s.hide_from_rankings
        WHERE a.municipality_id = ANY(${cityIds}::uuid[]) ${this.periodCondition(period)}
        GROUP BY a.municipality_id, a.user_id
        HAVING sum(${this.metricColumn(metric)}) > 0
      ),
      ranked AS (
        SELECT municipality_id, user_id, value,
          rank() OVER (PARTITION BY municipality_id ORDER BY value DESC)::int AS rank,
          (100 * percent_rank() OVER (PARTITION BY municipality_id ORDER BY value))::float8 AS percentile,
          count(*) OVER (PARTITION BY municipality_id)::int AS active_users
        FROM totals
      )
      SELECT m.id AS city_id, m.name AS city_name,
        COALESCE((SELECT max(active_users) FROM ranked r WHERE r.municipality_id = m.id), 0)::int AS active_users,
        v.value, v.rank, v.percentile
      FROM municipality m
      LEFT JOIN ranked v ON v.municipality_id = m.id AND v.user_id = ${viewerId}::uuid
      WHERE m.id = ANY(${cityIds}::uuid[])
    `.execute(this.db);
    return result.rows.map((row) => {
      const shown = row.active_users >= RANKING_MINIMUM_USERS;
      return {
        cityId: row.city_id,
        cityName: row.city_name,
        period,
        metric,
        activeUsers: row.active_users,
        shown,
        viewer:
          shown &&
          row.value !== null &&
          row.rank !== null &&
          row.percentile !== null
            ? { value: row.value, rank: row.rank, percentile: row.percentile }
            : null,
      };
    });
  }
}
