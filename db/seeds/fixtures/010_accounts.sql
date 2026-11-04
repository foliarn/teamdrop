-- Dev fixtures: 12 accounts covering adults and a minor, password and Google logins, arrondissements,
-- a private account, a hidden profile, moderators, an admin, a pending deletion, an unverified email,
-- hidden rankings and users with sports, ratings and availability.
-- Dev data only. Idempotent: users and identities use fixed ids and ON CONFLICT DO NOTHING.
--
-- The encryption and HMAC keys are the dev values of .env.example. They must match DATA_ENCRYPTION_KEY and
-- DATA_HMAC_KEY used by the API, otherwise the encrypted emails and birth dates cannot be decrypted.
-- All password users share the password 'password123' (argon2id hash below).

\set enc_key 'dev-only-encryption-key-change-me'
\set hmac_key 'dev-only-hmac-key-change-me'
\set password_hash '$argon2id$v=19$m=65536,t=3,p=4$7p7NlqMZGVR2M6tZAaDsmg$pXIGNpVfPzq6voaOdNzqjezIEljhTueot+S4IinV02A'

BEGIN;

-- Accounts. Emails are normalized (lower case) before encryption and hashing, as internal/crypto.ts does.
INSERT INTO user_account (id, username, email_ciphertext, email_hash, email_verified_at, first_name,
                          birth_date_ciphertext, gender, municipality_id, role, deletion_requested_at)
