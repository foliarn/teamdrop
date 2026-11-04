import type { Provider } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { DB } from './generated/database';
import { requiredEnv } from './env';

/** Injection token of the shared Kysely instance. Internal to the data layer. */
export const KYSELY = Symbol('KYSELY');

// pg type parsers (brief section 6). Set once, at module load, because they are process-wide.
types.setTypeParser(1082, (value: string) => value); // date: keep 'YYYY-MM-DD'
types.setTypeParser(20, (value: string) => value); // int8: keep as string
types.setTypeParser(1700, (value: string) => value); // numeric: keep as string

/** Creates a Kysely instance backed by its own pg pool (max 10 connections). Query logging is never enabled. */
export function createKysely(connectionString: string): Kysely<DB> {
  const pool = new Pool({ connectionString, max: 10 });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/** Nest provider of the application's Kysely instance (connects as the `teamdrop_app` role). */
export const kyselyProvider: Provider = {
  provide: KYSELY,
  useFactory: () => createKysely(requiredEnv('DATABASE_URL_APP')),
};
