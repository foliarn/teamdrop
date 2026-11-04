import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type SqlBool, type Updateable, sql } from 'kysely';
import {
  DataError,
  AlreadyMemberError,
  InvalidStateError,
  JoinRequestAlreadyPendingError,
  NotFoundError,
  NotMemberError,
  OwnerCannotBeRemovedError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { parseUserCursor, toUserPage } from '../internal/keyset';
import { KYSELY } from '../internal/kysely';
import { lockCommunity } from '../internal/locks';
import { toCommunity } from '../internal/mappers/social.mapper';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { asUuid, blockedBetween } from '../internal/visibility';
import type { Page, PageRequest } from '../types/common.types';
import type {
  Community,
  CommunityDetails,
  CommunityMember,
  CommunityRole,
  CommunitySearchResult,
  CreateCommunityInput,
  DecideJoinRequestOutcome,
  JoinCommunityOutcome,
  LeaveCommunityOutcome,
  MyCommunity,
  PendingJoinRequest,
  UpdateCommunityPatch,
} from '../types/social.types';

/** Constraints of `community_member`. */
const MEMBER_CONSTRAINTS: Record<string, () => DataError> = {
  pk_community_member: () => new AlreadyMemberError(),
  fk_community_member_user_id: () => new NotFoundError('User not found'),
  fk_community_member_community_id: () =>
    new NotFoundError('Community not found'),
};

/** Constraints of `community_join_request`. */
const REQUEST_CONSTRAINTS: Record<string, () => DataError> = {
  uq_community_join_request_pending: () => new JoinRequestAlreadyPendingError(),
  fk_community_join_request_user_id: () => new NotFoundError('User not found'),
  fk_community_join_request_community_id: () =>
    new NotFoundError('Community not found'),
  fk_community_join_request_decided_by_id: () =>
    new NotFoundError('User not found'),
};

/** Member count of the community aliased as `c`, as a SQL fragment. */
const MEMBER_COUNT = sql<number>`(SELECT count(*)::int FROM community_member cm WHERE cm.community_id = c.id)`;

/**
 * Communities: creation, join policy, join requests, membership, roles and ownership hand-over, search
 * and member lists (BR-SOC-09). Communities are public; their member lists are visible to members only.
 */
@Injectable()
export class CommunityRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Creates a community. The creator becomes its `owner` member, in the same transaction.
   * Rules: BR-SOC-09.
   * Errors: `NotFoundError` (unknown user).
   * Outcome: the new community.
   */
  async createCommunity(
    ownerId: string,
    input: CreateCommunityInput,
  ): Promise<Community> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const community = await trx
          .insertInto('community')
          .values({
            name: input.name,
            description: input.description ?? null,
            join_policy: input.joinPolicy,
            avatar_path: input.avatarPath ?? null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('community_member')
          .values({
            community_id: community.id,
            user_id: ownerId,
            role: 'owner',
            joined_at: new Date(),
          })
          .execute();
        return toCommunity(community);
      });
    } catch (err) {
      throw mapDbError(err, MEMBER_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a community. Only the fields present in `patch` change.
   * Rules: BR-SOC-09. The developers check that the caller is the owner or a moderator.
   * Errors: `NotFoundError`.
   * Outcome: none.
   */
  async updateCommunity(
    id: string,
    patch: UpdateCommunityPatch,
  ): Promise<void> {
    const values: Updateable<DB['community']> = {};
    if (patch.name !== undefined) {
      values.name = patch.name;
    }
    if (patch.description !== undefined) {
      values.description = patch.description;
    }
    if (patch.joinPolicy !== undefined) {
      values.join_policy = patch.joinPolicy;
    }
    if (patch.avatarPath !== undefined) {
      values.avatar_path = patch.avatarPath;
    }
    try {
      if (Object.keys(values).length === 0) {
        const exists = await this.db
          .selectFrom('community')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (exists === undefined) {
          throw new NotFoundError('Community not found');
        }
        return;
      }
      const result = await this.db
        .updateTable('community')
        .set(values)
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('Community not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Deletes a community with its memberships, requests and (in batch 2) chat.
   * Rules: BR-SOC-09, BR-MSG-06. The developers check that the caller is the owner.
   * Errors: `NotFoundError`.
   * Outcome: none.
   */
  async deleteCommunity(id: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('community')
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Community not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Joins a community. With the `open` policy the user becomes a member at once. With `on_request` a pending
   * join request is created for an owner or moderator to decide.
   * Rules: BR-SOC-09.
   * Errors: `AlreadyMemberError`, `JoinRequestAlreadyPendingError`, `NotFoundError`.
   * Outcome: `'member'` or `'requested'`.
   */
  async join(
    communityId: string,
    userId: string,
  ): Promise<JoinCommunityOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await lockCommunity(trx, communityId);
        const existing = await this.roleOf(trx, communityId, userId);
        if (existing !== null) {
          throw new AlreadyMemberError();
        }
        const community = await trx
          .selectFrom('community')
          .select('join_policy')
          .where('id', '=', communityId)
          .executeTakeFirstOrThrow();
        if (community.join_policy === 'open') {
          await trx
            .insertInto('community_member')
            .values({
              community_id: communityId,
              user_id: userId,
              role: 'member',
              joined_at: new Date(),
            })
            .execute();
          return { status: 'member' as const };
        }
        await trx
          .insertInto('community_join_request')
          .values({
            community_id: communityId,
            user_id: userId,
            status: 'pending',
          })
          .execute();
        return { status: 'requested' as const };
      });
    } catch (err) {
      throw mapDbError(err, { ...MEMBER_CONSTRAINTS, ...REQUEST_CONSTRAINTS });
    }
  }

  /**
   * Cancels a pending join request made by `userId`.
   * Rules: BR-SOC-09.
   * Errors: `NotFoundError` (no request of this user), `InvalidStateError` (not pending).
   * Outcome: none.
   */
  async cancelJoinRequest(requestId: string, userId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const request = await trx
          .selectFrom('community_join_request')
          .select('status')
          .where('id', '=', requestId)
          .where('user_id', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (request === undefined) {
          throw new NotFoundError('Join request not found');
        }
        if (request.status !== 'pending') {
          throw new InvalidStateError('The join request is not pending');
        }
        await trx
          .updateTable('community_join_request')
          .set({ status: 'cancelled', decided_at: new Date() })
          .where('id', '=', requestId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Accepts or declines a pending join request. Accepting adds the user as a `member`. Both outcomes record the decider.
   * Rules: BR-SOC-09. The developers check that the decider is the owner or a moderator.
   * Errors: `NotFoundError`, `InvalidStateError` (not pending), `AlreadyMemberError`.
   * Outcome: the id of the user who asked to join, so that the developers can notify them.
   */
  async decideJoinRequest(
    requestId: string,
    deciderId: string,
    accept: boolean,
  ): Promise<DecideJoinRequestOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const target = await trx
          .selectFrom('community_join_request')
          .select('community_id')
          .where('id', '=', requestId)
          .executeTakeFirst();
        if (target === undefined) {
          throw new NotFoundError('Join request not found');
        }
        await lockCommunity(trx, target.community_id);
        const request = await trx
          .selectFrom('community_join_request')
          .select(['community_id', 'user_id', 'status'])
          .where('id', '=', requestId)
          .forUpdate()
          .executeTakeFirst();
        if (request === undefined) {
          throw new NotFoundError('Join request not found');
        }
        if (request.status !== 'pending') {
          throw new InvalidStateError('The join request is not pending');
        }
        if (accept) {
          await trx
            .insertInto('community_member')
            .values({
              community_id: request.community_id,
              user_id: request.user_id,
              role: 'member',
              joined_at: new Date(),
            })
            .execute();
        }
        await trx
          .updateTable('community_join_request')
          .set({
            status: accept ? 'accepted' : 'declined',
            decided_by_id: deciderId,
            decided_at: new Date(),
          })
          .where('id', '=', requestId)
          .execute();
        return { userId: request.user_id };
      });
    } catch (err) {
      throw mapDbError(err, { ...MEMBER_CONSTRAINTS, ...REQUEST_CONSTRAINTS });
    }
  }

  /**
   * The user leaves a community. When the owner leaves, ownership passes to the oldest moderator, or to the oldest
   * member when there is no moderator. When nobody is left, the community is deleted.
   * Rules: BR-SOC-09 (exactly one owner, hand-over order).
   * Errors: `NotFoundError` (community), `NotMemberError`.
   * Outcome: the new owner (or null) and whether the community was deleted.
   */
  async leave(
    communityId: string,
    userId: string,
  ): Promise<LeaveCommunityOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await lockCommunity(trx, communityId);
        const role = await this.roleOf(trx, communityId, userId);
        if (role === null) {
          throw new NotMemberError();
        }
        await trx
          .deleteFrom('community_member')
          .where('community_id', '=', communityId)
          .where('user_id', '=', userId)
          .execute();
        if (role !== 'owner') {
          return { newOwnerId: null, communityDeleted: false };
        }
        // BR-SOC-09: oldest moderator first, then oldest member.
        const successor =
          (await this.oldestMember(trx, communityId, ['moderator'])) ??
          (await this.oldestMember(trx, communityId, ['member']));
        if (successor === undefined) {
          await trx
            .deleteFrom('community')
            .where('id', '=', communityId)
            .execute();
          return { newOwnerId: null, communityDeleted: true };
        }
        await trx
          .updateTable('community_member')
          .set({ role: 'owner' })
          .where('community_id', '=', communityId)
          .where('user_id', '=', successor)
          .execute();
        return { newOwnerId: successor, communityDeleted: false };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Removes a member from a community. The owner cannot be removed: transfer ownership first.
   * Rules: BR-SOC-09. The developers check the caller's role.
   * Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
   * Outcome: none.
   */
  async removeMember(communityId: string, userId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCommunity(trx, communityId);
        const role = await this.roleOf(trx, communityId, userId);
        if (role === null) {
          throw new NotMemberError();
        }
        if (role === 'owner') {
          throw new OwnerCannotBeRemovedError();
        }
        await trx
          .deleteFrom('community_member')
          .where('community_id', '=', communityId)
          .where('user_id', '=', userId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Sets the role of a member to `moderator` or `member`. The owner's role changes only through `transferOwnership`.
   * Rules: BR-SOC-09. The developers check the caller's role.
   * Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
   * Outcome: none.
   */
  async setMemberRole(
    communityId: string,
    userId: string,
    role: 'moderator' | 'member',
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCommunity(trx, communityId);
        const current = await this.roleOf(trx, communityId, userId);
        if (current === null) {
          throw new NotMemberError();
        }
        if (current === 'owner') {
          throw new OwnerCannotBeRemovedError(
            'Use transferOwnership to change the owner',
          );
        }
        await trx
          .updateTable('community_member')
          .set({ role })
          .where('community_id', '=', communityId)
          .where('user_id', '=', userId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Transfers ownership to a member. The former owner becomes a `moderator`. Transferring to the current owner does nothing.
   * Rules: BR-SOC-09. The developers check that the caller is the owner.
   * Errors: `NotMemberError` (new owner is not a member), `NotFoundError`.
   * Outcome: none.
   */
  async transferOwnership(
    communityId: string,
    newOwnerId: string,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCommunity(trx, communityId);
        const newRole = await this.roleOf(trx, communityId, newOwnerId);
        if (newRole === null) {
          throw new NotMemberError();
        }
        if (newRole === 'owner') {
          return;
        }
        const oldOwner = await trx
          .selectFrom('community_member')
          .select('user_id')
          .where('community_id', '=', communityId)
          .where('role', '=', 'owner')
          .executeTakeFirst();
        // The old owner is demoted first: the partial unique index allows one owner at a time.
        if (oldOwner !== undefined) {
          await trx
            .updateTable('community_member')
            .set({ role: 'moderator' })
            .where('community_id', '=', communityId)
            .where('user_id', '=', oldOwner.user_id)
            .execute();
        }
        await trx
          .updateTable('community_member')
          .set({ role: 'owner' })
          .where('community_id', '=', communityId)
          .where('user_id', '=', newOwnerId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns the role of a user in a community, or null when the user is not a member.
   * Used by the developers' permission checks.
   * Outcome: `'owner' | 'moderator' | 'member' | null`.
   */
  async getMemberRole(
    communityId: string,
    userId: string,
  ): Promise<CommunityRole | null> {
    try {
      return await this.roleOf(this.db, communityId, userId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Searches communities. With a query of at least 2 characters, matches the name with pg_trgm and unaccent
   * (typo-tolerant, accent-insensitive) and sorts by name. Otherwise lists the newest communities first.
   * Communities are public, so no visibility rule applies. `viewerId` is accepted for consistency with the other reads.
   * Rules: BR-TECH-10 (text search), BR-SOC-09.
   * Errors: `INVALID_CURSOR`.
   * Outcome: a cursor page.
   */
  async searchCommunities(
    viewerId: string,
    input: { query?: string } & PageRequest,
  ): Promise<Page<CommunitySearchResult>> {
    void viewerId;
    const limit = clampLimit(input.limit);
    const term = (input.query ?? '').trim();
    const byName = term.length >= 2;
    try {
      let builder = this.db
        .selectFrom('community as c')
        .select([
          'c.id',
          'c.name',
          'c.description',
          'c.join_policy',
          'c.avatar_path',
          sql<string>`c.created_at::text`.as('created_key'),
          MEMBER_COUNT.as('member_count'),
        ])
        .limit(limit + 1);

      if (byName) {
        builder = builder
          .where(
            sql<SqlBool>`immutable_unaccent(${term}::text) <% immutable_unaccent(c.name)`,
          )
          .orderBy('c.name')
          .orderBy('c.id');
        if (input.cursor !== undefined) {
          const key = decodeCursor<{ name?: unknown; id?: unknown }>(
            input.cursor,
          );
          if (typeof key.name !== 'string' || typeof key.id !== 'string') {
            throw new DataError('INVALID_CURSOR', 'Invalid cursor');
          }
          builder = builder.where(
            sql<SqlBool>`(c.name, c.id) > (${key.name}::text, ${key.id}::uuid)`,
          );
        }
      } else {
        builder = builder
          .orderBy('c.created_at', 'desc')
          .orderBy('c.id', 'desc');
        if (input.cursor !== undefined) {
          const key = decodeCursor<{ createdAt?: unknown; id?: unknown }>(
            input.cursor,
          );
          if (typeof key.createdAt !== 'string' || typeof key.id !== 'string') {
            throw new DataError('INVALID_CURSOR', 'Invalid cursor');
          }
          builder = builder.where(
            sql<SqlBool>`(c.created_at, c.id) < (${key.createdAt}::timestamptz, ${key.id}::uuid)`,
          );
        }
      }

      const rows = await builder.execute();
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      const nextCursor =
        rows.length > limit && last !== undefined
          ? byName
            ? encodeCursor({ name: last.name, id: last.id })
            : encodeCursor({ createdAt: last.created_key, id: last.id })
          : null;
      return {
        items: pageRows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          joinPolicy: row.join_policy,
          avatarPath: row.avatar_path,
          memberCount: row.member_count,
        })),
        nextCursor,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns a community as seen by a viewer: its details, the viewer's role and whether the viewer has a pending request.
   * Communities are public.
   * Errors: none.
   * Outcome: `null` when the community does not exist.
   */
  async getCommunity(
    viewerId: string,
    id: string,
  ): Promise<CommunityDetails | null> {
    try {
      const row = await this.db
        .selectFrom('community as c')
        .select([
          'c.id',
          'c.name',
          'c.description',
          'c.join_policy',
          'c.avatar_path',
          'c.created_at',
          MEMBER_COUNT.as('member_count'),
          sql<CommunityRole | null>`(SELECT cm.role FROM community_member cm
            WHERE cm.community_id = c.id AND cm.user_id = ${viewerId}::uuid)`.as(
            'viewer_role',
          ),
          sql<boolean>`EXISTS (SELECT 1 FROM community_join_request r
            WHERE r.community_id = c.id AND r.user_id = ${viewerId}::uuid AND r.status = 'pending')`.as(
            'viewer_pending',
          ),
        ])
        .where('c.id', '=', id)
        .executeTakeFirst();
      if (row === undefined) {
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        joinPolicy: row.join_policy,
        avatarPath: row.avatar_path,
        memberCount: row.member_count,
        createdAt: row.created_at,
        viewerRole: row.viewer_role,
        viewerRequestStatus: row.viewer_pending === true ? 'pending' : null,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the members of a community by username. Members only. Members blocked with the viewer are hidden (BR-SOC-04).
   * Rules: BR-SOC-09, BR-SOC-02.
   * Errors: `INVALID_CURSOR`.
   * Outcome: `null` when the viewer is not a member; otherwise a cursor page.
   */
  async listMembers(
    viewerId: string,
    id: string,
    page: PageRequest = {},
  ): Promise<Page<CommunityMember> | null> {
    const limit = clampLimit(page.limit);
    const key = page.cursor !== undefined ? parseUserCursor(page.cursor) : null;
    try {
      return await this.db.transaction().execute(async (trx) => {
        const viewerRole = await this.roleOf(trx, id, viewerId);
        if (viewerRole === null) {
          return null;
        }
        let builder = trx
          .selectFrom('community_member as cm')
          .innerJoin('user_account as u', 'u.id', 'cm.user_id')
          .select([
            'u.id',
            'u.username',
            'u.avatar_path',
            'cm.role',
            'cm.joined_at',
          ])
          .where('cm.community_id', '=', id)
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
          userId: row.id,
          username: row.username,
          avatarPath: row.avatar_path,
          role: row.role,
          joinedAt: row.joined_at,
        }));
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the communities of a user with the user's role and the member count, sorted by name.
   * Outcome: the communities, not paginated.
   */
  async listMyCommunities(userId: string): Promise<MyCommunity[]> {
    try {
      const rows = await this.db
        .selectFrom('community_member as m')
        .innerJoin('community as c', 'c.id', 'm.community_id')
        .select([
          'c.id',
          'c.name',
          'c.avatar_path',
          'm.role',
          MEMBER_COUNT.as('member_count'),
        ])
        .where('m.user_id', '=', userId)
        .orderBy('c.name')
        .orderBy('c.id')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        avatarPath: row.avatar_path,
        role: row.role,
        memberCount: row.member_count,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the pending join requests of a community, oldest first.
   * Rules: BR-SOC-09. The developers check that the caller is the owner or a moderator.
   * Outcome: the requests, not paginated.
   */
  async listPendingJoinRequests(
    communityId: string,
  ): Promise<PendingJoinRequest[]> {
    try {
      const rows = await this.db
        .selectFrom('community_join_request as r')
        .innerJoin('user_account as u', 'u.id', 'r.user_id')
        .select([
          'r.id as request_id',
          'u.id as user_id',
          'u.username',
          'u.avatar_path',
          'r.created_at',
        ])
        .where('r.community_id', '=', communityId)
        .where('r.status', '=', 'pending')
        .orderBy('r.created_at')
        .orderBy('r.id')
        .execute();
      return rows.map((row) => ({
        requestId: row.request_id,
        userId: row.user_id,
        username: row.username,
        avatarPath: row.avatar_path,
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Role of a user in a community, or null when not a member. Runs on `db` or on a transaction. */
  private async roleOf(
    db: Kysely<DB>,
    communityId: string,
    userId: string,
  ): Promise<CommunityRole | null> {
    const row = await db
      .selectFrom('community_member')
      .select('role')
      .where('community_id', '=', communityId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  /** The oldest member (joined_at, then user_id) having one of the given roles, or undefined. BR-SOC-09. */
  private async oldestMember(
    trx: Kysely<DB>,
    communityId: string,
    roles: CommunityRole[],
  ): Promise<string | undefined> {
    const row = await trx
      .selectFrom('community_member')
      .select('user_id')
      .where('community_id', '=', communityId)
      .where('role', 'in', roles)
      .orderBy('joined_at')
      .orderBy('user_id')
      .limit(1)
      .executeTakeFirst();
    return row?.user_id;
  }
}
