-- Badges (batch 4): tables, named constraints and indexes, comments, tier ownership and cascades (BR-GAM-01, BR-GAM-02).
-- Runs against teamdrop_test, inside one transaction rolled back at the end.
BEGIN;
SELECT plan(11);

SELECT has_table('badge', 'table badge exists');
SELECT has_table('badge_tier', 'table badge_tier exists');
SELECT has_table('user_badge', 'table user_badge exists');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'badge'::regclass, 'badge_tier'::regclass, 'user_badge'::regclass)$$,
  ARRAY[
    'pk_badge', 'uq_badge_code',
    'pk_badge_tier', 'uq_badge_tier_badge_rank', 'uq_badge_tier_id_badge', 'fk_badge_tier_badge_id',
    'ck_badge_tier_rank_positive', 'ck_badge_tier_threshold_not_negative',
    'pk_user_badge', 'fk_user_badge_user_id', 'fk_user_badge_badge_id', 'fk_user_badge_badge_tier_id'
  ]::text[],
  'the badge tables have exactly their named constraints'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('badge'::regclass, 'badge_tier'::regclass, 'user_badge'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  )
  AND obj_description('badge'::regclass, 'pg_class') IS NOT NULL
  AND obj_description('badge_tier'::regclass, 'pg_class') IS NOT NULL
  AND obj_description('user_badge'::regclass, 'pg_class') IS NOT NULL,
  'every badge table and column has a comment'
);
SELECT is((SELECT count(*)::int FROM badge), 0, 'BR-GAM-01: no badge is seeded (definitions are deferred)');

INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-00000000a000', '99100', 'Badges test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-00000000a001', 'badges_a', '\x01'::bytea, '\xa0a1'::bytea, 'A', '\x01'::bytea, '00000000-0000-7000-8000-00000000a000');
INSERT INTO badge (id, code, name, description, category, sort_order) VALUES
  ('00000000-0000-7000-8000-00000000a010', 'test_one', 'One', 'x', 'x', 1),
  ('00000000-0000-7000-8000-00000000a011', 'test_two', 'Two', 'x', 'x', 2);
INSERT INTO badge_tier (id, badge_id, tier_rank, name, threshold) VALUES
  ('00000000-0000-7000-8000-00000000a020', '00000000-0000-7000-8000-00000000a010', 1, 'Bronze', 5),
  ('00000000-0000-7000-8000-00000000a021', '00000000-0000-7000-8000-00000000a011', 1, 'Bronze', 5);

SELECT throws_ok(
  $$INSERT INTO badge_tier (badge_id, tier_rank, name, threshold) VALUES ('00000000-0000-7000-8000-00000000a010', 1, 'Again', 9)$$,
  '23505', 'duplicate key value violates unique constraint "uq_badge_tier_badge_rank"',
  'BR-GAM-01: one tier per rank and badge');
SELECT throws_ok(
  $$INSERT INTO user_badge (user_id, badge_id, badge_tier_id) VALUES
    ('00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000a010', '00000000-0000-7000-8000-00000000a021')$$,
  '23503', NULL, 'BR-GAM-01: a held tier must belong to the badge');
INSERT INTO user_badge (user_id, badge_id, badge_tier_id) VALUES
  ('00000000-0000-7000-8000-00000000a001', '00000000-0000-7000-8000-00000000a010', '00000000-0000-7000-8000-00000000a020');
SELECT is((SELECT seen_at FROM user_badge WHERE badge_id = '00000000-0000-7000-8000-00000000a010'), NULL,
  'BR-GAM-01: a new badge is unseen');
DELETE FROM badge_tier WHERE id = '00000000-0000-7000-8000-00000000a020';
SELECT is((SELECT badge_tier_id FROM user_badge WHERE badge_id = '00000000-0000-7000-8000-00000000a010'), NULL,
  'deleting a tier keeps the badge without a tier');
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-00000000a001';
SELECT is((SELECT count(*)::int FROM user_badge WHERE user_id = '00000000-0000-7000-8000-00000000a001'), 0,
  'erasing a user deletes their badges');

SELECT * FROM finish();
ROLLBACK;
