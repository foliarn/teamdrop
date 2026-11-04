import type { Selectable } from 'kysely';
import type { DB } from '../generated/database';
import type {
  AvailabilitySlot,
  DayOfWeek,
  ProfileSport,
  UserRating,
  UserSettings,
} from '../../types/account.types';

/** Maps a `user_setting` row to the public `UserSettings` type. */
export function toUserSettings(
  row: Selectable<DB['user_setting']>,
): UserSettings {
  return {
    profileVisibility: row.profile_visibility,
    statsVisibility: row.stats_visibility,
    badgesVisibility: row.badges_visibility,
    reliabilityVisibility: row.reliability_visibility,
    circlesVisibility: row.circles_visibility,
    historyVisibility: row.history_visibility,
    followsVisibility: row.follows_visibility,
    isPrivateAccount: row.is_private_account,
    hideFromRankings: row.hide_from_rankings,
    circleInvitePolicy: row.circle_invite_policy,
  };
}

/** Maps a `user_availability` row. Times are returned as 'HH:mm' (seconds dropped). */
export function toAvailabilitySlot(
  row: Pick<
    Selectable<DB['user_availability']>,
    'day_of_week' | 'start_time' | 'end_time'
  >,
): AvailabilitySlot {
  return {
    dayOfWeek: row.day_of_week as DayOfWeek,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  };
}

/** Row of a `user_sport` joined with its sport and skill level. */
export type ProfileSportRow = {
  sport_id: string;
  sport_code: string;
  sport_name: string;
  skill_level_id: string;
  skill_level_code: string;
  skill_level_name: string;
};

/** Maps a joined `user_sport` row to `ProfileSport`. */
export function toProfileSport(row: ProfileSportRow): ProfileSport {
  return {
    sport: { id: row.sport_id, code: row.sport_code, name: row.sport_name },
    skillLevel: {
      id: row.skill_level_id,
      code: row.skill_level_code,
      name: row.skill_level_name,
    },
  };
}

/** Row of a `user_rating` joined with its rating system and grade. */
export type UserRatingRow = {
  rating_system_id: string;
  system_code: string;
  numeric_value: string | null;
  grade_code: string | null;
};

/** Maps a joined `user_rating` row to the resolved `UserRating` type. */
export function toUserRating(row: UserRatingRow): UserRating {
  return {
    ratingSystemId: row.rating_system_id,
    systemCode: row.system_code,
    numericValue: row.numeric_value === null ? null : Number(row.numeric_value),
    gradeCode: row.grade_code,
  };
}
