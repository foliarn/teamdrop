import {
  type Expression,
  type Kysely,
  type RawBuilder,
  type SqlBool,
  sql,
} from 'kysely';
import type { DB } from './generated/database';
import type { VisibilityLevel } from '../types/account.types';

/**
 * Casts a user id to a uuid SQL expression, so that the helpers below can be used with plain ids.
 */
export function asUuid(userId: string): Expression<string> {
  return sql<string>`${userId}::uuid`;
}

/**
 * Reads whether two users are blocked in either direction (BR-SOC-02). Runs on `db` or on a transaction.
 */
export async function isBlocked(
  db: Kysely<DB>,
  a: string,
  b: string,
): Promise<boolean> {
  const row = await db
    .selectNoFrom([blockedBetween(asUuid(a), asUuid(b)).as('blocked')])
    .executeTakeFirstOrThrow();
  return row.blocked === true;
}

/**
 * True when a block row exists between `a` and `b` in either direction.
 * Rule: BR-SOC-02 (blocking is total and mutual).
 */
export function blockedBetween(
  a: Expression<string>,
  b: Expression<string>,
): RawBuilder<SqlBool> {
  return sql<SqlBool>`EXISTS (
    SELECT 1 FROM user_block ub
    WHERE (ub.blocker_id = ${a} AND ub.blocked_id = ${b})
       OR (ub.blocker_id = ${b} AND ub.blocked_id = ${a})
  )`;
}

/**
 * True when `a` and `b` are friends: an accepted follow from a to b AND an accepted follow from b to a.
 * Friendship is computed, never stored. Rule: BR-SOC-01.
 */
export function areFriends(
  a: Expression<string>,
  b: Expression<string>,
): RawBuilder<SqlBool> {
  return sql<SqlBool>`(
    EXISTS (
      SELECT 1 FROM follow f1
      WHERE f1.follower_id = ${a} AND f1.followed_id = ${b} AND f1.status = 'accepted'
    )
    AND EXISTS (
      SELECT 1 FROM follow f2
      WHERE f2.follower_id = ${b} AND f2.followed_id = ${a} AND f2.status = 'accepted'
    )
  )`;
}

/**
 * True when `viewerId` may see a profile section whose visibility is `level`, owned by `ownerId`.
 * - The owner always sees the section.
 * - A block in either direction hides it (BR-SOC-02).
 * - `public` and `members` are visible to any logged-in viewer; `friends` only to friends (BR-SOC-01);
 *   `only_me` to nobody else (BR-ACC-14).
 * Used by the repositories so that every read applies the same rule.
 */
export function canViewSection(
  level: Expression<VisibilityLevel>,
  viewerId: Expression<string>,
  ownerId: Expression<string>,
): RawBuilder<SqlBool> {
  return sql<SqlBool>`(
    ${viewerId} = ${ownerId}
    OR (
      NOT ${blockedBetween(viewerId, ownerId)}
      AND (
        ${level} IN ('public', 'members')
        OR (${level} = 'friends' AND ${areFriends(viewerId, ownerId)})
      )
    )
  )`;
}
