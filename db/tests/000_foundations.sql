-- Foundations: extensions, roles, common functions. Runs against teamdrop_test.
BEGIN;
SELECT plan(18);

-- Extensions
SELECT has_extension('postgis', 'extension postgis is installed');
SELECT has_extension('postgis_raster', 'extension postgis_raster is installed');
SELECT has_extension('h3', 'extension h3 is installed');
SELECT has_extension('h3_postgis', 'extension h3_postgis is installed');
SELECT has_extension('pgcrypto', 'extension pgcrypto is installed');
SELECT has_extension('citext', 'extension citext is installed');
SELECT has_extension('pg_trgm', 'extension pg_trgm is installed');
SELECT has_extension('unaccent', 'extension unaccent is installed');
SELECT has_extension('btree_gist', 'extension btree_gist is installed');
SELECT has_extension('pgtap', 'extension pgtap is installed');

-- Roles
SELECT has_role('teamdrop_owner', 'role teamdrop_owner exists');
SELECT has_role('teamdrop_app', 'role teamdrop_app exists');
SELECT has_role('teamdrop_readonly', 'role teamdrop_readonly exists');

-- Common functions
SELECT has_function('set_updated_at', 'function set_updated_at() exists');
SELECT has_function('immutable_unaccent', ARRAY['text']::name[], 'function immutable_unaccent(text) exists');

-- uuidv7() returns a version 7 UUID (version nibble is the 15th character)
SELECT ok(substr(uuidv7()::text, 15, 1) = '7', 'uuidv7() returns a version 7 UUID');

-- immutable_unaccent strips accents (U&'\00C9' is capital E with acute accent)
SELECT is(immutable_unaccent(U&'\00C9lodie'), 'Elodie', 'immutable_unaccent removes accents');

-- set_updated_at refreshes updated_at on UPDATE
CREATE TEMP TABLE touch_test (
  id int PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_touch_test_set_updated_at
  BEFORE UPDATE ON touch_test
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO touch_test (id, updated_at) VALUES (1, '2000-01-01 00:00:00+00');
UPDATE touch_test SET id = id WHERE id = 1;
SELECT ok(
  (SELECT updated_at FROM touch_test WHERE id = 1) > '2000-01-01 00:00:00+00'::timestamptz,
  'set_updated_at refreshes updated_at on UPDATE'
);

SELECT * FROM finish();
ROLLBACK;
