-- Messaging (batch 2): tables, enum, named constraints and indexes, comments, the conversation triggers of circles and
-- communities, rejected rows and cascades (BR-MSG-01, BR-MSG-02, BR-MSG-03, BR-MSG-06, BR-TECH-08, BR-GDP-04).
-- Runs against teamdrop_test, inside one transaction that is rolled back at the end.
BEGIN;
SELECT plan(36);

-- Tables, enum, named constraints and indexes
SELECT has_table('conversation', 'table conversation exists');
SELECT has_table('conversation_member', 'table conversation_member exists');
SELECT has_table('message', 'table message exists');
SELECT has_table('message_reaction', 'table message_reaction exists');
SELECT enum_has_labels('conversation_kind', ARRAY['occurrence', 'circle', 'community'],
  'conversation_kind has its labels, no direct kind (PENDING-TEAM)');
SELECT hasnt_table('message_attachment', 'message_attachment is not built (BR-MSG-04, PENDING-TEAM)');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'conversation'::regclass, 'conversation_member'::regclass, 'message'::regclass, 'message_reaction'::regclass)$$,
  ARRAY[
    'pk_conversation', 'uq_conversation_occurrence_id', 'uq_conversation_circle_id', 'uq_conversation_community_id',
    'fk_conversation_occurrence_id', 'fk_conversation_circle_id', 'fk_conversation_community_id',
    'ck_conversation_one_target', 'ck_conversation_kind_target',
    'pk_conversation_member', 'fk_conversation_member_conversation_id', 'fk_conversation_member_user_id',
    'fk_conversation_member_last_read_message_id',
    'pk_message', 'uq_message_sender_client_message_id', 'fk_message_conversation_id', 'fk_message_sender_id',
    'fk_message_reply_to_message_id', 'ck_message_body_not_blank', 'ck_message_body_max_length',
    'ck_message_not_reply_to_self',
    'pk_message_reaction', 'fk_message_reaction_message_id', 'fk_message_reaction_user_id', 'ck_message_reaction_emoji'
  ]::text[],
  'the messaging tables have exactly their named constraints'
);
SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_message_conversation_id_id', 'ix_message_sender_id', 'ix_message_reply_to_message_id',
      'ix_conversation_member_user_id', 'ix_conversation_member_last_read_message_id', 'ix_message_reaction_user_id')$$,
  ARRAY['ix_message_conversation_id_id', 'ix_message_sender_id', 'ix_message_reply_to_message_id',
        'ix_conversation_member_user_id', 'ix_conversation_member_last_read_message_id', 'ix_message_reaction_user_id']::text[],
  'all named messaging indexes exist'
);
SELECT has_trigger('circle', 'trg_circle_create_conversation', 'circle has its conversation trigger');
SELECT has_trigger('community', 'trg_community_create_conversation', 'community has its conversation trigger');

-- Every table and column has a comment
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['conversation', 'conversation_member', 'message', 'message_reaction']) AS t(name)
    WHERE obj_description(t.name::regclass, 'pg_class') IS NULL
  ),
  'every messaging table has a comment'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('conversation'::regclass, 'conversation_member'::regclass, 'message'::regclass,
                         'message_reaction'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  ),
  'every column of the messaging tables has a comment'
);

-- Fixtures (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-000000006000', '99060', 'Messaging test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000006001', 'messaging_a', '\x01'::bytea, '\x6061'::bytea, 'A', '\x01'::bytea, '00000000-0000-7000-8000-000000006000'),
  ('00000000-0000-7000-8000-000000006002', 'messaging_b', '\x02'::bytea, '\x6062'::bytea, 'B', '\x02'::bytea, '00000000-0000-7000-8000-000000006000');
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-000000006010', 'messaging_test_sport', 'Messaging test sport', true, 'outdoor', 60);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-000000006011', 'messaging_min', 'Minimum test level', 1),
  ('00000000-0000-7000-8000-000000006012', 'messaging_max', 'Maximum test level', 2);
INSERT INTO event (id, owner_id, sport_id, title, skill_level_min_id, skill_level_max_id, max_participants,
                   address, municipality_id, location, start_date, start_time, duration_minutes, status, published_at) VALUES
  ('00000000-0000-7000-8000-000000006020', '00000000-0000-7000-8000-000000006001',
   '00000000-0000-7000-8000-000000006010', 'Messaging event', '00000000-0000-7000-8000-000000006011',
   '00000000-0000-7000-8000-000000006012', 10, 'Address', '00000000-0000-7000-8000-000000006000',
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography, '2030-01-10', '18:00', 90, 'published', now());
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at) VALUES
  ('00000000-0000-7000-8000-000000006021', '00000000-0000-7000-8000-000000006020',
   '2030-01-10 17:00+00', '2030-01-10 17:00+00');

