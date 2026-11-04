import type { Kysely } from 'kysely';
import { NotFoundError } from '../errors';
import type { DB } from './generated/database';

/**
 * Locks the given user rows (`SELECT ... FOR UPDATE`) inside the caller's transaction, in id order, so that
 * concurrent block, follow and invitation writes between the same users are serialized.
 * Throws `NotFoundError` when one of the users does not exist.
 */
export async function lockUsers(
  trx: Kysely<DB>,
  userIds: string[],
): Promise<void> {
  const ids = [...new Set(userIds)].sort();
  const rows = await trx
    .selectFrom('user_account')
    .select('id')
    .where('id', 'in', ids)
    .orderBy('id')
    .forUpdate()
    .execute();
  if (rows.length !== ids.length) {
    throw new NotFoundError('User not found');
  }
}

/**
 * Locks a circle row for the rest of the transaction. Every write that counts or moves members (leaving,
 * removing, changing roles, transferring ownership) takes this lock first, so ownership hand-over is serialized.
 * Throws `NotFoundError` when the circle does not exist.
 */
export async function lockCircle(
  trx: Kysely<DB>,
  circleId: string,
): Promise<void> {
  const row = await trx
    .selectFrom('circle')
    .select('id')
    .where('id', '=', circleId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Circle not found');
  }
}

/**
 * Locks a community row for the rest of the transaction. Same role as `lockCircle` for communities (BR-SOC-09).
 * Throws `NotFoundError` when the community does not exist.
 */
export async function lockCommunity(
  trx: Kysely<DB>,
  communityId: string,
): Promise<void> {
  const row = await trx
    .selectFrom('community')
    .select('id')
    .where('id', '=', communityId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    throw new NotFoundError('Community not found');
  }
}
