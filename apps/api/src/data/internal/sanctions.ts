import { type Kysely, type RawBuilder, sql } from 'kysely';
import { IdentityBannedError } from '../errors';
import { emailHash, identityHash } from './crypto';
import type { DB } from './generated/database';
import type { ActiveBan } from '../types/moderation.types';

/** Ban in force on a user (BR-MOD-03): not revoked, started, and not ended. The latest one wins. */
export async function findActiveBan(
  db: Kysely<DB>,
  userId: string,
): Promise<ActiveBan | null> {
  const row = await db
    .selectFrom('user_sanction')
    .select(['id', 'kind', 'ends_at'])
    .where('user_id', '=', userId)
    .where('kind', 'in', ['temporary_ban', 'permanent_ban'])
    .where('revoked_at', 'is', null)
    .where('starts_at', '<=', sql<Date>`now()`)
    .where((eb) =>
      eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', sql<Date>`now()`)]),
    )
    // A permanent ban outranks a temporary one; then the latest.
    .orderBy(sql`kind = 'permanent_ban'`, 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  if (row === undefined) {
    return null;
  }
  return {
    sanctionId: row.id,
    kind: row.kind as ActiveBan['kind'],
    endsAt: row.ends_at,
  };
}

async function isBanned(
  db: Kysely<DB>,
  kind: 'email' | 'google_subject',
  hash: RawBuilder<unknown>,
): Promise<boolean> {
  const result = await sql<{ banned: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM banned_identity WHERE identity_kind = ${kind} AND identity_hash = ${hash}
    ) AS banned
  `.execute(db);
  return result.rows[0]?.banned === true;
}

/** Throws `IdentityBannedError` when the email or the Google subject is banned (BR-MOD-04). */
export async function assertIdentityNotBanned(
  db: Kysely<DB>,
  identity: { email?: string; googleSubject?: string },
): Promise<void> {
  if (
    identity.email !== undefined &&
    (await isBanned(db, 'email', emailHash(identity.email)))
  ) {
    throw new IdentityBannedError();
  }
  if (
    identity.googleSubject !== undefined &&
    (await isBanned(db, 'google_subject', identityHash(identity.googleSubject)))
  ) {
    throw new IdentityBannedError();
  }
}
