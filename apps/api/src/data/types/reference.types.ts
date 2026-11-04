import type { GeoPoint } from './common.types';

/** Where a sport is practised (DB enum `sport_environment`). */
export type SportEnvironment = 'indoor' | 'outdoor' | 'both';

/** A sport managed from the back office (BR-ACC-17). */
export type Sport = {
  id: string;
  code: string;
  name: string;
  isTeamSport: boolean;
  environment: SportEnvironment;
  defaultDurationMinutes: number;
  defaultMinParticipants: number | null;
  defaultMaxParticipants: number | null;
  icon: string | null;
  isActive: boolean;
};

/** Input of `ReferenceRepository.createSport`. */
export type CreateSportInput = {
  code: string;
  name: string;
  isTeamSport: boolean;
  environment: SportEnvironment;
  defaultDurationMinutes: number;
  defaultMinParticipants?: number | null;
  defaultMaxParticipants?: number | null;
  icon?: string | null;
  isActive?: boolean;
};

/** Patch of `ReferenceRepository.updateSport`: only the given fields change. */
export type UpdateSportPatch = Partial<CreateSportInput>;

/** One level of the shared self-declared scale (BR-ACC-10). */
export type SkillLevel = {
  id: string;
  code: string;
  name: string;
  rank: number;
};

/** Value kind of a rating system (DB enum `rating_value_kind`). */
export type RatingValueKind = 'numeric' | 'graded';

/** One ordered label of a graded rating system (BR-ACC-11). */
export type RatingGrade = {
  id: string;
  code: string;
  rank: number;
};

/** An official rating scale of one sport, with its grades when graded (BR-ACC-11). */
export type RatingSystem = {
  id: string;
  sportId: string;
  code: string;
  name: string;
  valueKind: RatingValueKind;
  minValue: number | null;
  maxValue: number | null;
  grades: RatingGrade[];
};

/** A municipality or a Paris, Lyon or Marseille arrondissement (BR-ACC-13, BR-ACC-19). */
export type Municipality = {
  id: string;
  inseeCode: string;
  name: string;
  departmentCode: string;
  center: GeoPoint;
  parent: { id: string; name: string } | null;
};
