import { type Kysely, sql } from 'kysely';
import type { DB } from './generated/database';

/**
 * Municipality rows with the coordinates of the center and the parent city (BR-ACC-19).
 * Shared by the reference and user repositories. Callers add their own filters and ordering.
 */
export function municipalityQuery(db: Kysely<DB>) {
  return db
    .selectFrom('municipality as m')
    .leftJoin('municipality as p', 'p.id', 'm.parent_municipality_id')
    .select([
      'm.id',
      'm.insee_code',
      'm.name',
      'm.department_code',
      sql<number>`ST_Y(m.center::geometry)`.as('lat'),
      sql<number>`ST_X(m.center::geometry)`.as('lng'),
      'p.id as parent_id',
      'p.name as parent_name',
    ]);
}
