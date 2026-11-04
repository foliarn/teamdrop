import type { GeoPoint, LocalDate } from './common.types';

/** H3 resolution of the heatmap: 6 (France), 8 (city), 9 (neighbourhood) (BR-STA-07). */
export type HeatmapResolution = 6 | 8 | 9;

/** Season of the heatmap filter (BR-STA-07): winter = Dec to Feb, spring = Mar to May, summer = Jun to Aug, autumn = Sep to Nov. */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/** Filters of `AnalyticsRepository.getHeatmap` (BR-STA-07). */
export type HeatmapFilters = {
  resolution: HeatmapResolution;
  sportId?: string;
  /** First and last months included, as first days of month ('YYYY-MM-01'). Default: the last 12 months. */
  fromMonth?: LocalDate;
  toMonth?: LocalDate;
  season?: Season;
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek?: number[];
  /** Start hours included, 0 to 23, inclusive. */
  hourFrom?: number;
  hourTo?: number;
  /** Only cells whose center is inside these bounds (for the visible map). */
  bounds?: { south: number; west: number; north: number; east: number };
};

/** One heatmap hexagon (BR-STA-07). Only cells with at least 3 occurrences are returned. */
export type HeatmapCell = {
  h3Index: string;
  center: GeoPoint;
  occurrences: number;
  participants: number;
};

/** Period of a city ranking (BR-STA-06). */
export type RankingPeriod = 'current_month' | 'all_time';

/** Metric of a city ranking (BR-STA-06). */
export type RankingMetric = 'hours' | 'sessions';

/** The viewer's place in a city ranking (BR-STA-06). */
export type CityRanking = {
  cityId: string;
  cityName: string;
  period: RankingPeriod;
  metric: RankingMetric;
  /** Users active in the city over the period, users who hide from rankings left out. */
  activeUsers: number;
  /** False when the city has fewer than 100 active users: nothing else is shown (BR-STA-06). */
  shown: boolean;
  /** `null` when not shown, or when the viewer is not ranked (no activity there, or hidden from rankings). */
  viewer: {
    /** Sessions, or minutes for `hours`. */
    value: number;
    /** 1 = the most active. */
    rank: number;
    /** 0 to 100: share of the ranked users the viewer is ahead of. */
    percentile: number;
  } | null;
};

/** Rolling window of popular sports and trends: 30, 91 or 365 days ending yesterday (BR-STA-08). */
export type TrendWindow = 'month' | 'season' | 'year';

/** Area of popular sports and trends: a municipality (a city includes its arrondissements), or all of France. */
export type AreaFilter = { municipalityId?: string };

/** Activity of one sport over the window and the previous window of the same length (BR-STA-08). */
export type PopularSport = {
  sport: { id: string; code: string; name: string };
  occurrences: number;
  participants: number;
  previousOccurrences: number;
  previousParticipants: number;
  /** (participants - previous) / previous, `null` when there was nothing before. */
  participantChange: number | null;
};

/** Totals of a trend period. */
export type TrendTotals = {
  from: LocalDate;
  to: LocalDate;
  occurrences: number;
  participants: number;
};

/** Trend of an area, optionally for one sport (BR-STA-08). */
export type Trend = {
  window: TrendWindow;
  current: TrendTotals;
  previous: TrendTotals;
  participantChange: number | null;
  /** One row per day of the current window that had activity. */
  series: { day: LocalDate; occurrences: number; participants: number }[];
};

/** One day of back-office statistics (BR-STA-10). */
export type PlatformDay = {
  day: LocalDate;
  signups: number;
  activeUsers: number;
  eventsCreated: number;
  occurrencesHeld: number;
  occurrencesCancelled: number;
  noShows: number;
  reportsOpened: number;
  reportsClosed: number;
};

/** Back-office statistics over a range of days (BR-STA-10). */
export type PlatformStats = {
  days: PlatformDay[];
  totalUsers: number;
  /** Users active in the last 30 days (monthly active users). */
  activeUsersLast30Days: number;
  /** Share of the users who signed up 30 to 60 days ago and were active 30 days or more after signing up. `null` if none. */
  retention30Days: number | null;
  /** no_show / (attended + no_show) on the completed occurrences of the range; `null` if none. */
  noShowRate: number | null;
  reports: {
    byStatus: Record<'open' | 'assigned' | 'resolved' | 'dismissed', number>;
    /** Average hours from filing to closing, for the reports closed in the range; `null` if none. */
    averageHandlingHours: number | null;
  };
  topSports: {
    sportId: string;
    code: string;
    name: string;
    participants: number;
  }[];
  /** Cities: arrondissements grouped under their parent city (BR-ACC-19). */
  topCities: { municipalityId: string; name: string; participants: number }[];
};
