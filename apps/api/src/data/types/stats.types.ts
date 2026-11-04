/** Sessions and planned minutes in one sport (BR-STA-01, BR-STA-02). */
export type SportActivity = {
  sportId: string;
  code: string;
  name: string;
  sessions: number;
  minutes: number;
};

/** Profile statistics of a user, computed on demand (BR-STA-01 to BR-STA-05, BR-STA-09). */
export type ProfileStats = {
  /** Completed sessions: `attended` on a `completed` occurrence, own events included (BR-STA-01). */
  sessions: number;
  /** Sum of the planned durations of the completed sessions, in minutes (BR-STA-02). */
  minutes: number;
  /** Distinct other participants who attended the same occurrences; guests never count (BR-STA-03, BR-REG-05). */
  peopleMet: number;
  /** Main sport by sessions and by hours (BR-STA-04); `null` without sessions. */
  mainSportBySessions: SportActivity | null;
  mainSportByHours: SportActivity | null;
  /** `specialist` when the main sport is at least 70% of the sessions, `null` without sessions (BR-STA-04). */
  profile: 'specialist' | 'all_rounder' | null;
  /** Consecutive days with a completed session, Europe/Paris, no grace period (BR-STA-05). */
  currentStreakDays: number;
  longestStreakDays: number;
  /** Every sport with at least one completed session, most sessions first. */
  bySport: SportActivity[];
};

/** Reliability counts and rate over one period (BR-ATT-04). */
export type ReliabilityPeriod = {
  attended: number;
  noShows: number;
  lateCancellations: number;
  /** attended / (attended + no_show + 0.5 × late cancellations), from 0 to 1; `null` when the denominator is 0. */
  rate: number | null;
};

/** Reliability of a user (BR-ATT-04, BR-GDP-10). */
export type Reliability = {
  /** Completed occurrences with a confirmed registration, plus late cancellations. */
  pastOccurrences: number;
  /** True until the user has 5 past occurrences: the rates are then `null` (BR-ATT-04). */
  hidden: boolean;
  allTime: ReliabilityPeriod | null;
  last90Days: ReliabilityPeriod | null;
};

/** Progress data for the developers' badge awarding code (BR-GAM-02). Never shown as is. */
export type BadgeProgress = {
  stats: ProfileStats;
  reliability: Reliability;
  /** Cheers received per cheer type code (BR-SOC-11). */
  cheersReceived: Record<string, number>;
  /** Completed occurrences of events the user owns (organizer badges). */
  organizedCompletedOccurrences: number;
};

/** A badge of the catalog, with its tiers (BR-GAM-01). */
export type Badge = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Lowest level first; empty for a badge without levels. */
  tiers: BadgeTier[];
};

/** One level of a badge (BR-GAM-01). */
export type BadgeTier = {
  id: string;
  rank: number;
  name: string;
  threshold: number;
};

/** Input of `createBadge` (back office). */
export type CreateBadgeInput = {
  code: string;
  name: string;
  description: string;
  category: string;
  sortOrder: number;
  icon?: string | null;
  isActive?: boolean;
};

/** Patch of `updateBadge` (back office). Missing fields are unchanged. */
export type UpdateBadgePatch = Partial<CreateBadgeInput>;

/** Input of one tier for `setBadgeTiers`. */
export type BadgeTierInput = { rank: number; name: string; threshold: number };

/** A badge held by a user (BR-GAM-01). */
export type UserBadge = {
  badgeId: string;
  code: string;
  name: string;
  category: string;
  icon: string | null;
  /** `null` for a badge without levels. */
  tier: { id: string; rank: number; name: string } | null;
  unlockedAt: Date;
  /** Only for the holder: `null` until the unlock animation was played. Always `null` for other viewers. */
  seenAt: Date | null;
};

/** Outcome of `awardBadge` (BR-GAM-02). */
export type AwardBadgeOutcome = {
  /** False when the user already held this badge at this level. */
  changed: boolean;
  /** True when the user did not hold the badge before. */
  isNew: boolean;
};
