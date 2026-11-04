-- migrate:up
-- Social graph and groups: follows, blocks, circles and communities (batch 1B).

CREATE TYPE follow_status AS ENUM ('pending', 'accepted');
CREATE TYPE circle_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE circle_invitation_status AS ENUM ('awaiting_admin', 'awaiting_invitee', 'accepted', 'declined', 'rejected_by_admin', 'cancelled');
CREATE TYPE community_join_policy AS ENUM ('open', 'on_request');
CREATE TYPE community_role AS ENUM ('owner', 'moderator', 'member');
CREATE TYPE join_request_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------
-- follow
-- ---------------------------------------------------------------------------
CREATE TABLE follow (
  follower_id uuid NOT NULL,
  followed_id uuid NOT NULL,
  status follow_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  CONSTRAINT pk_follow PRIMARY KEY (follower_id, followed_id),
  CONSTRAINT fk_follow_follower_id FOREIGN KEY (follower_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_followed_id FOREIGN KEY (followed_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT ck_follow_not_self CHECK (follower_id <> followed_id)
);

CREATE INDEX ix_follow_followed_id ON follow (followed_id);

COMMENT ON TABLE follow IS 'A follow from one account to another. Two accepted follows make the users friends (BR-SOC-01).';
COMMENT ON COLUMN follow.follower_id IS 'The user who follows (BR-SOC-01).';
COMMENT ON COLUMN follow.followed_id IS 'The user being followed (BR-SOC-01).';
COMMENT ON COLUMN follow.status IS 'pending when the followed account is private and must approve the request (BR-ACC-14).';
COMMENT ON COLUMN follow.created_at IS 'When the follow was requested.';
COMMENT ON COLUMN follow.accepted_at IS 'When the follow was accepted; NULL while pending.';

-- ---------------------------------------------------------------------------
-- user_block
-- ---------------------------------------------------------------------------
CREATE TABLE user_block (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_block PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_user_block_blocker_id FOREIGN KEY (blocker_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_block_blocked_id FOREIGN KEY (blocked_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT ck_user_block_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX ix_user_block_blocked_id ON user_block (blocked_id);

COMMENT ON TABLE user_block IS 'A block set by one account on another. Blocking is total and mutual (BR-SOC-02).';
COMMENT ON COLUMN user_block.blocker_id IS 'The user who blocked (BR-SOC-02).';
COMMENT ON COLUMN user_block.blocked_id IS 'The user who is blocked (BR-SOC-02).';
COMMENT ON COLUMN user_block.created_at IS 'When the block was set.';

-- ---------------------------------------------------------------------------
-- circle
-- ---------------------------------------------------------------------------
CREATE TABLE circle (
  id uuid NOT NULL DEFAULT uuidv7(),
  name text NOT NULL,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_circle PRIMARY KEY (id)
);

COMMENT ON TABLE circle IS 'A private group of members with its own chat (BR-SOC-05, BR-SOC-08).';
COMMENT ON COLUMN circle.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN circle.name IS 'Name of the circle.';
COMMENT ON COLUMN circle.description IS 'Optional description of the circle.';
COMMENT ON COLUMN circle.created_at IS 'When the circle was created.';

-- ---------------------------------------------------------------------------
-- circle_member
-- ---------------------------------------------------------------------------
CREATE TABLE circle_member (
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role circle_role NOT NULL,
  joined_at timestamptz NOT NULL,
  CONSTRAINT pk_circle_member PRIMARY KEY (circle_id, user_id),
  CONSTRAINT fk_circle_member_circle_id FOREIGN KEY (circle_id)
    REFERENCES circle (id) ON DELETE CASCADE,
  CONSTRAINT fk_circle_member_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_circle_member_one_owner ON circle_member (circle_id) WHERE role = 'owner';
CREATE INDEX ix_circle_member_user_id ON circle_member (user_id);

COMMENT ON TABLE circle_member IS 'Membership of a user in a circle. The member list is private (BR-SOC-05).';
COMMENT ON COLUMN circle_member.circle_id IS 'The circle.';
COMMENT ON COLUMN circle_member.user_id IS 'The member.';
COMMENT ON COLUMN circle_member.role IS 'owner, admin or member. Exactly one owner per circle (BR-SOC-05).';
COMMENT ON COLUMN circle_member.joined_at IS 'When the user joined; ownership passes to the oldest admin, then member (BR-SOC-07).';

-- ---------------------------------------------------------------------------
-- circle_invitation
-- ---------------------------------------------------------------------------
CREATE TABLE circle_invitation (
  id uuid NOT NULL DEFAULT uuidv7(),
  circle_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  inviter_id uuid NULL,
  approved_by_id uuid NULL,
  status circle_invitation_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  CONSTRAINT pk_circle_invitation PRIMARY KEY (id),
  CONSTRAINT fk_circle_invitation_circle_id FOREIGN KEY (circle_id)
    REFERENCES circle (id) ON DELETE CASCADE,
  CONSTRAINT fk_circle_invitation_invitee_id FOREIGN KEY (invitee_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_circle_invitation_inviter_id FOREIGN KEY (inviter_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_circle_invitation_approved_by_id FOREIGN KEY (approved_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT ck_circle_invitation_not_self CHECK (inviter_id IS NULL OR inviter_id <> invitee_id)
);

CREATE UNIQUE INDEX uq_circle_invitation_pending ON circle_invitation (circle_id, invitee_id)
  WHERE status IN ('awaiting_admin', 'awaiting_invitee');
CREATE INDEX ix_circle_invitation_invitee_id ON circle_invitation (invitee_id);
CREATE INDEX ix_circle_invitation_inviter_id ON circle_invitation (inviter_id);
CREATE INDEX ix_circle_invitation_approved_by_id ON circle_invitation (approved_by_id);

COMMENT ON TABLE circle_invitation IS 'An invitation to join a circle. Joining is by invitation only (BR-SOC-06).';
COMMENT ON COLUMN circle_invitation.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN circle_invitation.circle_id IS 'The circle the invitee is invited to.';
COMMENT ON COLUMN circle_invitation.invitee_id IS 'The invited user.';
COMMENT ON COLUMN circle_invitation.inviter_id IS 'The member who invited; kept as NULL after the inviter is erased (BR-GDP-04).';
COMMENT ON COLUMN circle_invitation.approved_by_id IS 'The admin who approved a member invitation (BR-SOC-06); NULL after erasure of that admin.';
COMMENT ON COLUMN circle_invitation.status IS 'awaiting_admin, awaiting_invitee, accepted, declined, rejected_by_admin or cancelled (BR-SOC-06).';
COMMENT ON COLUMN circle_invitation.created_at IS 'When the invitation was created.';
COMMENT ON COLUMN circle_invitation.responded_at IS 'When the invitee, or an admin, answered the invitation.';

-- ---------------------------------------------------------------------------
-- community
-- ---------------------------------------------------------------------------
CREATE TABLE community (
  id uuid NOT NULL DEFAULT uuidv7(),
  name text NOT NULL,
  description text NULL,
  join_policy community_join_policy NOT NULL,
  avatar_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_community PRIMARY KEY (id)
);

CREATE INDEX ix_community_name_trgm ON community USING gin (immutable_unaccent(name) gin_trgm_ops);

COMMENT ON TABLE community IS 'A public group such as a club, a sport or a streamer, with its own chat (BR-SOC-09).';
COMMENT ON COLUMN community.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN community.name IS 'Name of the community; searched with pg_trgm and unaccent (BR-TECH-10).';
COMMENT ON COLUMN community.description IS 'Optional description of the community.';
COMMENT ON COLUMN community.join_policy IS 'open (anyone can join) or on_request (a moderator or owner approves) (BR-SOC-09).';
COMMENT ON COLUMN community.avatar_path IS 'Path of the community picture on the server disk.';
COMMENT ON COLUMN community.created_at IS 'When the community was created.';

-- ---------------------------------------------------------------------------
-- community_member
-- ---------------------------------------------------------------------------
CREATE TABLE community_member (
  community_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role community_role NOT NULL,
  joined_at timestamptz NOT NULL,
  CONSTRAINT pk_community_member PRIMARY KEY (community_id, user_id),
  CONSTRAINT fk_community_member_community_id FOREIGN KEY (community_id)
    REFERENCES community (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_member_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_community_member_one_owner ON community_member (community_id) WHERE role = 'owner';
CREATE INDEX ix_community_member_user_id ON community_member (user_id);

COMMENT ON TABLE community_member IS 'Membership of a user in a community (BR-SOC-09).';
COMMENT ON COLUMN community_member.community_id IS 'The community.';
COMMENT ON COLUMN community_member.user_id IS 'The member.';
COMMENT ON COLUMN community_member.role IS 'owner, moderator or member. Exactly one owner per community (BR-SOC-09).';
COMMENT ON COLUMN community_member.joined_at IS 'When the user joined; ownership passes to the oldest moderator, then member (BR-SOC-09).';

-- ---------------------------------------------------------------------------
-- community_join_request
-- ---------------------------------------------------------------------------
CREATE TABLE community_join_request (
  id uuid NOT NULL DEFAULT uuidv7(),
  community_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status join_request_status NOT NULL,
  decided_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL,
  CONSTRAINT pk_community_join_request PRIMARY KEY (id),
  CONSTRAINT fk_community_join_request_community_id FOREIGN KEY (community_id)
    REFERENCES community (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_join_request_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_join_request_decided_by_id FOREIGN KEY (decided_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_community_join_request_pending ON community_join_request (community_id, user_id)
  WHERE status = 'pending';
CREATE INDEX ix_community_join_request_user_id ON community_join_request (user_id);
CREATE INDEX ix_community_join_request_decided_by_id ON community_join_request (decided_by_id);

COMMENT ON TABLE community_join_request IS 'A request to join a community with the on_request policy (BR-SOC-09).';
COMMENT ON COLUMN community_join_request.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN community_join_request.community_id IS 'The community the user asks to join.';
COMMENT ON COLUMN community_join_request.user_id IS 'The user asking to join.';
COMMENT ON COLUMN community_join_request.status IS 'pending, accepted, declined or cancelled (BR-SOC-09).';
COMMENT ON COLUMN community_join_request.decided_by_id IS 'The owner or moderator who decided; NULL after erasure of that person (BR-GDP-04).';
COMMENT ON COLUMN community_join_request.created_at IS 'When the request was made.';
COMMENT ON COLUMN community_join_request.decided_at IS 'When the request was accepted, declined or cancelled.';


-- migrate:down
DROP TABLE community_join_request;
DROP TABLE community_member;
DROP TABLE community;
DROP TABLE circle_invitation;
DROP TABLE circle_member;
DROP TABLE circle;
DROP TABLE user_block;
DROP TABLE follow;
DROP TYPE join_request_status;
DROP TYPE community_role;
DROP TYPE community_join_policy;
DROP TYPE circle_invitation_status;
DROP TYPE circle_role;
DROP TYPE follow_status;
