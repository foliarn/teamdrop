-- Dev fixtures: chats and notifications (batch 2). Messages in the "Sunday football" circle (with a reply, an edited
-- message, reactions, and karim, who is blocked by jules: BR-SOC-04), in the Paris Running Club community and in the
-- chat of alice's next football session (occurrence 401). Read pointers, a muted member, in-app notifications, one
-- preference override and one push subscription with fake keys.
-- Ids: conversation ...000000000cNN, messages, notifications and push ...000000000bNN.
-- Dev data only. Idempotent: fixed ids and ON CONFLICT DO NOTHING. Circle and community conversations are created by
-- trigger, so they are looked up by target. Users come from 010_accounts.sql, circles and communities from
-- 020_social.sql, the occurrence from 030_events.sql, notification types from reference/050_notification_type.sql.

BEGIN;

-- Occurrence chat of occurrence 401 (alice's event; alice and karim are confirmed).
INSERT INTO conversation (id, kind, occurrence_id, created_at) VALUES
  ('00000000-0000-7000-8000-000000000c01', 'occurrence', '00000000-0000-7000-8000-000000000401', now() - interval '3 days')
ON CONFLICT DO NOTHING;

-- Messages. Fixed ids are increasing, so their order matches created_at (ids order the chat, BR-TECH-08).
INSERT INTO message (id, conversation_id, sender_id, client_message_id, reply_to_message_id, body, created_at, edited_at)
SELECT v.id::uuid, cv.id, v.sender_id::uuid, v.client_message_id::uuid, v.reply_to::uuid, v.body,
       now() - v.age, CASE WHEN v.edited THEN now() - v.age + interval '2 minutes' END
FROM (VALUES
  -- Circle 101 "Sunday football": alice (owner), ines (admin), karim and jules (members).
  ('00000000-0000-7000-8000-000000000b01', 'circle', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-000000000901', NULL,
   'Who is in for Sunday morning?', interval '2 days', false),
  ('00000000-0000-7000-8000-000000000b02', 'circle', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000009', '00000000-0000-4000-8000-000000000902', '00000000-0000-7000-8000-000000000b01',
   'Me! I will bring the bibs.', interval '47 hours', true),
  ('00000000-0000-7000-8000-000000000b03', 'circle', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000011', '00000000-0000-4000-8000-000000000903', NULL,
   'Count me in too.', interval '46 hours', false),
  ('00000000-0000-7000-8000-000000000b04', 'circle', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000010', '00000000-0000-4000-8000-000000000904', NULL,
   'I can play as goalkeeper.', interval '45 hours', false),
  ('00000000-0000-7000-8000-000000000b05', 'circle', '00000000-0000-7000-8000-000000000101',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-000000000905', NULL,
   'Great, see you at 10 at the usual pitch.', interval '44 hours', false),
  -- Community 201 "Paris Running Club": ines (owner), alice (moderator), karim (member).
  ('00000000-0000-7000-8000-000000000b11', 'community', '00000000-0000-7000-8000-000000000201',
   '00000000-0000-7000-8000-000000000009', '00000000-0000-4000-8000-000000000911', NULL,
   'Saturday run: 10 km along the Seine, start at Pont de l''Alma.', interval '30 hours', false),
  ('00000000-0000-7000-8000-000000000b12', 'community', '00000000-0000-7000-8000-000000000201',
   '00000000-0000-7000-8000-000000000011', '00000000-0000-4000-8000-000000000912', '00000000-0000-7000-8000-000000000b11',
   'What pace?', interval '29 hours', false),
  ('00000000-0000-7000-8000-000000000b13', 'community', '00000000-0000-7000-8000-000000000201',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-000000000913', '00000000-0000-7000-8000-000000000b12',
   'Around 5:30 per km, nobody is left behind.', interval '28 hours', false),
  -- Occurrence 401 chat: alice (organizer) and karim (participant with two guests).
  ('00000000-0000-7000-8000-000000000b21', 'occurrence', '00000000-0000-7000-8000-000000000401',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-000000000921', NULL,
   'The gate is on the side street, see the address.', interval '20 hours', false),
  ('00000000-0000-7000-8000-000000000b22', 'occurrence', '00000000-0000-7000-8000-000000000401',
   '00000000-0000-7000-8000-000000000011', '00000000-0000-4000-8000-000000000922', NULL,
   'Thanks, I am coming with Sami and Yanis.', interval '19 hours', false)
) AS v(id, kind, target_id, sender_id, client_message_id, reply_to, body, age, edited)
JOIN conversation cv ON
  (v.kind = 'circle' AND cv.circle_id = v.target_id::uuid)
  OR (v.kind = 'community' AND cv.community_id = v.target_id::uuid)
  OR (v.kind = 'occurrence' AND cv.occurrence_id = v.target_id::uuid)
ORDER BY v.id
ON CONFLICT DO NOTHING;

-- Reactions (fixed list, BR-MSG-02). karim's heart on alice's message is hidden from jules (BR-SOC-04).
INSERT INTO message_reaction (message_id, user_id, emoji) VALUES
  ('00000000-0000-7000-8000-000000000b01', '00000000-0000-7000-8000-000000000009', 'thumbs_up'),
  ('00000000-0000-7000-8000-000000000b01', '00000000-0000-7000-8000-000000000010', 'thumbs_up'),
  ('00000000-0000-7000-8000-000000000b05', '00000000-0000-7000-8000-000000000011', 'heart'),
  ('00000000-0000-7000-8000-000000000b11', '00000000-0000-7000-8000-000000000001', 'smile')
ON CONFLICT DO NOTHING;

-- Read state: alice read her circle up to her last message; ines read up to the bibs message; jules muted the circle.
INSERT INTO conversation_member (conversation_id, user_id, last_read_message_id, muted)
SELECT cv.id, v.user_id::uuid, v.last_read::uuid, v.muted
FROM (VALUES
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000b05', false),
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000009', '00000000-0000-7000-8000-000000000b02', false),
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000010', '00000000-0000-7000-8000-000000000b04', true)
) AS v(circle_id, user_id, last_read, muted)
JOIN conversation cv ON cv.circle_id = v.circle_id::uuid
ON CONFLICT DO NOTHING;

INSERT INTO conversation_member (conversation_id, user_id, last_read_message_id) VALUES
  ('00000000-0000-7000-8000-000000000c01', '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000b21')
ON CONFLICT DO NOTHING;

-- In-app notifications of alice (one read) and karim. Payloads hold ids only.
INSERT INTO notification (id, user_id, notification_type_id, payload, created_at, read_at)
SELECT v.id::uuid, v.user_id::uuid, t.id, v.payload::jsonb, now() - v.age, CASE WHEN v.is_read THEN now() - v.age + interval '1 hour' END
FROM (VALUES
  ('00000000-0000-7000-8000-000000000b51', '00000000-0000-7000-8000-000000000001', 'new_follower',
   '{"userId": "00000000-0000-7000-8000-000000000011"}', interval '5 days', true),
  ('00000000-0000-7000-8000-000000000b52', '00000000-0000-7000-8000-000000000001', 'circle_invitation',
   '{"circleId": "00000000-0000-7000-8000-000000000102"}', interval '2 days', false),
  ('00000000-0000-7000-8000-000000000b53', '00000000-0000-7000-8000-000000000001', 'event_updated',
   '{"eventId": "00000000-0000-7000-8000-000000000302"}', interval '1 day', false),
  ('00000000-0000-7000-8000-000000000b54', '00000000-0000-7000-8000-000000000011', 'looking_for_players',
   '{"circleId": "00000000-0000-7000-8000-000000000101", "messageId": "00000000-0000-7000-8000-000000000b01"}',
   interval '2 days', false)
) AS v(id, user_id, type_code, payload, age, is_read)
JOIN notification_type t ON t.code = v.type_code
ON CONFLICT DO NOTHING;

-- Preference override: alice wants no push for new chat messages (BR-NOT-01).
INSERT INTO notification_preference (user_id, notification_type_id, push_enabled, in_app_enabled)
SELECT '00000000-0000-7000-8000-000000000001', t.id, false, false
FROM notification_type t WHERE t.code = 'new_message'
ON CONFLICT DO NOTHING;

-- One push subscription of alice, with fake keys (dev only; real ones come from the browser).
INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth_secret, user_agent) VALUES
  ('00000000-0000-7000-8000-000000000b61', '00000000-0000-7000-8000-000000000001',
   'https://push.example.test/dev/alice-phone', 'dev-fake-p256dh', 'dev-fake-auth', 'Firefox on Android (dev fixture)')
ON CONFLICT DO NOTHING;

COMMIT;
