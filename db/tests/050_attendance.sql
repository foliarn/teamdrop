-- Attendance disputes (batch 1D): table, named constraints, comments, rejected rows and cascades. Runs against
-- teamdrop_test, inside one transaction that is rolled back at the end.
BEGIN;
SELECT plan(13);

-- Table, enum and named constraints
SELECT has_table('attendance_dispute', 'table attendance_dispute exists');
SELECT enum_has_labels('dispute_status', ARRAY['open', 'upheld', 'rejected'], 'dispute_status has its labels');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE conname IN (
      'pk_attendance_dispute', 'uq_attendance_dispute_registration_id',
      'fk_attendance_dispute_registration_id', 'fk_attendance_dispute_resolved_by_id',
      'ck_attendance_dispute_resolution')$$,
  ARRAY[
    'pk_attendance_dispute', 'uq_attendance_dispute_registration_id',
    'fk_attendance_dispute_registration_id', 'fk_attendance_dispute_resolved_by_id',
    'ck_attendance_dispute_resolution'
  ]::text[],
  'all named attendance_dispute constraints exist'
);
SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_attendance_dispute_resolved_by_id', 'ix_attendance_dispute_open')$$,
  ARRAY['ix_attendance_dispute_resolved_by_id', 'ix_attendance_dispute_open']::text[],
  'all named attendance_dispute indexes exist'
);

-- Every table and column has a comment (BR-ATT-02 documentation rule)
SELECT ok(
  obj_description('attendance_dispute'::regclass, 'pg_class') IS NOT NULL,
  'attendance_dispute has a table comment'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid = 'attendance_dispute'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND d.description IS NULL
  ),
  'every column of attendance_dispute has a comment'
);

-- Fixtures for the rows below (inside the transaction, rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-0000000000c0', '99050', 'Disputes test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-0000000000d1', 'disputes_owner', '\x01'::bytea, '\x61'::bytea, 'Owner', '\x01'::bytea, '00000000-0000-7000-8000-0000000000c0'),
  ('00000000-0000-7000-8000-0000000000d2', 'disputes_user', '\x02'::bytea, '\x62'::bytea, 'User', '\x02'::bytea, '00000000-0000-7000-8000-0000000000c0'),
  ('00000000-0000-7000-8000-0000000000d3', 'disputes_moderator', '\x03'::bytea, '\x63'::bytea, 'Moderator', '\x03'::bytea, '00000000-0000-7000-8000-0000000000c0');
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-0000000000c1', 'disputes_test_sport', 'Disputes test sport', true, 'outdoor', 60);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-0000000000c2', 'disputes_min', 'Minimum test level', 1),
  ('00000000-0000-7000-8000-0000000000c3', 'disputes_max', 'Maximum test level', 2);
INSERT INTO event (id, owner_id, sport_id, title, skill_level_min_id, skill_level_max_id, max_participants,
                   address, municipality_id, location, start_date, start_time, duration_minutes, status, published_at) VALUES
  ('00000000-0000-7000-8000-0000000003d1', '00000000-0000-7000-8000-0000000000d1',
   '00000000-0000-7000-8000-0000000000c1', 'Disputes base event', '00000000-0000-7000-8000-0000000000c2',
   '00000000-0000-7000-8000-0000000000c3', 10, 'Base address', '00000000-0000-7000-8000-0000000000c0',
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography, '2030-01-10', '18:00', 90, 'published', now());
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at, status) VALUES
  ('00000000-0000-7000-8000-0000000004d1', '00000000-0000-7000-8000-0000000003d1',
   '2030-01-10 17:00+00', '2030-01-10 17:00+00', 'completed');
-- r1: a no-show of a participant. r2: the organizer, attended. r3: an erased participant, no-show (BR-GDP-04).
INSERT INTO registration (id, occurrence_id, user_id, status, attendance) VALUES
  ('00000000-0000-7000-8000-0000000005d1', '00000000-0000-7000-8000-0000000004d1',
   '00000000-0000-7000-8000-0000000000d2', 'confirmed', 'no_show'),
  ('00000000-0000-7000-8000-0000000005d2', '00000000-0000-7000-8000-0000000004d1',
   '00000000-0000-7000-8000-0000000000d1', 'confirmed', 'attended'),
  ('00000000-0000-7000-8000-0000000005d3', '00000000-0000-7000-8000-0000000004d1',
   NULL, 'confirmed', 'no_show');

-- Defaults and uniqueness (BR-ATT-02)
INSERT INTO attendance_dispute (id, registration_id, reason) VALUES
  ('00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000005d1', 'I was there');
SELECT is((SELECT status::text FROM attendance_dispute WHERE id = '00000000-0000-7000-8000-0000000000a1'), 'open',
  'attendance_dispute.status defaults to open (BR-ATT-02)');
SELECT throws_ok(
  $$INSERT INTO attendance_dispute (registration_id, reason) VALUES ('00000000-0000-7000-8000-0000000005d1', 'Again')$$,
  '23505', 'duplicate key value violates unique constraint "uq_attendance_dispute_registration_id"',
  'uq_attendance_dispute_registration_id allows one dispute per registration (BR-ATT-02)');

-- ck_attendance_dispute_resolution: (status = open) = (resolved_at IS NULL), in both directions (BR-ATT-02)
SELECT throws_ok(
  $$UPDATE attendance_dispute SET resolved_at = now() WHERE id = '00000000-0000-7000-8000-0000000000a1'$$,
  '23514', 'new row for relation "attendance_dispute" violates check constraint "ck_attendance_dispute_resolution"',
  'ck_attendance_dispute_resolution refuses an open dispute with a resolution date (BR-ATT-02)');
SELECT throws_ok(
  $$UPDATE attendance_dispute SET status = 'upheld' WHERE id = '00000000-0000-7000-8000-0000000000a1'$$,
  '23514', 'new row for relation "attendance_dispute" violates check constraint "ck_attendance_dispute_resolution"',
  'ck_attendance_dispute_resolution refuses a decided dispute without a resolution date (BR-ATT-02)');
SELECT lives_ok(
  $$UPDATE attendance_dispute SET status = 'upheld', resolved_at = now(), resolved_by_id = '00000000-0000-7000-8000-0000000000d3'
    WHERE id = '00000000-0000-7000-8000-0000000000a1'$$,
  'a decided dispute with its resolution date is accepted (BR-ATT-02)');

-- Erasure of the moderator keeps the decision and clears the reference (BR-GDP-04)
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-0000000000d3';
SELECT is(
  (SELECT resolved_by_id FROM attendance_dispute WHERE id = '00000000-0000-7000-8000-0000000000a1'), NULL,
  'deleting the moderator sets attendance_dispute.resolved_by_id to NULL (BR-GDP-04)');

-- Cascade: deleting a registration deletes its dispute (structural child, brief section 5)
INSERT INTO registration (id, occurrence_id, user_id, status, attendance) VALUES
  ('00000000-0000-7000-8000-0000000005d4', '00000000-0000-7000-8000-0000000004d1', NULL, 'confirmed', 'no_show');
INSERT INTO attendance_dispute (id, registration_id, reason) VALUES
  ('00000000-0000-7000-8000-0000000000a4', '00000000-0000-7000-8000-0000000005d4', 'Erased participant');
DELETE FROM registration WHERE id = '00000000-0000-7000-8000-0000000005d4';
SELECT is(
  (SELECT count(*)::int FROM attendance_dispute WHERE registration_id = '00000000-0000-7000-8000-0000000005d4'), 0,
  'deleting a registration deletes its dispute (CASCADE)');

SELECT * FROM finish();
ROLLBACK;
