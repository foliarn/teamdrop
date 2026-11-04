import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type SqlBool, type Updateable, sql } from 'kysely';
import {
  type DataError,
  AlreadyMemberError,
  BlockedError,
  InvalidStateError,
  InvitationAlreadyPendingError,
  InvitePolicyError,
  NotFoundError,
  NotMemberError,
  OwnerCannotBeRemovedError,
  SelfActionError,
} from '../errors';
import { writeAudit } from '../internal/audit';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { lockCircle, lockUsers } from '../internal/locks';
import { toCircle } from '../internal/mappers/social.mapper';
import {
  areFriends,
  asUuid,
  blockedBetween,
  isBlocked,
} from '../internal/visibility';
import type {
  ApproveInvitationOutcome,
  Circle,
  CircleDetails,
  CircleMember,
  CircleRole,
  CreateCircleInput,
  InviteOutcome,
  LeaveCircleOutcome,
  MyCircle,
  MyCircleInvitation,
  PendingCircleApproval,
  UpdateCirclePatch,
} from '../types/social.types';

/** Constraints of `circle_member`. */
const MEMBER_CONSTRAINTS: Record<string, () => DataError> = {
  fk_circle_member_user_id: () => new NotFoundError('User not found'),
  fk_circle_member_circle_id: () => new NotFoundError('Circle not found'),
  pk_circle_member: () => new AlreadyMemberError(),
};

/** Constraints of `circle_invitation`. */
const INVITATION_CONSTRAINTS: Record<string, () => DataError> = {
  uq_circle_invitation_pending: () => new InvitationAlreadyPendingError(),
  ck_circle_invitation_not_self: () => new SelfActionError(),
  fk_circle_invitation_invitee_id: () => new NotFoundError('User not found'),
  fk_circle_invitation_circle_id: () => new NotFoundError('Circle not found'),
  fk_circle_invitation_inviter_id: () => new NotFoundError('User not found'),
};

