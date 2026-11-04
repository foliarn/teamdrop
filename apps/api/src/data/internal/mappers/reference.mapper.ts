import type { Selectable } from 'kysely';
import type { DB } from '../generated/database';
import type {
  Municipality,
  RatingGrade,
  RatingSystem,
  SkillLevel,
  Sport,
} from '../../types/reference.types';

/** Maps a `sport` row to the public `Sport` type. */
export function toSport(row: Selectable<DB['sport']>): Sport {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isTeamSport: row.is_team_sport,
    environment: row.environment,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultMinParticipants: row.default_min_participants,
    defaultMaxParticipants: row.default_max_participants,
    icon: row.icon,
    isActive: row.is_active,
  };
}

/** Maps a `skill_level` row to the public `SkillLevel` type. */
export function toSkillLevel(row: Selectable<DB['skill_level']>): SkillLevel {
  return { id: row.id, code: row.code, name: row.name, rank: row.rank };
}

/** Maps a `rating_system` row and its grades to the public `RatingSystem` type. */
export function toRatingSystem(
  row: Selectable<DB['rating_system']>,
  grades: RatingGrade[],
): RatingSystem {
  return {
    id: row.id,
    sportId: row.sport_id,
    code: row.code,
    name: row.name,
    valueKind: row.value_kind,
    minValue: row.min_value === null ? null : Number(row.min_value),
    maxValue: row.max_value === null ? null : Number(row.max_value),
    grades,
  };
}

/** Row of `municipalityQuery`. */
export type MunicipalityRow = {
  id: string;
  insee_code: string;
  name: string;
  department_code: string;
  lat: number;
  lng: number;
  parent_id: string | null;
  parent_name: string | null;
};

/** Maps a `municipalityQuery` row to the public `Municipality` type. */
export function toMunicipality(row: MunicipalityRow): Municipality {
  return {
    id: row.id,
    inseeCode: row.insee_code,
    name: row.name,
    departmentCode: row.department_code,
    center: { lat: row.lat, lng: row.lng },
    parent:
      row.parent_id === null || row.parent_name === null
        ? null
        : { id: row.parent_id, name: row.parent_name },
  };
}
