-- Moderation (batch 3): tables, enums, named constraints and indexes, comments, report targets and states, sanction
-- checks, banned identities and erasure behaviour (BR-MOD-01 to BR-MOD-05, BR-GDP-04).
-- Runs against teamdrop_test, inside one transaction rolled back at the end.
BEGIN;
SELECT plan(25);

SELECT has_table('report_reason', 'table report_reason exists');
SELECT has_table('report', 'table report exists');
SELECT has_table('user_sanction', 'table user_sanction exists');
SELECT has_table('banned_identity', 'table banned_identity exists');
SELECT has_table('audit_log', 'table audit_log exists');
SELECT enum_has_labels('report_status', ARRAY['open', 'assigned', 'resolved', 'dismissed'], 'report_status has its labels');
SELECT enum_has_labels('sanction_kind', ARRAY['warning', 'temporary_ban', 'permanent_ban', 'content_removal'],
  'sanction_kind has its labels');
SELECT enum_has_labels('banned_identity_kind', ARRAY['email', 'google_subject'], 'banned_identity_kind has its labels');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'report_reason'::regclass, 'report'::regclass, 'user_sanction'::regclass, 'banned_identity'::regclass,
      'audit_log'::regclass)$$,
  ARRAY[
    'pk_report_reason', 'uq_report_reason_code',
    'pk_report', 'fk_report_reporter_id', 'fk_report_report_reason_id', 'fk_report_target_user_id',
    'fk_report_target_event_id', 'fk_report_target_message_id', 'fk_report_assigned_moderator_id',
    'ck_report_at_most_one_target', 'ck_report_closed_at', 'ck_report_assigned_at',
    'pk_user_sanction', 'fk_user_sanction_user_id', 'fk_user_sanction_report_id', 'fk_user_sanction_issued_by_id',
    'ck_user_sanction_ends_at', 'ck_user_sanction_reason_not_blank',
    'pk_banned_identity', 'uq_banned_identity_kind_hash',
    'pk_audit_log', 'fk_audit_log_actor_id', 'fk_audit_log_report_id', 'ck_audit_log_details_object'
  ]::text[],
  'the moderation tables have exactly their named constraints'
);
SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_report_queue', 'ix_report_reporter_id', 'ix_report_report_reason_id', 'ix_report_target_user_id',
      'ix_report_target_event_id', 'ix_report_target_message_id', 'ix_report_assigned_moderator_id',
      'ix_user_sanction_user_id', 'ix_user_sanction_report_id', 'ix_user_sanction_issued_by_id',
      'ix_audit_log_created_at', 'ix_audit_log_actor_id', 'ix_audit_log_target', 'ix_audit_log_report_id')$$,
  ARRAY['ix_report_queue', 'ix_report_reporter_id', 'ix_report_report_reason_id', 'ix_report_target_user_id',
        'ix_report_target_event_id', 'ix_report_target_message_id', 'ix_report_assigned_moderator_id',
        'ix_user_sanction_user_id', 'ix_user_sanction_report_id', 'ix_user_sanction_issued_by_id',
        'ix_audit_log_created_at', 'ix_audit_log_actor_id', 'ix_audit_log_target', 'ix_audit_log_report_id']::text[],
  'all named moderation indexes exist'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['report_reason', 'report', 'user_sanction', 'banned_identity', 'audit_log']) AS t(name)
    WHERE obj_description(t.name::regclass, 'pg_class') IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('report_reason'::regclass, 'report'::regclass, 'user_sanction'::regclass,
                         'banned_identity'::regclass, 'audit_log'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  ),
  'every moderation table and column has a comment'
);