VALUES
  ('00000000-0000-7000-8000-000000000001', 'alice',
   pgp_sym_encrypt('alice@example.test'::text, :'enc_key'), hmac('alice@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Alice', pgp_sym_encrypt('1990-04-12'::text, :'enc_key'), 'woman',
   (SELECT id FROM municipality WHERE insee_code = '75108'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000002', 'bob',
   pgp_sym_encrypt('bob@example.test'::text, :'enc_key'), hmac('bob@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Bob', pgp_sym_encrypt('1988-09-30'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '69383'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000003', 'chloe',
   pgp_sym_encrypt('chloe@example.test'::text, :'enc_key'), hmac('chloe@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Chloe', pgp_sym_encrypt('2010-05-01'::text, :'enc_key'), 'woman',
   (SELECT id FROM municipality WHERE insee_code = '13201'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000004', 'david',
   pgp_sym_encrypt('david@example.test'::text, :'enc_key'), hmac('david@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'David', pgp_sym_encrypt('1987-02-14'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '35238'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000005', 'emma',
   pgp_sym_encrypt('emma@example.test'::text, :'enc_key'), hmac('emma@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Emma', pgp_sym_encrypt('1995-07-03'::text, :'enc_key'), 'woman',
   (SELECT id FROM municipality WHERE insee_code = '33063'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000006', 'farid',
   pgp_sym_encrypt('farid@example.test'::text, :'enc_key'), hmac('farid@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Farid', pgp_sym_encrypt('1992-11-21'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '59350'), 'moderator', NULL),
  ('00000000-0000-7000-8000-000000000007', 'gina',
   pgp_sym_encrypt('gina@example.test'::text, :'enc_key'), hmac('gina@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Gina', pgp_sym_encrypt('1986-06-08'::text, :'enc_key'), 'non_binary',
   (SELECT id FROM municipality WHERE insee_code = '31555'), 'admin', NULL),
  ('00000000-0000-7000-8000-000000000008', 'hugo',
   pgp_sym_encrypt('hugo@example.test'::text, :'enc_key'), hmac('hugo@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Hugo', pgp_sym_encrypt('1991-01-19'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '44109'), 'user', now() - interval '3 days'),
  ('00000000-0000-7000-8000-000000000009', 'ines',
   pgp_sym_encrypt('ines@example.test'::text, :'enc_key'), hmac('ines@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Inès', pgp_sym_encrypt('1999-03-27'::text, :'enc_key'), 'prefer_not_to_say',
   (SELECT id FROM municipality WHERE insee_code = '75111'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000010', 'jules',
   pgp_sym_encrypt('jules@example.test'::text, :'enc_key'), hmac('jules@example.test'::text, :'hmac_key', 'sha256'),
   NULL, 'Jules', pgp_sym_encrypt('1996-10-05'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '06088'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000011', 'karim',
   pgp_sym_encrypt('karim@example.test'::text, :'enc_key'), hmac('karim@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Karim', pgp_sym_encrypt('1993-05-16'::text, :'enc_key'), 'man',
   (SELECT id FROM municipality WHERE insee_code = '67482'), 'user', NULL),
  ('00000000-0000-7000-8000-000000000012', 'lea',
   pgp_sym_encrypt('lea@example.test'::text, :'enc_key'), hmac('lea@example.test'::text, :'hmac_key', 'sha256'),
   now(), 'Léa', pgp_sym_encrypt('1989-12-02'::text, :'enc_key'), 'woman',
   (SELECT id FROM municipality WHERE insee_code = '34172'), 'user', NULL)
ON CONFLICT (id) DO NOTHING;

-- Login methods: password for everyone except bob (Google only); Google also for ines.
INSERT INTO auth_identity (user_id, provider, password_hash)
SELECT id, 'password', :'password_hash'
FROM user_account
WHERE username IN ('alice', 'chloe', 'david', 'emma', 'farid', 'gina', 'hugo', 'ines', 'jules', 'karim', 'lea')
ON CONFLICT DO NOTHING;

INSERT INTO auth_identity (user_id, provider, provider_subject)
SELECT id, 'google', 'google-' || username
FROM user_account
WHERE username IN ('bob', 'ines')
ON CONFLICT DO NOTHING;

-- Settings: one row per account (defaults), then the fixture-specific overrides.
INSERT INTO user_setting (user_id)
SELECT id FROM user_account
ON CONFLICT (user_id) DO NOTHING;

UPDATE user_setting SET is_private_account = true
WHERE user_id = (SELECT id FROM user_account WHERE username = 'david');
UPDATE user_setting SET profile_visibility = 'only_me'
WHERE user_id = (SELECT id FROM user_account WHERE username = 'emma');
UPDATE user_setting SET hide_from_rankings = true
WHERE user_id = (SELECT id FROM user_account WHERE username = 'karim');

-- Sports and self-declared levels.
INSERT INTO user_sport (user_id, sport_id, skill_level_id)
SELECT u.id, s.id, l.id
FROM (VALUES
  ('alice', 'football', 'intermediate'),
  ('alice', 'tennis', 'advanced'),
  ('bob', 'chess', 'expert')
) AS v(username, sport_code, level_code)
JOIN user_account u ON u.username = v.username
JOIN sport s ON s.code = v.sport_code
JOIN skill_level l ON l.code = v.level_code
ON CONFLICT DO NOTHING;

-- Official ratings: FIDE Elo for bob (numeric), French tennis ranking 15/2 for alice (graded).
INSERT INTO user_rating (user_id, rating_system_id, numeric_value)
SELECT u.id, rs.id, 1850
FROM user_account u
JOIN rating_system rs ON rs.code = 'fide_elo'
WHERE u.username = 'bob'
ON CONFLICT DO NOTHING;

INSERT INTO user_rating (user_id, rating_system_id, rating_grade_id)
SELECT u.id, rs.id, g.id
FROM user_account u
JOIN rating_system rs ON rs.code = 'fft_ranking'
JOIN rating_grade g ON g.rating_system_id = rs.id AND g.code = '15/2'
WHERE u.username = 'alice'
ON CONFLICT DO NOTHING;

-- Availability of alice: Monday and Wednesday 18:00-20:00, Saturday 10:00-12:00 (ISO days 1, 3, 6).
DELETE FROM user_availability
WHERE user_id = (SELECT id FROM user_account WHERE username = 'alice');

INSERT INTO user_availability (user_id, day_of_week, start_time, end_time)
SELECT u.id, v.day_of_week, v.start_time::time, v.end_time::time
FROM user_account u
CROSS JOIN (VALUES (1, '18:00', '20:00'), (3, '18:00', '20:00'), (6, '10:00', '12:00'))
  AS v(day_of_week, start_time, end_time)
WHERE u.username = 'alice';

COMMIT;