-- Triggers: a new circle or community gets its conversation (BR-SOC-08, BR-SOC-09, BR-MSG-01)
INSERT INTO circle (id, name) VALUES ('00000000-0000-7000-8000-000000006030', 'Messaging circle');
INSERT INTO community (id, name, join_policy) VALUES ('00000000-0000-7000-8000-000000006040', 'Messaging community', 'open');
SELECT is(
  (SELECT kind::text FROM conversation WHERE circle_id = '00000000-0000-7000-8000-000000006030'), 'circle',
  'inserting a circle creates its conversation (BR-SOC-08)');
SELECT is(
  (SELECT kind::text FROM conversation WHERE community_id = '00000000-0000-7000-8000-000000006040'), 'community',
  'inserting a community creates its conversation (BR-SOC-09)');
SELECT is(
  (SELECT count(*)::int FROM circle c WHERE NOT EXISTS (SELECT 1 FROM conversation cv WHERE cv.circle_id = c.id))
  + (SELECT count(*)::int FROM community c WHERE NOT EXISTS (SELECT 1 FROM conversation cv WHERE cv.community_id = c.id)),
  0, 'every circle and community has a conversation (backfill and triggers)');

-- Target checks (BR-MSG-01)
SELECT throws_ok(
  $$INSERT INTO conversation (kind, circle_id) VALUES ('circle', '00000000-0000-7000-8000-000000006030')$$,
  '23505', 'duplicate key value violates unique constraint "uq_conversation_circle_id"',
  'one conversation per circle (BR-MSG-01)');
SELECT throws_ok(
  $$INSERT INTO conversation (kind) VALUES ('occurrence')$$,
  '23514', NULL,
  'a conversation needs a target (BR-MSG-01, ck_conversation_one_target)');
SELECT throws_ok(
  $$INSERT INTO conversation (kind, occurrence_id, community_id)
    VALUES ('occurrence', '00000000-0000-7000-8000-000000006021', '00000000-0000-7000-8000-000000006040')$$,
  '23514', NULL,
  'a conversation has exactly one target (BR-MSG-01, ck_conversation_one_target)');
SELECT throws_ok(
  $$INSERT INTO conversation (kind, occurrence_id) VALUES ('circle', '00000000-0000-7000-8000-000000006021')$$,
  '23514', 'new row for relation "conversation" violates check constraint "ck_conversation_kind_target"',
  'the kind must match the target (BR-MSG-01)');
INSERT INTO conversation (id, kind, occurrence_id) VALUES
  ('00000000-0000-7000-8000-000000006050', 'occurrence', '00000000-0000-7000-8000-000000006021');
SELECT throws_ok(
  $$INSERT INTO conversation (kind, occurrence_id) VALUES ('occurrence', '00000000-0000-7000-8000-000000006021')$$,
  '23505', 'duplicate key value violates unique constraint "uq_conversation_occurrence_id"',
  'one conversation per occurrence (BR-MSG-01)');

-- Messages (BR-MSG-02, BR-TECH-08)
INSERT INTO message (id, conversation_id, sender_id, client_message_id, body) VALUES
  ('00000000-0000-7000-8000-000000006061', '00000000-0000-7000-8000-000000006050',
   '00000000-0000-7000-8000-000000006001', '00000000-0000-4000-8000-000000000001', 'Hello');
INSERT INTO message (id, conversation_id, sender_id, client_message_id, body, reply_to_message_id) VALUES
  ('00000000-0000-7000-8000-000000006062', '00000000-0000-7000-8000-000000006050',
   '00000000-0000-7000-8000-000000006002', '00000000-0000-4000-8000-000000000002', 'Hi',
   '00000000-0000-7000-8000-000000006061');
SELECT throws_ok(
  $$INSERT INTO message (conversation_id, sender_id, client_message_id, body) VALUES
    ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006001',
     '00000000-0000-4000-8000-000000000001', 'Re-sent')$$,
  '23505', 'duplicate key value violates unique constraint "uq_message_sender_client_message_id"',
  'BR-TECH-08: client_message_id is unique per sender');
SELECT lives_ok(
  $$INSERT INTO message (conversation_id, sender_id, client_message_id, body) VALUES
    ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006002',
     '00000000-0000-4000-8000-000000000001', 'Same client id, other sender')$$,
  'BR-TECH-08: two senders may use the same client_message_id');
SELECT throws_ok(
  $$INSERT INTO message (conversation_id, sender_id, client_message_id, body) VALUES
    ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006001', uuidv7(), E'  \n ')$$,
  '23514', 'new row for relation "message" violates check constraint "ck_message_body_not_blank"',
  'BR-MSG-02: a blank body is refused');
SELECT throws_ok(
  $$INSERT INTO message (conversation_id, sender_id, client_message_id, body) VALUES
    ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006001', uuidv7(), repeat('a', 4001))$$,
  '23514', 'new row for relation "message" violates check constraint "ck_message_body_max_length"',
  'BR-MSG-02: a body of more than 4000 characters is refused');
