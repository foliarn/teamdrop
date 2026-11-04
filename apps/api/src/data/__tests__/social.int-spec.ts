import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { CircleRepository } from '../repositories/circle.repository';
import { CommunityRepository } from '../repositories/community.repository';
import { FollowRepository } from '../repositories/follow.repository';
import { UserRepository } from '../repositories/user.repository';
import { DataError } from '../errors';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';

/** Resolves with the DataError code thrown by `fn`, or fails when nothing (or another error) is thrown. */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DataError) {
      return err.code;
    }
    throw err;
  }
  throw new Error('Expected a DataError, but the call succeeded');
}

describe('Social (batch 1B)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const users = new UserRepository(db);
  const follows = new FollowRepository(db);
  const blocks = new BlockRepository(db);
  const circles = new CircleRepository(db);
  const communities = new CommunityRepository(db);
  let refs: MinimalRefs;
  let counter = 0;

  /** Creates an account with a unique username and email. Users created later have larger UUID v7 ids. */
  async function newUser(name: string): Promise<string> {
    counter += 1;
    const username = `${name}${counter}`;
    return (
      await auth.createUserWithPassword({
        username,
        email: `${username}@social.test`,
        passwordHash: '$argon2id$placeholder',
        firstName: name,
        birthDate: '1990-01-01',
        municipalityId: refs.municipalities.paris8,
      })
    ).userId;
  }

  /** Adds `userId` to a circle as an invited member: the owner invites, the invitee accepts. */
  async function joinCircle(
    circleId: string,
    inviterId: string,
    userId: string,
  ): Promise<void> {
    const { invitationId } = await circles.invite(circleId, inviterId, userId);
    await circles.respondToInvitation(invitationId, userId, true);
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    // Leave the test database empty for the pgTAP suite, which expects no rows.
    await truncateAll(owner);
    await Promise.all([db.destroy(), owner.destroy()]);
  });

  describe('follows', () => {
    it('BR-SOC-01: following a public account is accepted at once, and following again is idempotent', async () => {
      const a = await newUser('pubA');
      const b = await newUser('pubB');

      expect(await follows.follow(a, b)).toEqual({ status: 'accepted' });
      expect(await follows.follow(a, b)).toEqual({ status: 'accepted' });
      const relation = await follows.getRelationship(a, b);
      expect(relation.following).toBe('accepted');
    });

    it('BR-ACC-14: following a private account is pending until the owner accepts it', async () => {
      const owned = await newUser('privOwner');
      const requester = await newUser('privReq');
      await users.updateSettings(owned, { isPrivateAccount: true });

      expect(await follows.follow(requester, owned)).toEqual({
        status: 'pending',
      });
      const pending = await follows.listPendingFollowRequests(owned);
      expect(pending.map((p) => p.id)).toEqual([requester]);

      await follows.acceptFollowRequest(owned, requester);
      expect((await follows.getRelationship(requester, owned)).following).toBe(
        'accepted',
      );
      expect(await follows.listPendingFollowRequests(owned)).toEqual([]);
    });

    it('BR-SOC-01: a follow to oneself is refused with SELF_ACTION', async () => {
      const a = await newUser('selfFollow');
      expect(await codeOf(() => follows.follow(a, a))).toBe('SELF_ACTION');
    });

    it('BR-SOC-01: friends are listed only when the follow is mutual, and getRelationship reports both directions', async () => {
      const a = await newUser('frA');
      const b = await newUser('frB');
      const c = await newUser('frC');
      await follows.follow(a, b);
      await follows.follow(b, a);
      await follows.follow(c, a);

      const friendPage = await follows.listFriends(a, a);
      expect(friendPage?.items.map((u) => u.id)).toEqual([b]);

      const relation = await follows.getRelationship(a, b);
      expect(relation).toEqual({
        following: 'accepted',
        followedBy: 'accepted',
        friends: true,
        blockedByMe: false,
        blockedMe: false,
      });
      expect(await follows.getRelationship(a, c)).toMatchObject({
        following: 'none',
        followedBy: 'accepted',
        friends: false,
      });
    });

    it('BR-ACC-14: a follower list set to only_me is not visible to other viewers', async () => {
      const owned = await newUser('hiddenFol');
      const follower = await newUser('hiddenFan');
      const other = await newUser('hiddenOther');
      await follows.follow(follower, owned);
      await users.updateSettings(owned, { followsVisibility: 'only_me' });

      expect(await follows.listFollowers(other, owned)).toBeNull();
      expect(
        (await follows.listFollowers(owned, owned))?.items.map((u) => u.id),
      ).toEqual([follower]);
    });
  });

  describe('blocks', () => {
    it('BR-SOC-02: a block removes follows both ways, cancels pending invitations between them and keeps no shared follow', async () => {
      const a = await newUser('blkA');
      const b = await newUser('blkB');
      const circleId = (await circles.createCircle(a, { name: 'Block test' }))
        .id;
      await follows.follow(a, b);
      await follows.follow(b, a);
      await circles.invite(circleId, a, b);

      const outcome = await blocks.block(a, b);

      expect(outcome).toEqual({ sharedUpcomingOccurrenceIds: [] });
      expect(await follows.getRelationship(a, b)).toMatchObject({
        following: 'none',
        followedBy: 'none',
        blockedByMe: true,
        blockedMe: false,
      });
      expect(await circles.listMyInvitations(b)).toEqual([]);
    });

    it('BR-SOC-02: following after a block is refused with BLOCKED, and unblocking does not restore the follow', async () => {
      const a = await newUser('blkC');
      const b = await newUser('blkD');
      await blocks.block(a, b);

      expect(await codeOf(() => follows.follow(b, a))).toBe('BLOCKED');
      await blocks.unblock(a, b);
      expect((await follows.getRelationship(b, a)).blockedMe).toBe(false);
      expect((await follows.getRelationship(b, a)).following).toBe('none');
    });

    it('BR-SOC-02: getProfile returns null in both directions while blocked', async () => {
      const a = await newUser('profA');
      const b = await newUser('profB');
      await blocks.block(a, b);

      expect(await users.getProfile(a, b)).toBeNull();
      expect(await users.getProfile(b, a)).toBeNull();
    });

    it('BR-SOC-02: searchUsers hides a user blocked in either direction', async () => {
      const a = await newUser('searchA');
      const b = await newUser('searchB');
      const username = (await users.getProfile(b, b))?.username ?? '';
      await blocks.block(b, a);

      const found = await users.searchUsers(a, username);
      expect(found.items.map((u) => u.id)).not.toContain(b);
    });

    it('BR-ACC-14: a profile with friends visibility is shown to friends and hidden from others', async () => {
      const owned = await newUser('frVis');
      const friend = await newUser('frVisFriend');
      const stranger = await newUser('frVisStranger');
      await users.updateSettings(owned, { profileVisibility: 'friends' });
      await follows.follow(friend, owned);
      await follows.follow(owned, friend);

      expect((await users.getProfile(friend, owned))?.isHidden).toBe(false);
      expect((await users.getProfile(stranger, owned))?.isHidden).toBe(true);
    });

    it('BR-SOC-04: a block keeps the shared circle membership, and the blocked member is hidden only from each other', async () => {
      const organizer = await newUser('shareOrg');
      const a = await newUser('shareA');
      const b = await newUser('shareB');
      const circleId = (
        await circles.createCircle(organizer, { name: 'Shared circle' })
      ).id;
      await joinCircle(circleId, organizer, a);
      await joinCircle(circleId, organizer, b);

      await blocks.block(a, b);

      const forOrganizer = await circles.listMembers(organizer, circleId);
      expect(forOrganizer?.map((m) => m.userId).sort()).toEqual(
        [organizer, a, b].sort(),
      );
      const forA = await circles.listMembers(a, circleId);
      expect(forA?.map((m) => m.userId).sort()).toEqual([organizer, a].sort());
      expect(await circles.getMemberRole(circleId, b)).toBe('member');
    });
  });

  describe('circles', () => {
    it('BR-SOC-06: a member invitation waits for an admin, is then approved, and the invitee accepts', async () => {
      const ownerId = await newUser('circOwner');
      const memberId = await newUser('circMember');
      const invitee = await newUser('circInvitee');
      const circleId = (
        await circles.createCircle(ownerId, { name: 'Approval' })
      ).id;
      await joinCircle(circleId, ownerId, memberId);

      const invitation = await circles.invite(circleId, memberId, invitee);
      expect(invitation.status).toBe('awaiting_admin');
      expect(
        (await circles.listPendingApprovals(circleId)).map(
          (p) => p.invitationId,
        ),
      ).toEqual([invitation.invitationId]);

      const approved = await circles.approveInvitation(
        invitation.invitationId,
        ownerId,
      );
      expect(approved.inviteeId).toBe(invitee);
      expect(
        (await circles.listMyInvitations(invitee)).map((i) => i.invitationId),
      ).toEqual([invitation.invitationId]);

      await circles.respondToInvitation(invitation.invitationId, invitee, true);
      expect(await circles.getMemberRole(circleId, invitee)).toBe('member');
    });

    it('BR-SOC-06: an admin invitation goes straight to the invitee; a declined invitation can be re-sent', async () => {
      const ownerId = await newUser('directOwner');
      const invitee = await newUser('directInvitee');
      const circleId = (await circles.createCircle(ownerId, { name: 'Direct' }))
        .id;

      const first = await circles.invite(circleId, ownerId, invitee);
      expect(first.status).toBe('awaiting_invitee');
      await circles.respondToInvitation(first.invitationId, invitee, false);
      const second = await circles.invite(circleId, ownerId, invitee);
      expect(second.status).toBe('awaiting_invitee');
    });

    it('BR-SOC-06: a second pending invitation to the same invitee is refused with INVITATION_ALREADY_PENDING', async () => {
      const ownerId = await newUser('dupOwner');
      const invitee = await newUser('dupInvitee');
      const circleId = (
        await circles.createCircle(ownerId, { name: 'Duplicate' })
      ).id;
      await circles.invite(circleId, ownerId, invitee);

      expect(
        await codeOf(() => circles.invite(circleId, ownerId, invitee)),
      ).toBe('INVITATION_ALREADY_PENDING');
    });

    it('BR-ACC-15: an invitee whose setting is nobody cannot be invited, with INVITE_POLICY', async () => {
      const ownerId = await newUser('policyOwner');
      const invitee = await newUser('policyInvitee');
      await users.updateSettings(invitee, { circleInvitePolicy: 'nobody' });
      const circleId = (await circles.createCircle(ownerId, { name: 'Policy' }))
        .id;

      expect(
        await codeOf(() => circles.invite(circleId, ownerId, invitee)),
      ).toBe('INVITE_POLICY');
    });

    it('BR-SOC-07: when the owner leaves, the oldest admin becomes owner', async () => {
      const ownerId = await newUser('leaveOwner');
      const admin = await newUser('leaveAdmin');
      const member = await newUser('leaveMember');
      const circleId = (
        await circles.createCircle(ownerId, { name: 'Hand-over admin' })
      ).id;
      await joinCircle(circleId, ownerId, admin);
      await circles.setMemberRole(circleId, admin, 'admin');
      await joinCircle(circleId, ownerId, member);

      expect(await circles.leaveCircle(circleId, ownerId)).toEqual({
        newOwnerId: admin,
        circleDeleted: false,
      });
      expect(await circles.getMemberRole(circleId, admin)).toBe('owner');
    });

    it('BR-SOC-07: with no admin, the oldest member becomes owner', async () => {
      const ownerId = await newUser('noAdminOwner');
      const first = await newUser('noAdminFirst');
      const second = await newUser('noAdminSecond');
      const circleId = (
        await circles.createCircle(ownerId, { name: 'Hand-over member' })
      ).id;
      await joinCircle(circleId, ownerId, first);
      await joinCircle(circleId, ownerId, second);

      expect(await circles.leaveCircle(circleId, ownerId)).toEqual({
        newOwnerId: first,
        circleDeleted: false,
      });
    });

    it('BR-SOC-07: when the last member leaves, the circle is deleted', async () => {
      const ownerId = await newUser('lastOwner');
      const circleId = (
        await circles.createCircle(ownerId, { name: 'Last one out' })
      ).id;

      expect(await circles.leaveCircle(circleId, ownerId)).toEqual({
        newOwnerId: null,
        circleDeleted: true,
      });
      expect(await circles.getCircle(ownerId, circleId)).toBeNull();
    });

    it('BR-SOC-07: two members and the owner leaving at the same time leave exactly one owner', async () => {
      const ownerId = await newUser('raceOwner');
      const admin = await newUser('raceAdmin');
      const m1 = await newUser('raceM1');
      const m2 = await newUser('raceM2');
      const circleId = (await circles.createCircle(ownerId, { name: 'Race' }))
        .id;
      await joinCircle(circleId, ownerId, admin);
      await circles.setMemberRole(circleId, admin, 'admin');
      await joinCircle(circleId, ownerId, m1);
      await joinCircle(circleId, ownerId, m2);

      await Promise.all([
        circles.leaveCircle(circleId, ownerId),
        circles.leaveCircle(circleId, m1),
        circles.leaveCircle(circleId, m2),
      ]);

      const remaining = await circles.listMembers(admin, circleId);
      const owners = remaining?.filter((m) => m.role === 'owner') ?? [];
      expect(owners.map((m) => m.userId)).toEqual([admin]);
      expect(remaining).toHaveLength(1);
    });
  });

  describe('communities', () => {
    it('BR-SOC-09: joining an open community makes the user a member at once', async () => {
      const ownerId = await newUser('openOwner');
      const joiner = await newUser('openJoiner');
      const { id } = await communities.createCommunity(ownerId, {
        name: 'Open club',
        joinPolicy: 'open',
      });

      expect(await communities.join(id, joiner)).toEqual({ status: 'member' });
      expect(await communities.getMemberRole(id, joiner)).toBe('member');
    });

    it('BR-SOC-09: joining an on-request community creates a request, which an owner accepts', async () => {
      const ownerId = await newUser('reqOwner');
      const asker = await newUser('reqAsker');
      const { id } = await communities.createCommunity(ownerId, {
        name: 'Request club',
        joinPolicy: 'on_request',
      });

      expect(await communities.join(id, asker)).toEqual({
        status: 'requested',
      });
      expect(await codeOf(() => communities.join(id, asker))).toBe(
        'JOIN_REQUEST_ALREADY_PENDING',
      );
      const [request] = await communities.listPendingJoinRequests(id);
      expect(request?.userId).toBe(asker);

      expect(
        await communities.decideJoinRequest(
          request?.requestId ?? '',
          ownerId,
          true,
        ),
      ).toEqual({ userId: asker });
      expect(await communities.getMemberRole(id, asker)).toBe('member');
      expect(
        (await communities.getCommunity(asker, id))?.viewerRequestStatus,
      ).toBeNull();
    });

    it('BR-SOC-09: when the owner leaves, the oldest moderator becomes owner', async () => {
      const ownerId = await newUser('comOwner');
      const moderator = await newUser('comMod');
      const member = await newUser('comMember');
      const { id } = await communities.createCommunity(ownerId, {
        name: 'Hand-over club',
        joinPolicy: 'open',
      });
      await communities.join(id, moderator);
      await communities.setMemberRole(id, moderator, 'moderator');
      await communities.join(id, member);

      expect(await communities.leave(id, ownerId)).toEqual({
        newOwnerId: moderator,
        communityDeleted: false,
      });
    });

    it('BR-SOC-09: listMembers is null for a user who is not a member', async () => {
      const ownerId = await newUser('listOwner');
      const outsider = await newUser('listOutsider');
      const { id } = await communities.createCommunity(ownerId, {
        name: 'Members only',
        joinPolicy: 'open',
      });

      expect(await communities.listMembers(outsider, id)).toBeNull();
      expect(
        (await communities.listMembers(ownerId, id))?.items.map(
          (m) => m.userId,
        ),
      ).toEqual([ownerId]);
    });
  });
});
