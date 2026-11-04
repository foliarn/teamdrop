-- Social graph and groups (batch 1B): tables, named constraints, rejected rows and cascades. Runs against teamdrop_test.
BEGIN;
SELECT plan(29);

-- Tables
SELECT has_table('follow', 'table follow exists');
SELECT has_table('user_block', 'table user_block exists');
SELECT has_table('circle', 'table circle exists');
SELECT has_table('circle_member', 'table circle_member exists');
SELECT has_table('circle_invitation', 'table circle_invitation exists');
SELECT has_table('community', 'table community exists');
SELECT has_table('community_member', 'table community_member exists');
SELECT has_table('community_join_request', 'table community_join_request exists');

-- Enums
SELECT enum_has_labels('follow_status', ARRAY['pending', 'accepted'], 'follow_status has its labels');
SELECT enum_has_labels('circle_role', ARRAY['owner', 'admin', 'member'], 'circle_role has its labels');
SELECT enum_has_labels('circle_invitation_status',
  ARRAY['awaiting_admin', 'awaiting_invitee', 'accepted', 'declined', 'rejected_by_admin', 'cancelled'],
  'circle_invitation_status has its labels');
SELECT enum_has_labels('community_join_policy', ARRAY['open', 'on_request'], 'community_join_policy has its labels');
SELECT enum_has_labels('community_role', ARRAY['owner', 'moderator', 'member'], 'community_role has its labels');
SELECT enum_has_labels('join_request_status', ARRAY['pending', 'accepted', 'declined', 'cancelled'], 'join_request_status has its labels');

-- Named constraints and indexes exist
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE conname IN (
      'pk_follow', 'pk_user_block', 'pk_circle', 'pk_circle_member', 'pk_circle_invitation',
      'pk_community', 'pk_community_member', 'pk_community_join_request',
      'ck_follow_not_self', 'ck_user_block_not_self', 'ck_circle_invitation_not_self',
      'fk_follow_follower_id', 'fk_follow_followed_id', 'fk_user_block_blocker_id', 'fk_user_block_blocked_id',
      'fk_circle_member_circle_id', 'fk_circle_member_user_id',
      'fk_circle_invitation_circle_id', 'fk_circle_invitation_invitee_id',
      'fk_circle_invitation_inviter_id', 'fk_circle_invitation_approved_by_id',
      'fk_community_member_community_id', 'fk_community_member_user_id',
      'fk_community_join_request_community_id', 'fk_community_join_request_user_id',
      'fk_community_join_request_decided_by_id')$$,
  ARRAY[
    'pk_follow', 'pk_user_block', 'pk_circle', 'pk_circle_member', 'pk_circle_invitation',
    'pk_community', 'pk_community_member', 'pk_community_join_request',
    'ck_follow_not_self', 'ck_user_block_not_self', 'ck_circle_invitation_not_self',
    'fk_follow_follower_id', 'fk_follow_followed_id', 'fk_user_block_blocker_id', 'fk_user_block_blocked_id',
    'fk_circle_member_circle_id', 'fk_circle_member_user_id',
    'fk_circle_invitation_circle_id', 'fk_circle_invitation_invitee_id',
    'fk_circle_invitation_inviter_id', 'fk_circle_invitation_approved_by_id',
    'fk_community_member_community_id', 'fk_community_member_user_id',
    'fk_community_join_request_community_id', 'fk_community_join_request_user_id',
    'fk_community_join_request_decided_by_id'
  ]::text[],
  'all named social constraints exist'
);

SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'uq_circle_member_one_owner', 'uq_circle_invitation_pending',
      'uq_community_member_one_owner', 'uq_community_join_request_pending',
      'ix_follow_followed_id', 'ix_user_block_blocked_id', 'ix_circle_member_user_id',
      'ix_circle_invitation_invitee_id', 'ix_circle_invitation_inviter_id', 'ix_circle_invitation_approved_by_id',
      'ix_community_name_trgm', 'ix_community_member_user_id',
      'ix_community_join_request_user_id', 'ix_community_join_request_decided_by_id')$$,
  ARRAY[
    'uq_circle_member_one_owner', 'uq_circle_invitation_pending',
    'uq_community_member_one_owner', 'uq_community_join_request_pending',
    'ix_follow_followed_id', 'ix_user_block_blocked_id', 'ix_circle_member_user_id',
    'ix_circle_invitation_invitee_id', 'ix_circle_invitation_inviter_id', 'ix_circle_invitation_approved_by_id',
    'ix_community_name_trgm', 'ix_community_member_user_id',
    'ix_community_join_request_user_id', 'ix_community_join_request_decided_by_id'
  ]::text[],
  'all named social indexes exist'
);

-- Fixtures for the rows below (inside the transaction, rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-0000000000d0', '99030', 'Social test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-0000000000c1', 'social_one', '\x01'::bytea, '\x21'::bytea, 'One', '\x01'::bytea, '00000000-0000-7000-8000-0000000000d0'),
  ('00000000-0000-7000-8000-0000000000c2', 'social_two', '\x02'::bytea, '\x22'::bytea, 'Two', '\x02'::bytea, '00000000-0000-7000-8000-0000000000d0'),
  ('00000000-0000-7000-8000-0000000000c3', 'social_three', '\x03'::bytea, '\x23'::bytea, 'Three', '\x03'::bytea, '00000000-0000-7000-8000-0000000000d0'),
  ('00000000-0000-7000-8000-0000000000c4', 'social_four', '\x04'::bytea, '\x24'::bytea, 'Four', '\x04'::bytea, '00000000-0000-7000-8000-0000000000d0');
INSERT INTO circle (id, name) VALUES ('00000000-0000-7000-8000-0000000001a1', 'Test circle');
INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES
  ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c1', 'owner', now()),
  ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c2', 'member', now());
INSERT INTO community (id, name, join_policy) VALUES
  ('00000000-0000-7000-8000-0000000002a1', 'Open test club', 'open'),
  ('00000000-0000-7000-8000-0000000002a2', 'Request test club', 'on_request');
INSERT INTO community_member (community_id, user_id, role, joined_at) VALUES
  ('00000000-0000-7000-8000-0000000002a1', '00000000-0000-7000-8000-0000000000c1', 'owner', now()),
  ('00000000-0000-7000-8000-0000000002a2', '00000000-0000-7000-8000-0000000000c2', 'owner', now());

-- Not-self checks (BR-SOC-01, BR-SOC-02, BR-SOC-06)
SELECT throws_ok(
  $$INSERT INTO follow (follower_id, followed_id, status) VALUES ('00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000c1', 'accepted')$$,
  '23514', NULL, 'ck_follow_not_self rejects a self follow (BR-SOC-01)');
SELECT throws_ok(
  $$INSERT INTO user_block (blocker_id, blocked_id) VALUES ('00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000c1')$$,
  '23514', NULL, 'ck_user_block_not_self rejects a self block (BR-SOC-02)');
SELECT throws_ok(
  $$INSERT INTO circle_invitation (circle_id, invitee_id, inviter_id, status) VALUES ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000c2', 'awaiting_invitee')$$,
  '23514', NULL, 'ck_circle_invitation_not_self rejects inviting oneself (BR-SOC-06)');

-- Follows: one row per ordered pair
INSERT INTO follow (follower_id, followed_id, status, accepted_at) VALUES
  ('00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000c2', 'accepted', now());
SELECT throws_ok(
  $$INSERT INTO follow (follower_id, followed_id, status) VALUES ('00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000c2', 'pending')$$,
  '23505', NULL, 'pk_follow: a second follow of the same pair is rejected (BR-SOC-01)');

-- Exactly one owner per circle and per community (BR-SOC-05, BR-SOC-09)
SELECT throws_ok(
  $$INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c3', 'owner', now())$$,
  '23505', NULL, 'uq_circle_member_one_owner rejects a second owner in a circle (BR-SOC-05)');
SELECT throws_ok(
  $$INSERT INTO community_member (community_id, user_id, role, joined_at) VALUES ('00000000-0000-7000-8000-0000000002a1', '00000000-0000-7000-8000-0000000000c3', 'owner', now())$$,
  '23505', NULL, 'uq_community_member_one_owner rejects a second owner in a community (BR-SOC-09)');

-- Circle invitations: one pending invitation per circle and invitee (BR-SOC-06)
INSERT INTO circle_invitation (id, circle_id, invitee_id, inviter_id, status) VALUES
  ('00000000-0000-7000-8000-0000000001e1', '00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c3',
   '00000000-0000-7000-8000-0000000000c2', 'awaiting_admin');
SELECT throws_ok(
  $$INSERT INTO circle_invitation (circle_id, invitee_id, inviter_id, status) VALUES ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000c1', 'awaiting_invitee')$$,
  '23505', NULL, 'uq_circle_invitation_pending rejects a second pending invitation to the same user');
UPDATE circle_invitation SET status = 'declined', responded_at = now() WHERE id = '00000000-0000-7000-8000-0000000001e1';
SELECT lives_ok(
  $$INSERT INTO circle_invitation (id, circle_id, invitee_id, inviter_id, status) VALUES ('00000000-0000-7000-8000-0000000001e2', '00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000c2', 'awaiting_admin')$$,
  'a new invitation is allowed once the previous one is declined (BR-SOC-06)');

-- Community join requests: one pending request per user and community (BR-SOC-09)
INSERT INTO community_join_request (community_id, user_id, status) VALUES
  ('00000000-0000-7000-8000-0000000002a2', '00000000-0000-7000-8000-0000000000c3', 'pending');
SELECT throws_ok(
  $$INSERT INTO community_join_request (community_id, user_id, status) VALUES ('00000000-0000-7000-8000-0000000002a2', '00000000-0000-7000-8000-0000000000c3', 'pending')$$,
  '23505', NULL, 'uq_community_join_request_pending rejects a second pending request (BR-SOC-09)');
UPDATE community_join_request SET status = 'accepted', decided_at = now()
  WHERE community_id = '00000000-0000-7000-8000-0000000002a2' AND user_id = '00000000-0000-7000-8000-0000000000c3';
SELECT lives_ok(
  $$INSERT INTO community_join_request (community_id, user_id, status) VALUES ('00000000-0000-7000-8000-0000000002a2', '00000000-0000-7000-8000-0000000000c3', 'pending')$$,
  'a new join request is allowed once the previous one is decided (BR-SOC-09)');

-- Erasure keeps the invitation but detaches the inviter (BR-GDP-04): inviter_id is SET NULL
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-0000000000c2';
SELECT ok(
  (SELECT inviter_id IS NULL FROM circle_invitation WHERE id = '00000000-0000-7000-8000-0000000001e2'),
  'deleting the inviter keeps the invitation with a NULL inviter (ON DELETE SET NULL)');

-- Cascades: deleting a user removes their follows and memberships (BR-SOC-01, BR-SOC-05, BR-ACC-14)
INSERT INTO follow (follower_id, followed_id, status, accepted_at) VALUES
  ('00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c1', 'accepted', now());
INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES
  ('00000000-0000-7000-8000-0000000001a1', '00000000-0000-7000-8000-0000000000c4', 'member', now());
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-0000000000c4';
SELECT is(
  (SELECT count(*)::int FROM follow WHERE follower_id = '00000000-0000-7000-8000-0000000000c4'
     OR followed_id = '00000000-0000-7000-8000-0000000000c4'),
  0,
  'deleting a user removes their follows in both directions (CASCADE)');
SELECT is(
  (SELECT count(*)::int FROM circle_member WHERE user_id = '00000000-0000-7000-8000-0000000000c4'),
  0,
  'deleting a user removes their circle memberships (CASCADE)');

SELECT * FROM finish();
ROLLBACK;
