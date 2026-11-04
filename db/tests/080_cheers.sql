-- Cheers (batch 3): tables, named constraints and indexes, comments, uniqueness, self check and erasure behaviour
-- (BR-SOC-11, BR-SOC-12, BR-GDP-05). Runs against teamdrop_test, inside one transaction rolled back at the end.
BEGIN;
SELECT plan(13);

SELECT has_table('cheer_type', 'table cheer_type exists');
SELECT has_table('cheer', 'table cheer exists');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN ('cheer_type'::regclass, 'cheer'::regclass)$$,
  ARRAY[
    'pk_cheer_type', 'uq_cheer_type_code',
    'pk_cheer', 'uq_cheer_giver_recipient_occurrence', 'fk_cheer_occurrence_id', 'fk_cheer_giver_id',
    'fk_cheer_recipient_id', 'fk_cheer_cheer_type_id', 'ck_cheer_not_self'
  ]::text[],
  'the cheer tables have exactly their named constraints'
);
SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_cheer_recipient_id', 'ix_cheer_occurrence_id', 'ix_cheer_cheer_type_id')$$,
  ARRAY['ix_cheer_recipient_id', 'ix_cheer_occurrence_id', 'ix_cheer_cheer_type_id']::text[],
  'all named cheer indexes exist'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('cheer_type'::regclass, 'cheer'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  )
  AND obj_description('cheer_type'::regclass, 'pg_class') IS NOT NULL
  AND obj_description('cheer'::regclass, 'pg_class') IS NOT NULL,
  'every cheer table and column has a comment'
);

-- Fixtures (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-000000008000', '99080', 'Cheers test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000008001', 'cheers_a', '\x01'::bytea, '\x8081'::bytea, 'A', '\x01'::bytea, '00000000-0000-7000-8000-000000008000'),
  ('00000000-0000-7000-8000-000000008002', 'cheers_b', '\x02'::bytea, '\x8082'::bytea, 'B', '\x02'::bytea, '00000000-0000-7000-8000-000000008000');
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-000000008010', 'cheers_test_sport', 'Cheers test sport', true, 'outdoor', 60);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-000000008011', 'cheers_min', 'Minimum test level', 1),
  ('00000000-0000-7000-8000-000000008012', 'cheers_max', 'Maximum test level', 2);
INSERT INTO event (id, owner_id, sport_id, title, skill_level_min_id, skill_level_max_id, max_participants,
                   address, municipality_id, location, start_date, start_time, duration_minutes, status, published_at) VALUES
  ('00000000-0000-7000-8000-000000008020', '00000000-0000-7000-8000-000000008002',
   '00000000-0000-7000-8000-000000008010', 'Cheers event', '00000000-0000-7000-8000-000000008011',
   '00000000-0000-7000-8000-000000008012', 10, 'Address', '00000000-0000-7000-8000-000000008000',
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography, '2026-01-10', '18:00', 90, 'published', now());
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at, status) VALUES
  ('00000000-0000-7000-8000-000000008021', '00000000-0000-7000-8000-000000008020',
   '2026-01-10 17:00+00', '2026-01-10 17:00+00', 'completed');
INSERT INTO cheer_type (id, code, name, sort_order) VALUES
  ('00000000-0000-7000-8000-000000008030', 'test_fair_play', 'Test fair play', 1);

SELECT is((SELECT is_active FROM cheer_type WHERE id = '00000000-0000-7000-8000-000000008030'), true,
  'cheer_type.is_active defaults to true');

INSERT INTO cheer (id, occurrence_id, giver_id, recipient_id, cheer_type_id) VALUES
  ('00000000-0000-7000-8000-000000008040', '00000000-0000-7000-8000-000000008021',
   '00000000-0000-7000-8000-000000008001', '00000000-0000-7000-8000-000000008002', '00000000-0000-7000-8000-000000008030');
SELECT throws_ok(
  $$INSERT INTO cheer (occurrence_id, giver_id, recipient_id, cheer_type_id) VALUES
    ('00000000-0000-7000-8000-000000008021', '00000000-0000-7000-8000-000000008001',
     '00000000-0000-7000-8000-000000008002', '00000000-0000-7000-8000-000000008030')$$,
  '23505', 'duplicate key value violates unique constraint "uq_cheer_giver_recipient_occurrence"',
  'BR-SOC-11: one cheer per giver, recipient and occurrence');
SELECT throws_ok(
  $$INSERT INTO cheer (occurrence_id, giver_id, recipient_id, cheer_type_id) VALUES
    ('00000000-0000-7000-8000-000000008021', '00000000-0000-7000-8000-000000008001',
     '00000000-0000-7000-8000-000000008001', '00000000-0000-7000-8000-000000008030')$$,
  '23514', 'new row for relation "cheer" violates check constraint "ck_cheer_not_self"',
  'BR-SOC-11: no cheer to oneself');
SELECT throws_ok(
  $$DELETE FROM cheer_type WHERE id = '00000000-0000-7000-8000-000000008030'$$,
  '23001', NULL, 'a cheer type in use cannot be deleted (RESTRICT)');

-- BR-GDP-05: the giver's erasure keeps the cheer for the recipient
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000008001';
SELECT is((SELECT giver_id FROM cheer WHERE id = '00000000-0000-7000-8000-000000008040'), NULL,
  'BR-GDP-05: erasing the giver keeps the cheer with giver_id = NULL');
SELECT lives_ok(
  $$INSERT INTO cheer (occurrence_id, giver_id, recipient_id, cheer_type_id) VALUES
    ('00000000-0000-7000-8000-000000008021', NULL, '00000000-0000-7000-8000-000000008002',
     '00000000-0000-7000-8000-000000008030')$$,
  'two cheers of erased givers never conflict');

-- The recipient's erasure deletes the cheers they received
UPDATE event SET owner_id = '00000000-0000-7000-8000-000000008002' WHERE id = '00000000-0000-7000-8000-000000008020';
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000008003', 'cheers_owner', '\x03'::bytea, '\x8083'::bytea, 'O', '\x03'::bytea, '00000000-0000-7000-8000-000000008000');
UPDATE event SET owner_id = '00000000-0000-7000-8000-000000008003' WHERE id = '00000000-0000-7000-8000-000000008020';
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000008002';
SELECT is((SELECT count(*)::int FROM cheer WHERE occurrence_id = '00000000-0000-7000-8000-000000008021'), 0,
  'erasing the recipient deletes the cheers received');

-- An occurrence deletion deletes its cheers
INSERT INTO cheer (occurrence_id, giver_id, recipient_id, cheer_type_id) VALUES
  ('00000000-0000-7000-8000-000000008021', NULL, '00000000-0000-7000-8000-000000008003', '00000000-0000-7000-8000-000000008030');
DELETE FROM event_occurrence WHERE id = '00000000-0000-7000-8000-000000008021';
SELECT is((SELECT count(*)::int FROM cheer WHERE occurrence_id = '00000000-0000-7000-8000-000000008021'), 0,
  'deleting an occurrence deletes its cheers');

SELECT * FROM finish();
ROLLBACK;
