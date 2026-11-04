-- Accounts and profiles (batch 1A): tables, keys, named constraints, defaults and rejected rows. Runs against teamdrop_test.
BEGIN;
SELECT plan(47);

-- Tables
SELECT has_table('user_account', 'table user_account exists');
SELECT has_table('auth_identity', 'table auth_identity exists');
SELECT has_table('refresh_token', 'table refresh_token exists');
SELECT has_table('account_token', 'table account_token exists');
SELECT has_table('user_setting', 'table user_setting exists');
SELECT has_table('user_sport', 'table user_sport exists');
SELECT has_table('user_rating', 'table user_rating exists');
SELECT has_table('user_availability', 'table user_availability exists');

-- Primary keys
SELECT col_is_pk('user_account', 'id', 'user_account.id is the primary key');
SELECT col_is_pk('auth_identity', 'id', 'auth_identity.id is the primary key');
SELECT col_is_pk('refresh_token', 'id', 'refresh_token.id is the primary key');
SELECT col_is_pk('account_token', 'id', 'account_token.id is the primary key');
SELECT col_is_pk('user_setting', 'user_id', 'user_setting.user_id is the primary key');
SELECT col_is_pk('user_sport', ARRAY['user_id', 'sport_id'], 'user_sport primary key is (user_id, sport_id)');
SELECT col_is_pk('user_rating', ARRAY['user_id', 'rating_system_id'], 'user_rating primary key is (user_id, rating_system_id)');
SELECT col_is_pk('user_availability', 'id', 'user_availability.id is the primary key');

-- Enums
SELECT enum_has_labels('user_role', ARRAY['user', 'moderator', 'admin'], 'user_role has its labels');
SELECT enum_has_labels('gender', ARRAY['woman', 'man', 'non_binary', 'prefer_not_to_say'], 'gender has its labels');
SELECT enum_has_labels('auth_provider', ARRAY['password', 'google'], 'auth_provider has its labels');
SELECT enum_has_labels('account_token_purpose', ARRAY['email_verification', 'password_reset'], 'account_token_purpose has its labels');
SELECT enum_has_labels('visibility_level', ARRAY['public', 'members', 'friends', 'only_me'], 'visibility_level has its labels');
SELECT enum_has_labels('invite_policy', ARRAY['everyone', 'friends', 'nobody'], 'invite_policy has its labels');

-- Named constraints and indexes exist
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE conname IN (
      'uq_user_account_username', 'uq_user_account_email_hash', 'fk_user_account_municipality_id',
      'uq_auth_identity_provider_subject', 'uq_auth_identity_user_provider', 'ck_auth_identity_credentials',
      'fk_auth_identity_user_id', 'uq_refresh_token_token_hash', 'uq_account_token_token_hash',
      'ck_user_rating_one_value', 'ck_user_availability_day_of_week', 'ck_user_availability_time_order',
      'ex_user_availability_no_overlap')$$,
  ARRAY[
    'uq_user_account_username', 'uq_user_account_email_hash', 'fk_user_account_municipality_id',
    'uq_auth_identity_provider_subject', 'uq_auth_identity_user_provider', 'ck_auth_identity_credentials',
    'fk_auth_identity_user_id', 'uq_refresh_token_token_hash', 'uq_account_token_token_hash',
    'ck_user_rating_one_value', 'ck_user_availability_day_of_week', 'ck_user_availability_time_order',
    'ex_user_availability_no_overlap'
  ]::text[],
  'all named account constraints exist'
);

SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_user_account_municipality_id', 'ix_user_account_username_trgm',
      'ix_refresh_token_user_id', 'ix_refresh_token_family_id', 'ix_refresh_token_replaced_by_id',
      'ix_account_token_user_id', 'ix_user_sport_sport_id', 'ix_user_sport_skill_level_id',
      'ix_user_rating_rating_system_id', 'ix_user_rating_rating_grade_id', 'ix_user_availability_user_id')$$,
  ARRAY[
    'ix_user_account_municipality_id', 'ix_user_account_username_trgm',
    'ix_refresh_token_user_id', 'ix_refresh_token_family_id', 'ix_refresh_token_replaced_by_id',
    'ix_account_token_user_id', 'ix_user_sport_sport_id', 'ix_user_sport_skill_level_id',
    'ix_user_rating_rating_system_id', 'ix_user_rating_rating_grade_id', 'ix_user_availability_user_id'
  ]::text[],
  'all named account indexes exist'
);