/** Circle membership, roles, invitations and ownership hand-over (BR-SOC-05 to BR-SOC-08). */
@Injectable()
export class CircleRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Creates a circle. The creator becomes its `owner` member, in the same transaction.
   * Rules: BR-SOC-05 (exactly one owner).
   * Errors: `NotFoundError` (unknown user).
   * Outcome: the new circle.
   */
  async createCircle(
    ownerId: string,
    input: CreateCircleInput,
  ): Promise<Circle> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const circle = await trx
          .insertInto('circle')
          .values({ name: input.name, description: input.description ?? null })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('circle_member')
          .values({
            circle_id: circle.id,
            user_id: ownerId,
            role: 'owner',
            joined_at: new Date(),
          })
          .execute();
        return toCircle(circle);
      });
    } catch (err) {
      throw mapDbError(err, MEMBER_CONSTRAINTS);
    }
  }

  /**
   * Updates the name and/or description of a circle. Only the given fields change.
   * Rules: BR-SOC-05. The developers check that the caller is an owner or admin.
   * Errors: `NotFoundError`.
   * Outcome: none.
   */
  async updateCircle(
    circleId: string,
    patch: UpdateCirclePatch,
  ): Promise<void> {
    const values: Updateable<DB['circle']> = {};
    if (patch.name !== undefined) {
      values.name = patch.name;
    }
    if (patch.description !== undefined) {
      values.description = patch.description;
    }
    try {
      if (Object.keys(values).length === 0) {
        const exists = await this.db
          .selectFrom('circle')
          .select('id')
          .where('id', '=', circleId)
          .executeTakeFirst();
        if (exists === undefined) {
          throw new NotFoundError('Circle not found');
        }
        return;
      }
      const result = await this.db
        .updateTable('circle')
        .set(values)
        .where('id', '=', circleId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('Circle not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Deletes a circle. Its memberships, invitations and (in batch 2) chat are deleted with it.
   * Rules: BR-SOC-07 (a circle can be deleted), BR-MSG-06. The developers check that the caller is the owner.
   * Errors: `NotFoundError`.
   * Outcome: none.
   */
  async deleteCircle(circleId: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('circle')
        .where('id', '=', circleId)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Circle not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Invites `inviteeId` to a circle on behalf of `inviterId`. Checks, in this order:
   * the inviter is a member; not self; the invitee is not already a member; not blocked in either direction;
   * the invitee's circle invitation setting accepts this inviter; no pending invitation exists.
   * A member's invitation waits for an admin (`awaiting_admin`). An owner's or admin's goes straight to the
   * invitee (`awaiting_invitee`).
   *
   * Rules: BR-SOC-02 (blocking), BR-SOC-06 (invitation flow), BR-ACC-15 (who may invite me).
   * Errors: `NotMemberError`, `SelfActionError`, `AlreadyMemberError`, `BlockedError`, `InvitePolicyError`,
   * `InvitationAlreadyPendingError`, `NotFoundError`.
   * Outcome: the invitation id and its first status.
   */
  async invite(
    circleId: string,
    inviterId: string,
    inviteeId: string,
  ): Promise<InviteOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        // BR-SOC-06: only members invite.
        const inviter = await trx
          .selectFrom('circle_member')
          .select('role')
          .where('circle_id', '=', circleId)
          .where('user_id', '=', inviterId)
          .executeTakeFirst();
        if (inviter === undefined) {
          throw new NotMemberError();
        }
        if (inviterId === inviteeId) {
          throw new SelfActionError();
        }
        await lockUsers(trx, [inviterId, inviteeId]);

        const alreadyMember = await trx
          .selectFrom('circle_member')
          .select('user_id')
          .where('circle_id', '=', circleId)
          .where('user_id', '=', inviteeId)
          .executeTakeFirst();
        if (alreadyMember !== undefined) {
          throw new AlreadyMemberError();
        }

        // BR-SOC-02: no invitation between users blocked in either direction.
        if (await isBlocked(trx, inviterId, inviteeId)) {
          throw new BlockedError();
        }

        // BR-ACC-15: the invitee's circle invitation setting.
        const invitee = await trx
          .selectFrom('user_setting as s')
          .where('s.user_id', '=', inviteeId)
          .select((eb) => [
            's.circle_invite_policy',
            areFriends(asUuid(inviterId), eb.ref('s.user_id')).as('friends'),
          ])
          .executeTakeFirst();
        if (invitee === undefined) {
          throw new NotFoundError('User not found');
        }
        if (invitee.circle_invite_policy === 'nobody') {
          throw new InvitePolicyError();
        }
        if (
          invitee.circle_invite_policy === 'friends' &&
          invitee.friends !== true
        ) {
          throw new InvitePolicyError();
        }

        // BR-SOC-06: an admin's or owner's invitation goes straight to the invitee; a member's waits for an admin.
        const status: 'awaiting_admin' | 'awaiting_invitee' =
          inviter.role === 'member' ? 'awaiting_admin' : 'awaiting_invitee';
        const invitation = await trx
          .insertInto('circle_invitation')
          .values({
            circle_id: circleId,
            invitee_id: inviteeId,
            inviter_id: inviterId,
            status,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { invitationId: invitation.id, status };
      });
    } catch (err) {
      throw mapDbError(err, {
        ...MEMBER_CONSTRAINTS,
        ...INVITATION_CONSTRAINTS,
      });
    }
  }

  /**
   * Approves a member's invitation: `awaiting_admin` becomes `awaiting_invitee`, and `adminId` is recorded.
   * Rules: BR-SOC-06. The developers check that `adminId` is an owner or admin of the circle.
   * Errors: `NotFoundError`, `InvalidStateError` (not awaiting an admin).
   * Outcome: the invitee's id, so that the developers can notify them.
   */
  async approveInvitation(
    invitationId: string,
    adminId: string,
  ): Promise<ApproveInvitationOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const invitation = await trx
          .selectFrom('circle_invitation')
          .select(['invitee_id', 'status'])
          .where('id', '=', invitationId)
          .forUpdate()
          .executeTakeFirst();
        if (invitation === undefined) {
          throw new NotFoundError('Invitation not found');
        }
        if (invitation.status !== 'awaiting_admin') {
          throw new InvalidStateError(
            'The invitation is not awaiting an admin',
          );
        }
        await trx
          .updateTable('circle_invitation')
          .set({ status: 'awaiting_invitee', approved_by_id: adminId })
          .where('id', '=', invitationId)
          .execute();
        return { inviteeId: invitation.invitee_id };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Rejects a member's invitation: `awaiting_admin` becomes `rejected_by_admin`.
   * Rules: BR-SOC-06. The developers check that `adminId` is an owner or admin of the circle.
   * The rejecting admin is recorded in the audit log (`circle.invitation_rejected`, BR-MOD-05).
   * Errors: `NotFoundError`, `InvalidStateError`.
   * Outcome: none.
   */
  async rejectInvitation(invitationId: string, adminId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const invitation = await trx
          .selectFrom('circle_invitation')
          .select(['status', 'circle_id', 'invitee_id'])
          .where('id', '=', invitationId)
          .forUpdate()
          .executeTakeFirst();
        if (invitation === undefined) {
          throw new NotFoundError('Invitation not found');
        }
        if (invitation.status !== 'awaiting_admin') {
          throw new InvalidStateError(
            'The invitation is not awaiting an admin',
          );
        }
        await trx
          .updateTable('circle_invitation')
          .set({ status: 'rejected_by_admin', responded_at: new Date() })
          .where('id', '=', invitationId)
          .execute();
        // BR-MOD-05 (handover item 6): who rejected is kept in the audit log.
        await writeAudit(trx, adminId, {
          action: 'circle.invitation_rejected',
          targetTable: 'circle_invitation',
          targetId: invitationId,
          details: {
            circleId: invitation.circle_id,
            inviteeId: invitation.invitee_id,
          },
        });
      });
    } catch (err) {
      throw mapDbError(err, {
        fk_audit_log_actor_id: () => new NotFoundError('User not found'),
      });
    }
  }

  /**
   * The invitee answers an invitation that awaits their answer. Accepting adds them as a `member`.
   * Accepting stays allowed when the users were blocked after the invitation was sent: the rule only stops new
   * invitations (BR-SOC-02, BR-SOC-06).
   * Rules: BR-SOC-06.
   * Errors: `NotFoundError` (not this invitee's invitation), `InvalidStateError` (not awaiting the invitee),
   * `AlreadyMemberError`.
   * Outcome: none.
   */
  async respondToInvitation(
    invitationId: string,
    inviteeId: string,
    accept: boolean,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const invitation = await trx
          .selectFrom('circle_invitation')
          .select(['circle_id', 'invitee_id', 'status'])
          .where('id', '=', invitationId)
          .forUpdate()
          .executeTakeFirst();
        if (invitation === undefined || invitation.invitee_id !== inviteeId) {
          throw new NotFoundError('Invitation not found');
        }
        if (invitation.status !== 'awaiting_invitee') {
          throw new InvalidStateError(
            'The invitation is not awaiting the invitee',
          );
        }
        if (accept) {
          await trx
            .insertInto('circle_member')
            .values({
              circle_id: invitation.circle_id,
              user_id: inviteeId,
              role: 'member',
              joined_at: new Date(),
            })
            .execute();
        }
        await trx
          .updateTable('circle_invitation')
          .set({
            status: accept ? 'accepted' : 'declined',
            responded_at: new Date(),
          })
          .where('id', '=', invitationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, MEMBER_CONSTRAINTS);
    }
  }

  /**
   * Cancels a pending invitation (`awaiting_admin` or `awaiting_invitee`).
   * Rules: BR-SOC-06. The developers check that the caller is the inviter, an admin or the owner.
   * Errors: `NotFoundError`, `InvalidStateError` (not pending).
   * Outcome: none.
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const invitation = await trx
          .selectFrom('circle_invitation')
          .select('status')
          .where('id', '=', invitationId)
          .forUpdate()
          .executeTakeFirst();
        if (invitation === undefined) {
          throw new NotFoundError('Invitation not found');
        }
        if (
          invitation.status !== 'awaiting_admin' &&
          invitation.status !== 'awaiting_invitee'
        ) {
          throw new InvalidStateError('The invitation is not pending');
        }
        await trx
          .updateTable('circle_invitation')
          .set({ status: 'cancelled' })
          .where('id', '=', invitationId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * The user leaves a circle. When the owner leaves, ownership passes to the oldest admin, or to the oldest member
   * when there is no admin. When nobody is left, the circle is deleted. The circle row is locked first, so
   * concurrent departures are serialized.
   *
   * Rules: BR-SOC-05 (exactly one owner), BR-SOC-07 (hand-over order).
   * Errors: `NotFoundError` (circle), `NotMemberError`.
   * Outcome: the new owner (or null) and whether the circle was deleted.
   */
  async leaveCircle(
    circleId: string,
    userId: string,
  ): Promise<LeaveCircleOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await lockCircle(trx, circleId);
        const me = await trx
          .selectFrom('circle_member')
          .select('role')
          .where('circle_id', '=', circleId)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (me === undefined) {
          throw new NotMemberError();
        }
        await trx
          .deleteFrom('circle_member')
          .where('circle_id', '=', circleId)
          .where('user_id', '=', userId)
          .execute();

        if (me.role !== 'owner') {
          return { newOwnerId: null, circleDeleted: false };
        }
        // BR-SOC-07: oldest admin first, then oldest member.
        const successor =
          (await this.oldestMember(trx, circleId, ['admin'])) ??
          (await this.oldestMember(trx, circleId, ['member']));
        if (successor === undefined) {
          await trx.deleteFrom('circle').where('id', '=', circleId).execute();
          return { newOwnerId: null, circleDeleted: true };
        }
        await trx
          .updateTable('circle_member')
          .set({ role: 'owner' })
          .where('circle_id', '=', circleId)
          .where('user_id', '=', successor)
          .execute();
        return { newOwnerId: successor, circleDeleted: false };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Removes a member from a circle. The owner cannot be removed: transfer ownership first.
   * Rules: BR-SOC-05, BR-SOC-07. The developers check the caller's role.
   * Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
   * Outcome: none.
   */
  async removeMember(circleId: string, userId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCircle(trx, circleId);
        const role = await this.roleOf(trx, circleId, userId);
        if (role === null) {
          throw new NotMemberError();
        }
        if (role === 'owner') {
          throw new OwnerCannotBeRemovedError();
        }
        await trx
          .deleteFrom('circle_member')
          .where('circle_id', '=', circleId)
          .where('user_id', '=', userId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Sets the role of a member to `admin` or `member`. The owner's role cannot change here: use `transferOwnership`.
   * Rules: BR-SOC-05. The developers check the caller's role.
   * Errors: `NotMemberError`, `OwnerCannotBeRemovedError`, `NotFoundError`.
   * Outcome: none.
   */
  async setMemberRole(
    circleId: string,
    userId: string,
    role: 'admin' | 'member',
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCircle(trx, circleId);
        const current = await this.roleOf(trx, circleId, userId);
        if (current === null) {
          throw new NotMemberError();
        }
        if (current === 'owner') {
          throw new OwnerCannotBeRemovedError(
            'Use transferOwnership to change the owner',
          );
        }
        await trx
          .updateTable('circle_member')
          .set({ role })
          .where('circle_id', '=', circleId)
          .where('user_id', '=', userId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Transfers ownership to a member. The former owner becomes an `admin`. Transferring to the current owner does nothing.
   * Rules: BR-SOC-05 (exactly one owner), BR-SOC-07. The developers check that the caller is the owner.
   * Errors: `NotMemberError` (new owner is not a member), `NotFoundError`.
   * Outcome: none.
   */
  async transferOwnership(circleId: string, newOwnerId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await lockCircle(trx, circleId);
        const newRole = await this.roleOf(trx, circleId, newOwnerId);
        if (newRole === null) {
          throw new NotMemberError();
        }
        if (newRole === 'owner') {
          return;
        }
        const oldOwner = await trx
          .selectFrom('circle_member')
          .select('user_id')
          .where('circle_id', '=', circleId)
          .where('role', '=', 'owner')
          .executeTakeFirst();
        // The old owner is demoted first: the partial unique index allows one owner at a time.
        if (oldOwner !== undefined) {
          await trx
            .updateTable('circle_member')
            .set({ role: 'admin' })
            .where('circle_id', '=', circleId)
            .where('user_id', '=', oldOwner.user_id)
            .execute();
        }
        await trx
          .updateTable('circle_member')
          .set({ role: 'owner' })
          .where('circle_id', '=', circleId)
          .where('user_id', '=', newOwnerId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns the role of a user in a circle, or null when the user is not a member.
   * Used by the developers' permission checks.
   * Outcome: `'owner' | 'admin' | 'member' | null`.
   */
  async getMemberRole(
    circleId: string,
    userId: string,
  ): Promise<CircleRole | null> {
    try {
      return await this.roleOf(this.db, circleId, userId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the circles of a user with the user's role and the member count.
   * Rules: BR-SOC-05 (circles are private to their members).
   * Outcome: the circles, sorted by name, not paginated.
   */
  async listMyCircles(userId: string): Promise<MyCircle[]> {
    try {
      const rows = await this.db
        .selectFrom('circle_member as m')
        .innerJoin('circle as c', 'c.id', 'm.circle_id')
        .select([
          'c.id',
          'c.name',
          'c.description',
          'm.role',
          sql<number>`(SELECT count(*)::int FROM circle_member cm WHERE cm.circle_id = c.id)`.as(
            'member_count',
          ),
        ])
        .where('m.user_id', '=', userId)
        .orderBy('c.name')
        .orderBy('c.id')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        role: row.role,
        memberCount: row.member_count,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns a circle to one of its members. Circles are private (BR-SOC-05).
   * Errors: none.
   * Outcome: `null` when the viewer is not a member (or the circle does not exist); otherwise the details.
   */
  async getCircle(
    viewerId: string,
    circleId: string,
  ): Promise<CircleDetails | null> {
    try {
      const row = await this.db
        .selectFrom('circle as c')
        .innerJoin('circle_member as m', (join) =>
          join.onRef('m.circle_id', '=', 'c.id').on('m.user_id', '=', viewerId),
        )
        .select([
          'c.id',
          'c.name',
          'c.description',
          'c.created_at',
          'm.role as viewer_role',
          sql<number>`(SELECT count(*)::int FROM circle_member cm WHERE cm.circle_id = c.id)`.as(
            'member_count',
          ),
        ])
        .where('c.id', '=', circleId)
        .executeTakeFirst();
      if (row === undefined) {
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
        memberCount: row.member_count,
        viewerRole: row.viewer_role,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the members of a circle, oldest member first. Members only (BR-SOC-05). A member blocked with the viewer
   * stays in the circle but is hidden from the viewer, and the viewer is hidden from them (BR-SOC-04).
   * Outcome: `null` when the viewer is not a member; otherwise the members, not paginated.
   */
  async listMembers(
    viewerId: string,
    circleId: string,
  ): Promise<CircleMember[] | null> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const viewer = await this.roleOf(trx, circleId, viewerId);
        if (viewer === null) {
          return null;
        }
        const rows = await trx
          .selectFrom('circle_member as cm')
          .innerJoin('user_account as u', 'u.id', 'cm.user_id')
          .select([
            'u.id',
            'u.username',
            'u.avatar_path',
            'cm.role',
            'cm.joined_at',
          ])
          .where('cm.circle_id', '=', circleId)
          .where(
            sql<SqlBool>`NOT ${blockedBetween(asUuid(viewerId), sql<string>`u.id`)}`,
          )
          .orderBy('cm.joined_at')
          .orderBy('cm.user_id')
          .execute();
        return rows.map((row) => ({
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
   * Lists the invitations waiting for the user's answer (`awaiting_invitee`), oldest first.
   * Outcome: the invitations, with the circle name and the inviter's username.
   */
  async listMyInvitations(userId: string): Promise<MyCircleInvitation[]> {
    try {
      const rows = await this.db
        .selectFrom('circle_invitation as i')
        .innerJoin('circle as c', 'c.id', 'i.circle_id')
        .leftJoin('user_account as inviter', 'inviter.id', 'i.inviter_id')
        .select([
          'i.id as invitation_id',
          'c.id as circle_id',
          'c.name as circle_name',
          'inviter.username as inviter_username',
          'i.created_at',
        ])
        .where('i.invitee_id', '=', userId)
        .where('i.status', '=', 'awaiting_invitee')
        .orderBy('i.created_at')
        .orderBy('i.id')
        .execute();
      return rows.map((row) => ({
        invitationId: row.invitation_id,
        circleId: row.circle_id,
        circleName: row.circle_name,
        inviterUsername: row.inviter_username,
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the member invitations waiting for an admin's approval (`awaiting_admin`), oldest first.
   * Rules: BR-SOC-06. The developers check that the caller is an owner or admin of the circle.
   * Outcome: the invitations, with the invitee's and inviter's usernames.
   */
  async listPendingApprovals(
    circleId: string,
  ): Promise<PendingCircleApproval[]> {
    try {
      const rows = await this.db
        .selectFrom('circle_invitation as i')
        .innerJoin('user_account as invitee', 'invitee.id', 'i.invitee_id')
        .leftJoin('user_account as inviter', 'inviter.id', 'i.inviter_id')
        .select([
          'i.id as invitation_id',
          'invitee.id as invitee_id',
          'invitee.username as invitee_username',
          'inviter.id as inviter_id',
          'inviter.username as inviter_username',
          'i.created_at',
        ])
        .where('i.circle_id', '=', circleId)
        .where('i.status', '=', 'awaiting_admin')
        .orderBy('i.created_at')
        .orderBy('i.id')
        .execute();
      return rows.map((row) => ({
        invitationId: row.invitation_id,
        inviteeId: row.invitee_id,
        inviteeUsername: row.invitee_username,
        inviterId: row.inviter_id,
        inviterUsername: row.inviter_username,
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Role of a user in a circle, or null when not a member. Runs on `db` or on a transaction. */
  private async roleOf(
    db: Kysely<DB>,
    circleId: string,
    userId: string,
  ): Promise<CircleRole | null> {
    const row = await db
      .selectFrom('circle_member')
      .select('role')
      .where('circle_id', '=', circleId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  /** The oldest member (joined_at, then user_id) having one of the given roles, or undefined. BR-SOC-07. */
  private async oldestMember(
    trx: Kysely<DB>,
    circleId: string,
    roles: CircleRole[],
  ): Promise<string | undefined> {
    const row = await trx
      .selectFrom('circle_member')
      .select('user_id')
      .where('circle_id', '=', circleId)
      .where('role', 'in', roles)
      .orderBy('joined_at')
      .orderBy('user_id')
      .limit(1)
      .executeTakeFirst();
    return row?.user_id;
  }
}
