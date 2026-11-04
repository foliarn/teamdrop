import { readFileSync } from 'node:fs';
import { type Kysely, sql } from 'kysely';
import type { DB } from '../../internal/generated/database';
import { requiredEnv } from '../../internal/env';
import { createKysely } from '../../internal/kysely';

/** Connection as the application role (`teamdrop_app`) on the test database. */
export function appDb(): Kysely<DB> {
  return createKysely(requiredEnv('TEST_DATABASE_URL_APP'));
}

/** Connection as the owner role (`teamdrop_owner`) on the test database. Used for setup and teardown only. */
export function ownerDb(): Kysely<DB> {
  return createKysely(requiredEnv('TEST_DATABASE_URL_OWNER'));
}

/**
 * Empties every table of schema `public` except `schema_migrations`, restarts identities.
 * Refuses to run unless connected to a database whose name ends with `_test`.
 */
export async function truncateAll(owner: Kysely<DB>): Promise<void> {
  const database = await sql<{
    name: string;
  }>`SELECT current_database() AS name`.execute(owner);
  const name = database.rows[0]?.name ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `truncateAll refuses to run on database "${name}" (test databases only)`,
    );
  }

  // Tables created by an extension (e.g. PostGIS `spatial_ref_sys`) are not ours and cannot be truncated.
  const tables = await sql<{ tablename: string }>`
    SELECT t.tablename FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename <> 'schema_migrations'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = format('%I.%I', t.schemaname, t.tablename)::regclass
          AND d.deptype = 'e'
      )
  `.execute(owner);

  if (tables.rows.length === 0) {
    return;
  }

  const list = sql.join(tables.rows.map((row) => sql.id(row.tablename)));
  await sql`TRUNCATE ${list} RESTART IDENTITY CASCADE`.execute(owner);
}

/** Runs a SQL file (absolute path) as a single script. */
export async function runSqlFile(
  owner: Kysely<DB>,
  absolutePath: string,
): Promise<void> {
  await sql.raw(readFileSync(absolutePath, 'utf8')).execute(owner);
}
