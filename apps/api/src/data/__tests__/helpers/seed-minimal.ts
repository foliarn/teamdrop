import { type Kysely, sql } from 'kysely';
import type { DB } from '../../internal/generated/database';

/** Ids of the minimal reference set inserted by `seedMinimal`. */
export type MinimalRefs = {
  municipalities: { paris: string; paris8: string; lyon: string };
  sports: { football: string; tennis: string; chess: string };
  skillLevels: {
    beginner: string;
    intermediate: string;
    advanced: string;
    expert: string;
  };
  ratingSystems: { fideElo: string; fftRanking: string };
  grades: { nc: string; fifteenTwo: string; zero: string };
};

/**
 * Inserts a small reference set (3 municipalities, 3 sports, 4 levels, 2 rating systems, 3 FFT grades) as the owner role.
 * Fast on purpose: the 35,000 municipalities are never loaded in tests. Call it after `truncateAll`.
 */
export async function seedMinimal(owner: Kysely<DB>): Promise<MinimalRefs> {
  const paris = await owner
    .insertInto('municipality')
    .values({
      insee_code: '75056',
      name: 'Paris',
      department_code: '75',
      population: 2100000,
      center: sql<string>`ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography`,
      parent_municipality_id: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const paris8 = await owner
    .insertInto('municipality')
    .values({
      insee_code: '75108',
      name: 'Paris 8e',
      department_code: '75',
      population: 35000,
      center: sql<string>`ST_SetSRID(ST_MakePoint(2.3100, 48.8740), 4326)::geography`,
      parent_municipality_id: paris.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const lyon = await owner
    .insertInto('municipality')
    .values({
      insee_code: '69123',
      name: 'Lyon',
      department_code: '69',
      population: 520000,
      center: sql<string>`ST_SetSRID(ST_MakePoint(4.8357, 45.7640), 4326)::geography`,
      parent_municipality_id: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const [football, tennis, chess] = await owner
    .insertInto('sport')
    .values([
      {
        code: 'football',
        name: 'Football',
        is_team_sport: true,
        environment: 'outdoor',
        default_duration_minutes: 90,
        default_min_participants: 6,
        default_max_participants: 22,
      },
      {
        code: 'tennis',
        name: 'Tennis',
        is_team_sport: false,
        environment: 'both',
        default_duration_minutes: 60,
        default_min_participants: 2,
        default_max_participants: 4,
      },
      {
        code: 'chess',
        name: 'Chess',
        is_team_sport: false,
        environment: 'indoor',
        default_duration_minutes: 60,
        default_min_participants: 2,
        default_max_participants: 2,
      },
    ])
    .returning('id')
    .execute();

  const [beginner, intermediate, advanced, expert] = await owner
    .insertInto('skill_level')
    .values([
      { code: 'beginner', name: 'Beginner', rank: 1 },
      { code: 'intermediate', name: 'Intermediate', rank: 2 },
      { code: 'advanced', name: 'Advanced', rank: 3 },
      { code: 'expert', name: 'Expert', rank: 4 },
    ])
    .returning('id')
    .execute();

  const [fideElo, fftRanking] = await owner
    .insertInto('rating_system')
    .values([
      {
        sport_id: chess.id,
        code: 'fide_elo',
        name: 'FIDE Elo',
        value_kind: 'numeric',
        min_value: 0,
        max_value: 3500,
      },
      {
        sport_id: tennis.id,
        code: 'fft_ranking',
        name: 'French tennis ranking (FFT)',
        value_kind: 'graded',
      },
    ])
    .returning('id')
    .execute();

  const [nc, fifteenTwo, zero] = await owner
    .insertInto('rating_grade')
    .values([
      { rating_system_id: fftRanking.id, code: 'NC', rank: 1 },
      { rating_system_id: fftRanking.id, code: '15/2', rank: 12 },
      { rating_system_id: fftRanking.id, code: '0', rank: 20 },
    ])
    .returning('id')
    .execute();

  return {
    municipalities: { paris: paris.id, paris8: paris8.id, lyon: lyon.id },
    sports: { football: football.id, tennis: tennis.id, chess: chess.id },
    skillLevels: {
      beginner: beginner.id,
      intermediate: intermediate.id,
      advanced: advanced.id,
      expert: expert.id,
    },
    ratingSystems: { fideElo: fideElo.id, fftRanking: fftRanking.id },
    grades: { nc: nc.id, fifteenTwo: fifteenTwo.id, zero: zero.id },
  };
}
