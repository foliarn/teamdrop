/** Status of a follow: `pending` until a private account accepts it (BR-ACC-14). DB enum `follow_status`. */
export type FollowStatus = 'pending' | 'accepted';

/** Follow state of one direction, or `none` when there is no follow row. */
export type FollowState = 'none' | FollowStatus;

/** Relationship between two users as seen by the viewer (BR-SOC-01, BR-SOC-02). */
export type Relationship = {
  /** The viewer follows the other user. */
  following: FollowState;
  /** The other user follows the viewer. */
  followedBy: FollowState;
  /** Mutual accepted follows (BR-SOC-01). */
  friends: boolean;
  /** The viewer blocked the other user. */
  blockedByMe: boolean;
  /** The other user blocked the viewer. */
  blockedMe: boolean;
};

/** A user shown in a follower, following or friend list. */
export type FollowListItem = {
  id: string;
  username: string;
  avatarPath: string | null;
};

/** A follow request waiting for the account owner's decision (BR-ACC-14). */
export type PendingFollowRequest = {
  id: string;
  username: string;
  avatarPath: string | null;
  requestedAt: Date;
};

/** A user blocked by the caller (BR-SOC-02). */
export type BlockedUser = {
  id: string;
  username: string;
  avatarPath: string | null;
  blockedAt: Date;
};

/** A block row, in either direction. Used by administrators (BR-SOC-04). */
export type BlockRecord = {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
};

/** Outcome of `BlockRepository.block`. */
export type BlockOutcome = {
  /**
   * Upcoming occurrences both users are registered for, so that the BR-SOC-03 warning can be sent (BR-SOC-03).
   */
  sharedUpcomingOccurrenceIds: string[];
};

/** Circle role (BR-SOC-05). DB enum `circle_role`. */
export type CircleRole = 'owner' | 'admin' | 'member';

/** Status of a circle invitation (BR-SOC-06). DB enum `circle_invitation_status`. */
export type CircleInvitationStatus =
  | 'awaiting_admin'
  | 'awaiting_invitee'
  | 'accepted'
  | 'declined'
  | 'rejected_by_admin'
  | 'cancelled';

/** A circle, as created or updated. */
export type Circle = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

/** Input of `CircleRepository.createCircle`. */
export type CreateCircleInput = {
  name: string;
  description?: string | null;
};

/** Patch of `CircleRepository.updateCircle`: only the given fields change. */
export type UpdateCirclePatch = {
  name?: string;
  description?: string | null;
};

/** Outcome of `CircleRepository.invite`. */
export type InviteOutcome = {
  invitationId: string;
  status: 'awaiting_admin' | 'awaiting_invitee';
};

/** Outcome of `CircleRepository.approveInvitation`. */
export type ApproveInvitationOutcome = {
  inviteeId: string;
};

/** Outcome of `CircleRepository.leaveCircle` (BR-SOC-07). */
export type LeaveCircleOutcome = {
  /** The new owner when ownership was handed over, otherwise null. */
  newOwnerId: string | null;
  /** True when the last member left and the circle was deleted. */
  circleDeleted: boolean;
};

/** A circle the user belongs to. */
export type MyCircle = {
  id: string;
  name: string;
  description: string | null;
  role: CircleRole;
  memberCount: number;
};

/** Details of a circle, visible to its members only (BR-SOC-05). */
export type CircleDetails = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  memberCount: number;
  viewerRole: CircleRole;
};

/** A member of a circle. */
export type CircleMember = {
  userId: string;
  username: string;
  avatarPath: string | null;
  role: CircleRole;
  joinedAt: Date;
};

/** An invitation waiting for the caller's answer (BR-SOC-06). */
export type MyCircleInvitation = {
  invitationId: string;
  circleId: string;
  circleName: string;
  inviterUsername: string | null;
  createdAt: Date;
};

/** A member invitation waiting for an admin's approval (BR-SOC-06). */
export type PendingCircleApproval = {
  invitationId: string;
  inviteeId: string;
  inviteeUsername: string;
  inviterId: string | null;
  inviterUsername: string | null;
  createdAt: Date;
};

/** Community join policy (BR-SOC-09). DB enum `community_join_policy`. */
export type CommunityJoinPolicy = 'open' | 'on_request';

/** Community role (BR-SOC-09). DB enum `community_role`. */
export type CommunityRole = 'owner' | 'moderator' | 'member';

/** Status of a join request (BR-SOC-09). DB enum `join_request_status`. */
export type JoinRequestStatus =
  'pending' | 'accepted' | 'declined' | 'cancelled';

/** A community. */
export type Community = {
  id: string;
  name: string;
  description: string | null;
  joinPolicy: CommunityJoinPolicy;
  avatarPath: string | null;
  createdAt: Date;
};

/** Input of `CommunityRepository.createCommunity`. */
export type CreateCommunityInput = {
  name: string;
  description?: string | null;
  joinPolicy: CommunityJoinPolicy;
  avatarPath?: string | null;
};

/** Patch of `CommunityRepository.updateCommunity`: only the given fields change. */
export type UpdateCommunityPatch = {
  name?: string;
  description?: string | null;
  joinPolicy?: CommunityJoinPolicy;
  avatarPath?: string | null;
};

/** Outcome of `CommunityRepository.join`. */
export type JoinCommunityOutcome = {
  status: 'member' | 'requested';
};

/** Outcome of `CommunityRepository.decideJoinRequest`. */
export type DecideJoinRequestOutcome = {
  userId: string;
};

/** Outcome of `CommunityRepository.leave` (BR-SOC-09). */
export type LeaveCommunityOutcome = {
  newOwnerId: string | null;
  communityDeleted: boolean;
};

/** A community found by `searchCommunities`. */
export type CommunitySearchResult = {
  id: string;
  name: string;
  description: string | null;
  joinPolicy: CommunityJoinPolicy;
  avatarPath: string | null;
  memberCount: number;
};

/** Details of a community, as seen by a viewer. */
export type CommunityDetails = {
  id: string;
  name: string;
  description: string | null;
  joinPolicy: CommunityJoinPolicy;
  avatarPath: string | null;
  memberCount: number;
  createdAt: Date;
  viewerRole: CommunityRole | null;
  viewerRequestStatus: 'pending' | null;
};

/** A member of a community. */
export type CommunityMember = {
  userId: string;
  username: string;
  avatarPath: string | null;
  role: CommunityRole;
  joinedAt: Date;
};

/** A community the user belongs to. */
export type MyCommunity = {
  id: string;
  name: string;
  avatarPath: string | null;
  role: CommunityRole;
  memberCount: number;
};

/** A pending join request, for owners and moderators. */
export type PendingJoinRequest = {
  requestId: string;
  userId: string;
  username: string;
  avatarPath: string | null;
  createdAt: Date;
};
