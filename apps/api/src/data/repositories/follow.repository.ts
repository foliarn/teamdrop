import { Inject, Injectable } from '@nestjs/common';
import {
  type Expression,
  type ExpressionBuilder,
  type Kysely,
  type SqlBool,
  sql,
} from 'kysely';
import {
  type DataError,
  BlockedError,
  NotFoundError,
  SelfActionError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { lockUsers } from '../internal/locks';
import { parseUserCursor, toUserPage } from '../internal/keyset';
import { clampLimit } from '../internal/pagination';
import {
  areFriends,
  asUuid,
  blockedBetween,
  canViewSection,
  isBlocked,
} from '../internal/visibility';
import type { Page, PageRequest } from '../types/common.types';
import type {
  FollowListItem,
  FollowState,
  FollowStatus,
  PendingFollowRequest,
  Relationship,
} from '../types/social.types';

/** Constraints of `follow` that refer to users. */
const FOLLOW_CONSTRAINTS: Record<string, () => DataError> = {
  fk_follow_follower_id: () => new NotFoundError('User not found'),
  fk_follow_followed_id: () => new NotFoundError('User not found'),
  ck_follow_not_self: () => new SelfActionError(),
};

/** Filter on `follow` rows in either direction between two users. */
function eitherDirection(
  first: string,
  second: string,
): (eb: ExpressionBuilder<DB, 'follow'>) => Expression<SqlBool> {
  return (eb) =>
    eb.or([
      eb.and([eb('follower_id', '=', first), eb('followed_id', '=', second)]),
      eb.and([eb('follower_id', '=', second), eb('followed_id', '=', first)]),
    ]);
}

/**
 * Follows, follow requests, friends and relationship reads (BR-SOC-01, BR-ACC-14).
 * Lists are gated by the owner's `follows_visibility` and hide users blocked with the viewer (BR-SOC-02).
 */
@Injectable()
export class FollowRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Makes `followerId` follow `followedId`. A private account receives a pending request, a public one an accepted
   * follow. Following again returns the current status (idempotent).
   *
   * Rules: BR-SOC-01 (no self follow, friends are mutual accepted follows), BR-SOC-02 (refused while blocked in
   * either direction), BR-ACC-14 (private accounts approve requests).
   * Errors: `SelfActionError`, `BlockedError`, `NotFoundError` (unknown user).
   * Outcome: `{ status }`, the status of the follow after the call.
   */
  async follow(
    followerId: string,
    followedId: string,
  ): Promise<{ status: FollowStatus }> {
    if (followerId === followedId) {
      throw new SelfActionError();
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        await lockUsers(trx, [followerId, followedId]);
        // BR-SOC-02: no follow while the two users are blocked in either direction.
        if (await isBlocked(trx, followerId, followedId)) {
          throw new BlockedError();
        }
        const existing = await trx
          .selectFrom('follow')
          .select('status')
          .where('follower_id', '=', followerId)
          .where('followed_id', '=', followedId)
          .executeTakeFirst();
        if (existing !== undefined) {
          return { status: existing.status };
        }
        const target = await trx
          .selectFrom('user_setting')
          .select('is_private_account')
          .where('user_id', '=', followedId)
          .executeTakeFirst();
        if (target === undefined) {
          throw new NotFoundError('User not found');
        }
        // BR-ACC-14: a private account approves each follow request.
        const status: FollowStatus = target.is_private_account
          ? 'pending'
          : 'accepted';
        await trx
          .insertInto('follow')
          .values({
            follower_id: followerId,
            followed_id: followedId,
            status,
            accepted_at: status === 'accepted' ? new Date() : null,
          })
          .execute();
        return { status };
      });
    } catch (err) {
      throw mapDbError(err, FOLLOW_CONSTRAINTS);
    }
  }

  /**
   * Accepts the pending follow request of `followerId` towards `userId`.
   * Rules: BR-ACC-14. The developers check that `userId` is the account owner.
   * Errors: `NotFoundError` when no pending request exists.
   * Outcome: none.
   */
  async acceptFollowRequest(userId: string, followerId: string): Promise<void> {
    try {
      const row = await this.db
        .updateTable('follow')
        .set({ status: 'accepted', accepted_at: new Date() })
        .where('follower_id', '=', followerId)
        .where('followed_id', '=', userId)
        .where('status', '=', 'pending')
        .returning('follower_id')
        .executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('No pending follow request');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Declines (deletes) the pending follow request of `followerId` towards `userId`.
   * Rules: BR-ACC-14.
   * Errors: `NotFoundError` when no pending request exists.
   * Outcome: none.
   */
  async declineFollowRequest(
    userId: string,
    followerId: string,
  ): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('follow')
        .where('follower_id', '=', followerId)
        .where('followed_id', '=', userId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('No pending follow request');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Removes the follow from `followerId` to `followedId`, whatever its status. No error when absent.
   * Rules: BR-SOC-01.
   * Outcome: none.
   */
  async unfollow(followerId: string, followedId: string): Promise<void> {
    try {
      await this.db
        .deleteFrom('follow')
        .where('follower_id', '=', followerId)
        .where('followed_id', '=', followedId)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Removes a follower of `userId` (the follow from `followerId` to `userId`). No error when absent.
   * Rules: BR-SOC-01. The developers check that `userId` is the account owner.
   * Outcome: none.
   */
  async removeFollower(userId: string, followerId: string): Promise<void> {
    try {
      await this.db
        .deleteFrom('follow')
        .where('follower_id', '=', followerId)
        .where('followed_id', '=', userId)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the accepted followers of `userId`, ordered by username.
   * Rules: BR-ACC-14 (`follows_visibility`), BR-SOC-02 (users blocked with the viewer are hidden).
   * Errors: `INVALID_CURSOR`.
   * Outcome: `null` when the list is not visible to the viewer (or the account does not exist); otherwise a page.
   */
  async listFollowers(
    viewerId: string,
    userId: string,
    page: PageRequest = {},
  ): Promise<Page<FollowListItem> | null> {
    return this.listUsers(
      viewerId,
      userId,
      page,
      (ownerRef) =>
        sql<SqlBool>`EXISTS (
        SELECT 1 FROM follow f
        WHERE f.follower_id = u.id AND f.followed_id = ${ownerRef} AND f.status = 'accepted'
      )`,
    );
  }

  /**
   * Lists the users `userId` follows (accepted follows only), ordered by username.
   * Rules: BR-ACC-14 (`follows_visibility`), BR-SOC-02.
   * Errors: `INVALID_CURSOR`.
   * Outcome: `null` when not visible to the viewer; otherwise a page.
   */
  async listFollowing(
    viewerId: string,
    userId: string,
    page: PageRequest = {},
  ): Promise<Page<FollowListItem> | null> {
    return this.listUsers(
      viewerId,
      userId,
      page,
      (ownerRef) =>
        sql<SqlBool>`EXISTS (
        SELECT 1 FROM follow f
        WHERE f.follower_id = ${ownerRef} AND f.followed_id = u.id AND f.status = 'accepted'
      )`,
    );
  }

  /**
   * Lists the friends of `userId` (mutual accepted follows), ordered by username.
   * Rules: BR-SOC-01, BR-ACC-14 (`follows_visibility`), BR-SOC-02.
   * Errors: `INVALID_CURSOR`.
   * Outcome: `null` when not visible to the viewer; otherwise a page.
   */
  async listFriends(
    viewerId: string,
    userId: string,
    page: PageRequest = {},
  ): Promise<Page<FollowListItem> | null> {
    return this.listUsers(viewerId, userId, page, (ownerRef) =>
      areFriends(ownerRef, sql<string>`u.id`),
    );
  }

  /**
   * Lists the pending follow requests received by `userId`, oldest first. Only the account owner should call it.
   * Rules: BR-ACC-14.
   * Outcome: the requests, not paginated.
   */
  async listPendingFollowRequests(
    userId: string,
  ): Promise<PendingFollowRequest[]> {
    try {
      const rows = await this.db
        .selectFrom('follow as f')
        .innerJoin('user_account as u', 'u.id', 'f.follower_id')
        .select([
          'u.id',
          'u.username',
          'u.avatar_path',
          'f.created_at as requested_at',
        ])
        .where('f.followed_id', '=', userId)
        .where('f.status', '=', 'pending')
        .orderBy('f.created_at')
        .orderBy('u.id')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        username: row.username,
        avatarPath: row.avatar_path,
        requestedAt: row.requested_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Describes the relationship between the viewer and another user, in both directions.
   * Rules: BR-SOC-01 (friends), BR-SOC-02 (blocks in both directions).
   * Outcome: the relationship; `none` everywhere for two unrelated users.
   */
  async getRelationship(
    viewerId: string,
    otherId: string,
  ): Promise<Relationship> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const follows = await trx
          .selectFrom('follow')
          .select(['follower_id', 'followed_id', 'status'])
          .where(eitherDirection(viewerId, otherId))
          .execute();
        const blocks = await trx
          .selectFrom('user_block')
          .select(['blocker_id', 'blocked_id'])
          .where((eb) =>
            eb.or([
              eb.and([
                eb('blocker_id', '=', viewerId),
                eb('blocked_id', '=', otherId),
              ]),
              eb.and([
                eb('blocker_id', '=', otherId),
                eb('blocked_id', '=', viewerId),
              ]),
            ]),
          )
          .execute();

        const stateOf = (from: string, to: string): FollowState =>
          follows.find((f) => f.follower_id === from && f.followed_id === to)
            ?.status ?? 'none';
        const following = stateOf(viewerId, otherId);
        const followedBy = stateOf(otherId, viewerId);
        return {
          following,
          followedBy,
          friends: following === 'accepted' && followedBy === 'accepted',
          blockedByMe: blocks.some(
            (b) => b.blocker_id === viewerId && b.blocked_id === otherId,
          ),
          blockedMe: blocks.some(
            (b) => b.blocker_id === otherId && b.blocked_id === viewerId,
          ),
        };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Shared implementation of the three follow lists. `relation` builds the SQL condition on the listed user `u`,
   * given the owner's id as an expression.
   */
  private async listUsers(
    viewerId: string,
    ownerId: string,
    page: PageRequest,
    relation: (ownerRef: Expression<string>) => Expression<SqlBool>,
  ): Promise<Page<FollowListItem> | null> {
    const limit = clampLimit(page.limit);
    const key = page.cursor !== undefined ? parseUserCursor(page.cursor) : null;
    try {
      return await this.db.transaction().execute(async (trx) => {
        // BR-ACC-14: the owner's follows_visibility decides who sees the list; blocking hides it (BR-SOC-02).
        const setting = await trx
          .selectFrom('user_setting as s')
          .where('s.user_id', '=', ownerId)
          .select((eb) => [
            canViewSection(
              eb.ref('s.follows_visibility'),
              asUuid(viewerId),
              eb.ref('s.user_id'),
            ).as('visible'),
          ])
          .executeTakeFirst();
        if (setting === undefined || setting.visible !== true) {
          return null;
        }

        let builder = trx
          .selectFrom('user_account as u')
          .select(['u.id', 'u.username', 'u.avatar_path'])
          .where(relation(asUuid(ownerId)))
          .where(
            sql<SqlBool>`NOT ${blockedBetween(asUuid(viewerId), sql<string>`u.id`)}`,
          )
          .orderBy('u.username')
          .orderBy('u.id')
          .limit(limit + 1);
        if (key !== null) {
          builder = builder.where(
            sql<SqlBool>`(u.username, u.id) > (${key.username}::citext, ${key.id}::uuid)`,
          );
        }
        const rows = await builder.execute();
        return toUserPage(rows, limit, (row) => ({
          id: row.id,
          username: row.username,
          avatarPath: row.avatar_path,
        }));
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }
}