-- Triggers
SELECT has_trigger('user_setting', 'trg_user_setting_set_updated_at', 'user_setting has its updated_at trigger');
SELECT has_trigger('user_rating', 'trg_user_rating_set_updated_at', 'user_rating has its updated_at trigger');

-- Base rows (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-00000000a001', '75056', 'Paris', '75', 2100000,
   ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography);
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-00000000b001', 'football', 'Football', true, 'outdoor', 90),
  ('00000000-0000-7000-8000-00000000b002', 'tennis', 'Tennis', false, 'both', 60);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-00000000c001', 'beginner', 'Beginner', 1);
INSERT INTO rating_system (id, sport_id, code, name, value_kind, min_value, max_value) VALUES
  ('00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000b001', 'fide_elo', 'FIDE Elo', 'numeric', 0, 3500);
INSERT INTO rating_system (id, sport_id, code, name, value_kind) VALUES
  ('00000000-0000-7000-8000-00000000d002', '00000000-0000-7000-8000-00000000b002', 'fft_ranking', 'French tennis ranking', 'graded');
INSERT INTO rating_grade (id, rating_system_id, code, rank) VALUES
  ('00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-00000000d002', 'NC', 1);

-- Users and defaults
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000000101', 'Alice', '\x00'::bytea, '\x0a'::bytea, 'Alice', '\x00'::bytea,
   '00000000-0000-7000-8000-00000000a001');
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000000102', 'bob', '\x00'::bytea, '\x0b'::bytea, 'Bob', '\x00'::bytea,
   '00000000-0000-7000-8000-00000000a001');
INSERT INTO user_setting (user_id) VALUES ('00000000-0000-7000-8000-000000000101');

SELECT is(
  (SELECT role::text FROM user_account WHERE id = '00000000-0000-7000-8000-000000000101'),
  'user',
  'user_account.role defaults to user (BR-ACC-08)');
SELECT ok(
  (SELECT profile_visibility = 'members' AND stats_visibility = 'members' AND badges_visibility = 'members'
      AND reliability_visibility = 'members' AND circles_visibility = 'members' AND history_visibility = 'members'
      AND follows_visibility = 'members' AND is_private_account = false AND hide_from_rankings = false
      AND circle_invite_policy = 'everyone'
   FROM user_setting WHERE user_id = '00000000-0000-7000-8000-000000000101'),
  'user_setting defaults: members visibility, no private account, not hidden, invites from everyone (BR-ACC-14, BR-ACC-15)');

-- Username and email uniqueness
SELECT throws_ok(
  $$INSERT INTO user_account (username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id)
    VALUES ('alice', '\x00'::bytea, '\x0c'::bytea, 'Other', '\x00'::bytea, '00000000-0000-7000-8000-00000000a001')$$,
  '23505', NULL, 'username uniqueness is case-insensitive (BR-ACC-02)');
SELECT throws_ok(
  $$INSERT INTO user_account (username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id)
    VALUES ('zed', '\x00'::bytea, '\x0a'::bytea, 'Zed', '\x00'::bytea, '00000000-0000-7000-8000-00000000a001')$$,
  '23505', NULL, 'uq_user_account_email_hash rejects a second account with the same email hash (BR-ACC-04)');

-- auth_identity
INSERT INTO auth_identity (user_id, provider, password_hash) VALUES
  ('00000000-0000-7000-8000-000000000101', 'password', '$argon2id$test');
INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES
  ('00000000-0000-7000-8000-000000000102', 'google', 'google-bob');
SELECT throws_ok(
  $$INSERT INTO auth_identity (user_id, provider, provider_subject, password_hash)
    VALUES ('00000000-0000-7000-8000-000000000102', 'google', 'google-other', '$argon2id$test')$$,
  '23514', NULL, 'ck_auth_identity_credentials rejects a google identity with a password hash (BR-ACC-05)');
SELECT throws_ok(
  $$INSERT INTO auth_identity (user_id, provider) VALUES ('00000000-0000-7000-8000-000000000102', 'password')$$,
  '23514', NULL, 'ck_auth_identity_credentials rejects a password identity without a hash');
SELECT throws_ok(
  $$INSERT INTO auth_identity (user_id, provider, provider_subject) VALUES ('00000000-0000-7000-8000-000000000101', 'google', 'google-bob')$$,
  '23505', NULL, 'uq_auth_identity_provider_subject: a Google subject is linked once (BR-ACC-05)');
SELECT throws_ok(
  $$INSERT INTO auth_identity (user_id, provider, password_hash) VALUES ('00000000-0000-7000-8000-000000000101', 'password', 'second')$$,
  '23505', NULL, 'uq_auth_identity_user_provider: one identity per provider and user (BR-ACC-05)');