-- Fixtures (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-000000009000', '99090', 'Moderation test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000009001', 'moderation_reporter', '\x01'::bytea, '\x9091'::bytea, 'R', '\x01'::bytea, '00000000-0000-7000-8000-000000009000'),
  ('00000000-0000-7000-8000-000000009002', 'moderation_target', '\x02'::bytea, '\x9092'::bytea, 'T', '\x02'::bytea, '00000000-0000-7000-8000-000000009000'),
  ('00000000-0000-7000-8000-000000009003', 'moderation_moderator', '\x03'::bytea, '\x9093'::bytea, 'M', '\x03'::bytea, '00000000-0000-7000-8000-000000009000');
INSERT INTO report_reason (id, code, name, sort_order) VALUES
  ('00000000-0000-7000-8000-000000009010', 'test_spam', 'Test spam', 1);

-- Report targets (BR-MOD-01)
SELECT throws_ok(
  $$INSERT INTO report (reporter_id, report_reason_id, target_user_id, target_event_id)
    VALUES ('00000000-0000-7000-8000-000000009001', '00000000-0000-7000-8000-000000009010',
            '00000000-0000-7000-8000-000000009002', '00000000-0000-7000-8000-000000009002')$$,
  '23514', 'new row for relation "report" violates check constraint "ck_report_at_most_one_target"',
  'BR-MOD-01: a report cannot have two targets');
INSERT INTO report (id, reporter_id, report_reason_id, target_user_id) VALUES
  ('00000000-0000-7000-8000-000000009020', '00000000-0000-7000-8000-000000009001',
   '00000000-0000-7000-8000-000000009010', '00000000-0000-7000-8000-000000009002');
SELECT is((SELECT status::text FROM report WHERE id = '00000000-0000-7000-8000-000000009020'), 'open',
  'BR-MOD-02: a new report is open');

-- States (BR-MOD-02)
SELECT throws_ok(
  $$UPDATE report SET status = 'resolved', assigned_at = now() WHERE id = '00000000-0000-7000-8000-000000009020'$$,
  '23514', 'new row for relation "report" violates check constraint "ck_report_closed_at"',
  'BR-MOD-02: a closed report has closed_at');
SELECT throws_ok(
  $$UPDATE report SET status = 'assigned' WHERE id = '00000000-0000-7000-8000-000000009020'$$,
  '23514', 'new row for relation "report" violates check constraint "ck_report_assigned_at"',
  'BR-MOD-02: an assigned report has assigned_at');

-- Sanctions (BR-MOD-03)
SELECT throws_ok(
  $$INSERT INTO user_sanction (user_id, kind, reason) VALUES ('00000000-0000-7000-8000-000000009002', 'temporary_ban', 'Spam')$$,
  '23514', 'new row for relation "user_sanction" violates check constraint "ck_user_sanction_ends_at"',
  'BR-MOD-03: a temporary ban needs an end');
SELECT throws_ok(
  $$INSERT INTO user_sanction (user_id, kind, reason, ends_at)
    VALUES ('00000000-0000-7000-8000-000000009002', 'permanent_ban', 'Spam', now() + interval '1 day')$$,
  '23514', 'new row for relation "user_sanction" violates check constraint "ck_user_sanction_ends_at"',
  'BR-MOD-03: a permanent ban has no end');
SELECT lives_ok(
  $$INSERT INTO user_sanction (user_id, kind, reason, ends_at, issued_by_id, report_id)
    VALUES ('00000000-0000-7000-8000-000000009002', 'temporary_ban', 'Spam', now() + interval '7 days',
            '00000000-0000-7000-8000-000000009003', '00000000-0000-7000-8000-000000009020')$$,
  'BR-MOD-03: a temporary ban with an end in the future is accepted');

-- Banned identities (BR-MOD-04)
INSERT INTO banned_identity (identity_kind, identity_hash) VALUES ('email', '\x9092'::bytea);
SELECT throws_ok(
  $$INSERT INTO banned_identity (identity_kind, identity_hash) VALUES ('email', '\x9092'::bytea)$$,
  '23505', 'duplicate key value violates unique constraint "uq_banned_identity_kind_hash"',
  'BR-MOD-04: a banned identity is stored once');

-- Audit log (BR-MOD-05)
SELECT throws_ok(
  $$INSERT INTO audit_log (actor_id, action, details) VALUES ('00000000-0000-7000-8000-000000009003', 'other', '[1]')$$,
  '23514', 'new row for relation "audit_log" violates check constraint "ck_audit_log_details_object"',
  'audit_log.details must be a JSON object');
INSERT INTO audit_log (actor_id, action, target_table, target_id, report_id) VALUES
  ('00000000-0000-7000-8000-000000009003', 'report.assigned', 'report', '00000000-0000-7000-8000-000000009020',
   '00000000-0000-7000-8000-000000009020');

-- Erasure (BR-GDP-04, BR-MOD-04)
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000009002';
SELECT is(
  (SELECT target_user_id FROM report WHERE id = '00000000-0000-7000-8000-000000009020'), NULL,
  'BR-GDP-04: a report on an erased user is kept without the identity');
SELECT is((SELECT count(*)::int FROM banned_identity WHERE identity_hash = '\x9092'::bytea), 1,
  'BR-MOD-04: banned identities survive the erasure');
SELECT is(
  (SELECT count(*)::int FROM user_sanction WHERE user_id = '00000000-0000-7000-8000-000000009002'), 0,
  'the sanctions of an erased user are deleted');
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000009003';
SELECT is(
  (SELECT actor_id FROM audit_log WHERE action = 'report.assigned' AND report_id = '00000000-0000-7000-8000-000000009020'),
  NULL, 'BR-MOD-05: the audit entry of an erased moderator is kept with actor_id = NULL');
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000009001';
SELECT is(
  (SELECT reporter_id FROM report WHERE id = '00000000-0000-7000-8000-000000009020'), NULL,
  'BR-GDP-04: a report filed by an erased user is kept without the identity');

SELECT * FROM finish();
ROLLBACK;
