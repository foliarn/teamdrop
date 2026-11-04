-- Dev fixtures: follows (friends, a pending request to a private account), a block between two users who share
-- a circle, three circles (one with a pending member invitation), and two communities (open and on request).
-- Dev data only. Idempotent: every insert uses fixed ids or ON CONFLICT DO NOTHING.
-- Users come from 010_accounts.sql (ids ...000000000001 to ...000000000012).

BEGIN;

-- Follows: alice and ines are friends (mutual accepted); bob and karim follow alice; alice asks david (private).
INSERT INTO follow (follower_id, followed_id, status, created_at, accepted_at) VALUES
  ('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000009', 'accepted', '2026-03-01 10:00:00+00', '2026-03-01 10:00:00+00'),
  ('00000000-0000-7000-8000-000000000009', '00000000-0000-7000-8000-000000000001', 'accepted', '2026-03-01 10:05:00+00', '2026-03-01 10:05:00+00'),
  ('00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000001', 'accepted', '2026-03-02 09:00:00+00', '2026-03-02 09:00:00+00'),
  ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001', 'accepted', '2026-03-03 18:30:00+00', '2026-03-03 18:30:00+00'),
  ('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000004', 'pending', '2026-03-04 12:00:00+00', NULL)
ON CONFLICT DO NOTHING;

-- Block: jules blocks karim. Both share circle 01, so both stay in it (BR-SOC-04).
INSERT INTO user_block (blocker_id, blocked_id, created_at) VALUES
  ('00000000-0000-7000-8000-000000000010', '00000000-0000-7000-8000-000000000011', '2026-03-05 08:00:00+00')
ON CONFLICT DO NOTHING;

-- Circles
INSERT INTO circle (id, name, description, created_at) VALUES
  ('00000000-0000-7000-8000-000000000101', 'Sunday football', 'Five-a-side on Sunday mornings in Paris 8e.', '2026-02-01 09:00:00+00'),
  ('00000000-0000-7000-8000-000000000102', 'Chess club Lyon', 'Weekly rapid games in Lyon.', '2026-02-10 19:00:00+00'),
  ('00000000-0000-7000-8000-000000000103', 'Tennis partners', NULL, '2026-02-20 11:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Circle members. joined_at values are increasing, so the ownership hand-over order is deterministic.
INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000001', 'owner',  '2026-02-01 09:00:00+00'),
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000009', 'admin',  '2026-02-01 09:10:00+00'),
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000011', 'member', '2026-02-02 10:00:00+00'),
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000010', 'member', '2026-02-03 10:00:00+00'),
  ('00000000-0000-7000-8000-000000000102', '00000000-0000-7000-8000-000000000002', 'owner',  '2026-02-10 19:00:00+00'),
  ('00000000-0000-7000-8000-000000000102', '00000000-0000-7000-8000-000000000001', 'member', '2026-02-11 20:00:00+00'),
  ('00000000-0000-7000-8000-000000000103', '00000000-0000-7000-8000-000000000009', 'owner',  '2026-02-20 11:00:00+00'),
  ('00000000-0000-7000-8000-000000000103', '00000000-0000-7000-8000-000000000001', 'member', '2026-02-21 11:00:00+00')
ON CONFLICT DO NOTHING;

-- Pending invitation in circle 01: karim (a member) invites lea, so an admin must approve it first.
INSERT INTO circle_invitation (id, circle_id, invitee_id, inviter_id, status, created_at) VALUES
  ('00000000-0000-7000-8000-000000000301', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000011', 'awaiting_admin', '2026-03-06 15:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Communities
INSERT INTO community (id, name, description, join_policy, created_at) VALUES
  ('00000000-0000-7000-8000-000000000201', 'Paris Running Club', 'Runs along the Seine every Tuesday and Saturday.', 'open', '2026-01-15 08:00:00+00'),
  ('00000000-0000-7000-8000-000000000202', 'Lyon Padel', 'Padel players in Lyon, doubles only.', 'on_request', '2026-01-20 08:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO community_member (community_id, user_id, role, joined_at) VALUES
  ('00000000-0000-7000-8000-000000000201', '00000000-0000-7000-8000-000000000009', 'owner',     '2026-01-15 08:00:00+00'),
  ('00000000-0000-7000-8000-000000000201', '00000000-0000-7000-8000-000000000001', 'moderator', '2026-01-16 08:00:00+00'),
  ('00000000-0000-7000-8000-000000000201', '00000000-0000-7000-8000-000000000011', 'member',    '2026-01-17 08:00:00+00'),
  ('00000000-0000-7000-8000-000000000202', '00000000-0000-7000-8000-000000000002', 'owner',     '2026-01-20 08:00:00+00')
ON CONFLICT DO NOTHING;

-- Pending join request: david asks to join Lyon Padel.
INSERT INTO community_join_request (id, community_id, user_id, status, created_at) VALUES
  ('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-000000000202',
   '00000000-0000-7000-8000-000000000004', 'pending', '2026-03-07 16:00:00+00')
ON CONFLICT (id) DO NOTHING;

COMMIT;