-- refresh_token and account_token
INSERT INTO refresh_token (user_id, family_id, token_hash, issued_at, expires_at) VALUES
  ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-0000000000f1', '\x01'::bytea, now(), now() + interval '30 days');
SELECT throws_ok(
  $$INSERT INTO refresh_token (user_id, family_id, token_hash, issued_at, expires_at) VALUES
    ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-0000000000f2', '\x01'::bytea, now(), now() + interval '30 days')$$,
  '23505', NULL, 'uq_refresh_token_token_hash rejects a duplicate token hash (BR-ACC-07)');
INSERT INTO account_token (user_id, purpose, token_hash, expires_at) VALUES
  ('00000000-0000-7000-8000-000000000101', 'email_verification', '\x02'::bytea, now() + interval '1 day');
SELECT throws_ok(
  $$INSERT INTO account_token (user_id, purpose, token_hash, expires_at) VALUES
    ('00000000-0000-7000-8000-000000000101', 'password_reset', '\x02'::bytea, now() + interval '1 day')$$,
  '23505', NULL, 'uq_account_token_token_hash rejects a duplicate token hash (BR-ACC-07)');

-- user_sport, user_rating
SELECT lives_ok(
  $$INSERT INTO user_sport (user_id, sport_id, skill_level_id) VALUES
    ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-00000000b001', '00000000-0000-7000-8000-00000000c001')$$,
  'a user can declare a sport with a level (BR-ACC-10)');
SELECT throws_ok(
  $$INSERT INTO user_rating (user_id, rating_system_id) VALUES
    ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-00000000d001')$$,
  '23514', NULL, 'ck_user_rating_one_value rejects a rating with neither value (BR-ACC-11)');
SELECT throws_ok(
  $$INSERT INTO user_rating (user_id, rating_system_id, numeric_value, rating_grade_id) VALUES
    ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-00000000d001', 1500,
     '00000000-0000-7000-8000-00000000e001')$$,
  '23514', NULL, 'ck_user_rating_one_value rejects a rating with both values (BR-ACC-11)');
SELECT lives_ok(
  $$INSERT INTO user_rating (user_id, rating_system_id, numeric_value) VALUES
    ('00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-00000000d001', 1500)$$,
  'a numeric rating holds one value (BR-ACC-11)');

-- user_availability
INSERT INTO user_availability (user_id, day_of_week, start_time, end_time) VALUES
  ('00000000-0000-7000-8000-000000000101', 1, '18:00', '19:00');
SELECT throws_ok(
  $$INSERT INTO user_availability (user_id, day_of_week, start_time, end_time) VALUES
    ('00000000-0000-7000-8000-000000000101', 0, '08:00', '09:00')$$,
  '23514', NULL, 'ck_user_availability_day_of_week rejects day 0 (ISO 1 to 7, BR-ACC-12)');
SELECT throws_ok(
  $$INSERT INTO user_availability (user_id, day_of_week, start_time, end_time) VALUES
    ('00000000-0000-7000-8000-000000000101', 2, '10:00', '09:00')$$,
  '23514', NULL, 'ck_user_availability_time_order rejects an end before the start (BR-ACC-12)');
SELECT throws_ok(
  $$INSERT INTO user_availability (user_id, day_of_week, start_time, end_time) VALUES
    ('00000000-0000-7000-8000-000000000101', 1, '18:30', '19:30')$$,
  '23P01', NULL, 'ex_user_availability_no_overlap rejects overlapping slots (BR-ACC-12)');
SELECT lives_ok(
  $$INSERT INTO user_availability (user_id, day_of_week, start_time, end_time) VALUES
    ('00000000-0000-7000-8000-000000000101', 1, '19:00', '20:00')$$,
  'adjacent slots 18:00-19:00 and 19:00-20:00 are accepted (BR-ACC-12)');

-- Privileges of the application role
SELECT ok(
  has_table_privilege('teamdrop_app', 'user_account', 'INSERT'),
  'teamdrop_app has INSERT on user_account');
SELECT ok(
  has_table_privilege('teamdrop_app', 'user_setting', 'UPDATE'),
  'teamdrop_app has UPDATE on user_setting');

-- Deleting an account removes its identities (CASCADE)
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000000102';
SELECT is(
  (SELECT count(*)::int FROM auth_identity WHERE user_id = '00000000-0000-7000-8000-000000000102'),
  0,
  'auth identities are deleted with their account (CASCADE)');

SELECT * FROM finish();
ROLLBACK;
