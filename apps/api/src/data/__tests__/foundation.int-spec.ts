import { sql } from 'kysely';
import { DataError } from '../errors';
import { decryptText, emailHash, encryptText } from '../internal/crypto';
import { mapDbError } from '../internal/db-errors';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('data layer foundation', () => {
  const db = appDb();
  const owner = ownerDb();

  beforeAll(async () => {
    await truncateAll(owner);
  });

  afterAll(async () => {
    await Promise.all([db.destroy(), owner.destroy()]);
  });

  it('creates UUID v7 values as the application role', async () => {
    const { rows } = await sql<{ id: string }>`SELECT uuidv7() AS id`.execute(
      db,
    );
    expect(typeof rows[0].id).toBe('string');
    expect(rows[0].id.charAt(14)).toBe('7');
  });

  it('round-trips encrypted text and hashes emails after normalization', async () => {
    const decrypted = await sql<{ value: string }>`
      SELECT ${decryptText('s.x')} AS value
      FROM (SELECT ${encryptText('hello')} AS x) s
    `.execute(db);
    expect(decrypted.rows[0].value).toBe('hello');

    const hashes = await sql<{ same: boolean; different: boolean }>`
      SELECT
        (${emailHash(' A@B.fr ')}) = (${emailHash('a@b.fr')}) AS same,
        (${emailHash('c@b.fr')}) <> (${emailHash('a@b.fr')}) AS different
    `.execute(db);
    expect(hashes.rows[0].same).toBe(true);
    expect(hashes.rows[0].different).toBe(true);
  });

  it('maps a unique violation by constraint name and falls back to INTERNAL', async () => {
    await db.connection().execute(async (conn) => {
      await sql`CREATE TEMP TABLE t (v int CONSTRAINT uq_t_v UNIQUE)`.execute(
        conn,
      );
      await sql`INSERT INTO t (v) VALUES (1)`.execute(conn);
      const err = await sql`INSERT INTO t (v) VALUES (1)`
        .execute(conn)
        .catch((e: unknown) => e);

      expect(mapDbError(err, { uq_t_v: () => new DataError('DUP') }).code).toBe(
        'DUP',
      );
      expect(mapDbError(err, {}).code).toBe('INTERNAL');
    });
  });

  it('round-trips pagination cursors and rejects malformed ones', () => {
    const sortKey = { id: 'abc', at: '2026-01-01' };
    expect(decodeCursor<typeof sortKey>(encodeCursor(sortKey))).toEqual(
      sortKey,
    );
    expect(errorOf(() => decodeCursor('%%%'))).toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('clamps page sizes to 1..100 with a default of 20', () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(0)).toBe(1);
  });
});