SELECT lives_ok(
  $$INSERT INTO message (conversation_id, sender_id, client_message_id, body) VALUES
    ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006001', uuidv7(), repeat('é', 4000))$$,
  'BR-MSG-02: a body of exactly 4000 characters is accepted');

-- Reactions: fixed list (BR-MSG-02)
SELECT lives_ok(
  $$INSERT INTO message_reaction (message_id, user_id, emoji) VALUES
    ('00000000-0000-7000-8000-000000006061', '00000000-0000-7000-8000-000000006002', 'thumbs_up'),
    ('00000000-0000-7000-8000-000000006061', '00000000-0000-7000-8000-000000006002', 'heart')$$,
  'BR-MSG-02: reactions from the fixed list are accepted, several codes per user');
SELECT throws_ok(
  $$INSERT INTO message_reaction (message_id, user_id, emoji) VALUES
    ('00000000-0000-7000-8000-000000006061', '00000000-0000-7000-8000-000000006001', 'fire')$$,
  '23514', 'new row for relation "message_reaction" violates check constraint "ck_message_reaction_emoji"',
  'BR-MSG-02: a reaction outside the fixed list is refused');

-- Read pointer (BR-MSG-02)
INSERT INTO conversation_member (conversation_id, user_id, last_read_message_id) VALUES
  ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006002', '00000000-0000-7000-8000-000000006061');
SELECT is(
  (SELECT muted FROM conversation_member WHERE user_id = '00000000-0000-7000-8000-000000006002'), false,
  'conversation_member.muted defaults to false');

-- Hard delete of a message (BR-MSG-03): reactions go, replies stay without target, pointers are cleared
DELETE FROM message WHERE id = '00000000-0000-7000-8000-000000006061';
SELECT is(
  (SELECT count(*)::int FROM message_reaction WHERE message_id = '00000000-0000-7000-8000-000000006061'), 0,
  'BR-MSG-03: deleting a message deletes its reactions');
SELECT is(
  (SELECT reply_to_message_id FROM message WHERE id = '00000000-0000-7000-8000-000000006062'), NULL,
  'BR-MSG-03: a reply survives its deleted target with reply_to_message_id = NULL');
SELECT is(
  (SELECT last_read_message_id FROM conversation_member WHERE user_id = '00000000-0000-7000-8000-000000006002'), NULL,
  'a read pointer on a deleted message is cleared by the FK (the data layer moves it back first)');

-- Erasure of a user (BR-GDP-04): messages stay as "deleted user", per-user rows go
INSERT INTO message_reaction (message_id, user_id, emoji) VALUES
  ('00000000-0000-7000-8000-000000006062', '00000000-0000-7000-8000-000000006001', 'smile');
INSERT INTO conversation_member (conversation_id, user_id) VALUES
  ('00000000-0000-7000-8000-000000006050', '00000000-0000-7000-8000-000000006001');
UPDATE event SET owner_id = '00000000-0000-7000-8000-000000006002' WHERE id = '00000000-0000-7000-8000-000000006020';
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000006001';
SELECT is(
  (SELECT count(*)::int FROM message WHERE conversation_id = '00000000-0000-7000-8000-000000006050' AND sender_id IS NULL),
  1, 'BR-GDP-04: messages of an erased user stay with sender_id = NULL');
SELECT is(
  (SELECT count(*)::int FROM message_reaction WHERE user_id = '00000000-0000-7000-8000-000000006001')
  + (SELECT count(*)::int FROM conversation_member WHERE user_id = '00000000-0000-7000-8000-000000006001'),
  0, 'BR-GDP-04: reactions and read state of an erased user are deleted');

-- Cascades of the targets (BR-MSG-06)
INSERT INTO message (conversation_id, sender_id, client_message_id, body)
SELECT id, '00000000-0000-7000-8000-000000006002', uuidv7(), 'Circle message'
FROM conversation WHERE circle_id = '00000000-0000-7000-8000-000000006030';
DELETE FROM circle WHERE id = '00000000-0000-7000-8000-000000006030';
SELECT is(
  (SELECT count(*)::int FROM conversation WHERE circle_id = '00000000-0000-7000-8000-000000006030')
  + (SELECT count(*)::int FROM message WHERE body = 'Circle message'),
  0, 'BR-MSG-06: deleting a circle deletes its conversation and messages');
DELETE FROM community WHERE id = '00000000-0000-7000-8000-000000006040';
SELECT is(
  (SELECT count(*)::int FROM conversation WHERE community_id = '00000000-0000-7000-8000-000000006040'), 0,
  'BR-MSG-06: deleting a community deletes its conversation');
DELETE FROM event_occurrence WHERE id = '00000000-0000-7000-8000-000000006021';
SELECT is(
  (SELECT count(*)::int FROM conversation WHERE id = '00000000-0000-7000-8000-000000006050')
  + (SELECT count(*)::int FROM message WHERE conversation_id = '00000000-0000-7000-8000-000000006050'),
  0, 'deleting an occurrence deletes its conversation and messages');

SELECT * FROM finish();
ROLLBACK;
