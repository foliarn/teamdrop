import { Inject, Injectable } from '@nestjs/common';
import {
  type Expression,
  type ExpressionBuilder,
  type Kysely,
  type SqlBool,
  sql,
} from 'kysely';
import { type DataError, NotFoundError, SelfActionError } from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { lockUsers } from '../internal/locks';
import { ACTIVE_REGISTRATION_STATUSES } from '../internal/occurrences';
import type {
  BlockedUser,
  BlockOutcome,
  BlockRecord,
} from '../types/social.types';

/** Constraints of `user_block` that refer to users. */
const BLOCK_CONSTRAINTS: Record<string, () => DataError> = {
  fk_user_block_blocker_id: () => new NotFoundError('User not found'),
  fk_user_block_blocked_id: () => new NotFoundError('User not found'),
  ck_user_block_not_self: () => new SelfActionError(),
};

/** Filter on rows of `circle_invitation` where `inviter` invites `invitee`, or the reverse. */
function invitationsBetween(
  first: string,
  second: string,
): (eb: ExpressionBuilder<DB, 'circle_invitation'>) => Expression<SqlBool> {
  return (eb) =>
    eb.or([
      eb.and([eb('inviter_id', '=', first), eb('invitee_id', '=', second)]),
      eb.and([eb('inviter_id', '=', second), eb('invitee_id', '=', first)]),
    ]);
}

/** Filter on rows of `follow` between two users, in either direction. */
function followsBetween(
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
 * Blocks and unblocks users, and lists blocks (BR-SOC-02 to BR-SOC-04).
 * A block is total and mutual; it never removes circle or community memberships (BR-SOC-04).
 */
@Injectable()
export class BlockRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Blocks `blockedId` on behalf of `blockerId`, in one transaction:
   * - inserts the block (idempotent);
   * - removes the follows in both directions, including pending requests;
   * - cancels the pending circle invitations between the two users, whoever invited whom.
   * Memberships and chats are kept (BR-SOC-04).
   *
   * Rules: BR-SOC-02, BR-SOC-03 (shared upcoming occurrences), BR-SOC-04.
   * Errors: `SelfActionError`, `NotFoundError` (unknown user).
   * Outcome: `sharedUpcomingOccurrenceIds`, for the BR-SOC-03 warning: scheduled occurrences that start later and where
   * both users hold an active registration.
   */
  async block(blockerId: string, blockedId: string): Promise<BlockOutcome> {
    if (blockerId === blockedId) {
      throw new SelfActionError();
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        await lockUsers(trx, [blockerId, blockedId]);

        // BR-SOC-02: blocking is idempotent.
        await trx
          .insertInto('user_block')
          .values({ blocker_id: blockerId, blocked_id: blockedId })
          .onConflict((oc) =>
            oc.columns(['blocker_id', 'blocked_id']).doNothing(),
          )
          .execute();

        // BR-SOC-02: follows are removed in both directions (pending requests included).
        await trx
          .deleteFrom('follow')
          .where(followsBetween(blockerId, blockedId))
          .execute();

        // BR-SOC-02: pending circle invitations between the two users are cancelled.
        await trx
          .updateTable('circle_invitation')
          .set({ status: 'cancelled' })
          .where(invitationsBetween(blockerId, blockedId))
          .where('status', 'in', ['awaiting_admin', 'awaiting_invitee'])
          .execute();

        // BR-SOC-03: both users stay registered; the upcoming occurrences they share are returned for the warning.
        const shared = await trx
          .selectFrom('event_occurrence as o')
          .select('o.id')
          .where('o.status', '=', 'scheduled')
          .where(sql<SqlBool>`o.starts_at > now()`)
          .where((eb) =>
            eb.and([
              eb.exists(
                eb
                  .selectFrom('registration as r')
                  .select('r.id')
                  .whereRef('r.occurrence_id', '=', 'o.id')
                  .where('r.user_id', '=', blockerId)
                  .where('r.status', 'in', [...ACTIVE_REGISTRATION_STATUSES]),
              ),
              eb.exists(
                eb
                  .selectFrom('registration as r')
                  .select('r.id')
                  .whereRef('r.occurrence_id', '=', 'o.id')
                  .where('r.user_id', '=', blockedId)
                  .where('r.status', 'in', [...ACTIVE_REGISTRATION_STATUSES]),
              ),
            ]),
          )
          .orderBy('o.starts_at')
          .orderBy('o.id')
          .execute();
        return { sharedUpcomingOccurrenceIds: shared.map((row) => row.id) };
      });
    } catch (err) {
      throw mapDbError(err, BLOCK_CONSTRAINTS);
    }
  }

  /**
   * Removes the block set by `blockerId` on `blockedId`. Unblocking does not restore the follows that the block removed.
   * Rules: BR-SOC-02.
   * Errors: none when the block does not exist.
   * Outcome: none.
   */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    try {
      await this.db
        .deleteFrom('user_block')
        .where('blocker_id', '=', blockerId)
        .where('blocked_id', '=', blockedId)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the users blocked by `userId`, most recent block first.
   * Rules: BR-SOC-02.
   * Outcome: the blocked users, not paginated.
   */
  async listMyBlocks(userId: string): Promise<BlockedUser[]> {
    try {
      const rows = await this.db
        .selectFrom('user_block as b')
        .innerJoin('user_account as u', 'u.id', 'b.blocked_id')
        .select(['u.id', 'u.username', 'u.avatar_path', 'b.created_at'])
        .where('b.blocker_id', '=', userId)
        .orderBy('b.created_at', 'desc')
        .orderBy('u.id')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        username: row.username,
        avatarPath: row.avatar_path,
        blockedAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists every block in which `userId` is the blocker or the blocked user.
   * Rules: BR-SOC-04 (admins can see blocks). The developers check the admin role.
   * Outcome: the block rows, oldest first, not paginated.
   */
  async listBlocksOfUser(userId: string): Promise<BlockRecord[]> {
    try {
      const rows = await this.db
        .selectFrom('user_block')
        .select(['blocker_id', 'blocked_id', 'created_at'])
        .where((eb) =>
          eb.or([eb('blocker_id', '=', userId), eb('blocked_id', '=', userId)]),
        )
        .orderBy('created_at')
        .orderBy('blocker_id')
        .orderBy('blocked_id')
        .execute();
      return rows.map((row) => ({
        blockerId: row.blocker_id,
        blockedId: row.blocked_id,
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }
}
