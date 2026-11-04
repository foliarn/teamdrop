-- Reference data (batch 1A): tables, keys, named constraints and the rows they reject. Runs against teamdrop_test.
BEGIN;
SELECT plan(33);

-- Tables
SELECT has_table('municipality', 'table municipality exists');
SELECT has_table('sport', 'table sport exists');
SELECT has_table('skill_level', 'table skill_level exists');
SELECT has_table('rating_system', 'table rating_system exists');
SELECT has_table('rating_grade', 'table rating_grade exists');

-- Primary keys
SELECT col_is_pk('municipality', 'id', 'municipality.id is the primary key');
SELECT col_is_pk('sport', 'id', 'sport.id is the primary key');
SELECT col_is_pk('skill_level', 'id', 'skill_level.id is the primary key');
SELECT col_is_pk('rating_system', 'id', 'rating_system.id is the primary key');
SELECT col_is_pk('rating_grade', 'id', 'rating_grade.id is the primary key');

-- Enums
SELECT enum_has_labels('sport_environment', ARRAY['indoor', 'outdoor', 'both'], 'sport_environment has its labels');
SELECT enum_has_labels('rating_value_kind', ARRAY['numeric', 'graded'], 'rating_value_kind has its labels');

-- Named constraints and indexes exist
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE conname IN (
      'uq_municipality_insee_code', 'ck_municipality_not_own_parent', 'fk_municipality_parent_municipality_id',
      'uq_sport_code', 'ck_sport_default_duration_positive', 'ck_sport_default_min_participants',
      'ck_sport_default_max_participants', 'ck_sport_default_participants_order',
      'uq_skill_level_code', 'uq_skill_level_rank', 'ck_skill_level_rank_positive',
      'uq_rating_system_code', 'ck_rating_system_bounds_order', 'fk_rating_system_sport_id',
      'fk_rating_grade_rating_system_id', 'uq_rating_grade_system_rank', 'uq_rating_grade_system_code')$$,
  ARRAY[
    'uq_municipality_insee_code', 'ck_municipality_not_own_parent', 'fk_municipality_parent_municipality_id',
    'uq_sport_code', 'ck_sport_default_duration_positive', 'ck_sport_default_min_participants',
    'ck_sport_default_max_participants', 'ck_sport_default_participants_order',
    'uq_skill_level_code', 'uq_skill_level_rank', 'ck_skill_level_rank_positive',
    'uq_rating_system_code', 'ck_rating_system_bounds_order', 'fk_rating_system_sport_id',
    'fk_rating_grade_rating_system_id', 'uq_rating_grade_system_rank', 'uq_rating_grade_system_code'
  ]::text[],
  'all named reference constraints exist'
);

SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_municipality_parent_municipality_id', 'ix_municipality_name_trgm',
      'ix_municipality_center', 'ix_rating_system_sport_id')$$,
  ARRAY['ix_municipality_parent_municipality_id', 'ix_municipality_name_trgm',
        'ix_municipality_center', 'ix_rating_system_sport_id']::text[],
  'all named reference indexes exist'
);

-- Base rows (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-00000000a001', '75056', 'Paris', '75', 2100000,
   ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography);
INSERT INTO municipality (id, insee_code, name, department_code, population, center, parent_municipality_id) VALUES
  ('00000000-0000-7000-8000-00000000a008', '75108', 'Paris 8e', '75', 40000,
   ST_SetSRID(ST_MakePoint(2.3100, 48.8740), 4326)::geography, '00000000-0000-7000-8000-00000000a001');
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes, default_min_participants, default_max_participants) VALUES
  ('00000000-0000-7000-8000-00000000b001', 'football', 'Football', true, 'outdoor', 90, 6, 22),
  ('00000000-0000-7000-8000-00000000b002', 'tennis', 'Tennis', false, 'both', 60, 2, 4);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-00000000c001', 'beginner', 'Beginner', 1);
INSERT INTO rating_system (id, sport_id, code, name, value_kind, min_value, max_value) VALUES
  ('00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000b001', 'fide_elo', 'FIDE Elo', 'numeric', 0, 3500);
INSERT INTO rating_system (id, sport_id, code, name, value_kind) VALUES
  ('00000000-0000-7000-8000-00000000d002', '00000000-0000-7000-8000-00000000b002', 'fft_ranking', 'French tennis ranking', 'graded');
INSERT INTO rating_grade (id, rating_system_id, code, rank) VALUES
  ('00000000-0000-7000-8000-00000000e001', '00000000-0000-7000-8000-00000000d002', 'NC', 1);

-- municipality
SELECT throws_ok(
  $$INSERT INTO municipality (insee_code, name, department_code, population, center)
    VALUES ('75056', 'Paris bis', '75', 0, ST_SetSRID(ST_MakePoint(2.3, 48.8), 4326)::geography)$$,
  '23505', NULL, 'uq_municipality_insee_code rejects a duplicate INSEE code (BR-ACC-13)');
SELECT throws_ok(
  $$INSERT INTO municipality (id, insee_code, name, department_code, population, center, parent_municipality_id)
    VALUES ('00000000-0000-7000-8000-00000000a002', '75002', 'Self', '75', 0,
      ST_SetSRID(ST_MakePoint(2.3, 48.8), 4326)::geography, '00000000-0000-7000-8000-00000000a002')$$,
  '23514', NULL, 'ck_municipality_not_own_parent rejects a municipality that is its own parent');
SELECT throws_ok(
  $$INSERT INTO municipality (insee_code, name, department_code, population, center, parent_municipality_id)
    VALUES ('75003', 'Orphan', '75', 0, ST_SetSRID(ST_MakePoint(2.3, 48.8), 4326)::geography,
      '00000000-0000-7000-8000-00000000ffff')$$,
  '23503', NULL, 'fk_municipality_parent_municipality_id rejects an unknown parent');
SELECT is(
  (SELECT parent_municipality_id::text FROM municipality WHERE insee_code = '75108'),
  '00000000-0000-7000-8000-00000000a001',
  'an arrondissement points to its parent city (BR-ACC-19)');
SELECT throws_ok(
  $$DELETE FROM municipality WHERE insee_code = '75056'$$,
  '23001', NULL, 'parent municipality cannot be deleted while arrondissements reference it (RESTRICT)');

-- sport
SELECT throws_ok(
  $$INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes, is_active)
    VALUES ('football', 'Football again', true, 'outdoor', 90, true)$$,
  '23505', NULL, 'uq_sport_code rejects a duplicate sport code');
SELECT throws_ok(
  $$INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes)
    VALUES ('zero_duration', 'Zero', false, 'indoor', 0)$$,
  '23514', NULL, 'ck_sport_default_duration_positive rejects a zero duration');
SELECT throws_ok(
  $$INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes, default_min_participants)
    VALUES ('zero_min', 'Zero min', false, 'indoor', 60, 0)$$,
  '23514', NULL, 'ck_sport_default_min_participants rejects a minimum below 1');
SELECT throws_ok(
  $$INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes, default_max_participants)
    VALUES ('zero_max', 'Zero max', false, 'indoor', 60, 0)$$,
  '23514', NULL, 'ck_sport_default_max_participants rejects a maximum below 1');
SELECT throws_ok(
  $$INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes, default_min_participants, default_max_participants)
    VALUES ('inverted', 'Inverted', true, 'outdoor', 90, 5, 2)$$,
  '23514', NULL, 'ck_sport_default_participants_order rejects min greater than max');

-- skill_level
SELECT throws_ok(
  $$INSERT INTO skill_level (code, name, rank) VALUES ('beginner', 'Dup', 9)$$,
  '23505', NULL, 'uq_skill_level_code rejects a duplicate code');
SELECT throws_ok(
  $$INSERT INTO skill_level (code, name, rank) VALUES ('other', 'Dup rank', 1)$$,
  '23505', NULL, 'uq_skill_level_rank rejects a duplicate rank');
SELECT throws_ok(
  $$INSERT INTO skill_level (code, name, rank) VALUES ('zero', 'Zero', 0)$$,
  '23514', NULL, 'ck_skill_level_rank_positive rejects a rank below 1');

-- rating_system
SELECT throws_ok(
  $$INSERT INTO rating_system (sport_id, code, name, value_kind)
    VALUES ('00000000-0000-7000-8000-00000000b001', 'fide_elo', 'Dup', 'numeric')$$,
  '23505', NULL, 'uq_rating_system_code rejects a duplicate rating system code');
SELECT throws_ok(
  $$INSERT INTO rating_system (sport_id, code, name, value_kind, min_value, max_value)
    VALUES ('00000000-0000-7000-8000-00000000b001', 'bad_bounds', 'Bad', 'numeric', 10, 5)$$,
  '23514', NULL, 'ck_rating_system_bounds_order rejects min greater than max');
SELECT throws_ok(
  $$INSERT INTO rating_system (sport_id, code, name, value_kind)
    VALUES ('00000000-0000-7000-8000-00000000ffff', 'orphan', 'Orphan', 'numeric')$$,
  '23503', NULL, 'fk_rating_system_sport_id rejects an unknown sport');

-- rating_grade
SELECT throws_ok(
  $$INSERT INTO rating_grade (rating_system_id, code, rank)
    VALUES ('00000000-0000-7000-8000-00000000d002', 'AB', 1)$$,
  '23505', NULL, 'uq_rating_grade_system_rank rejects a duplicate rank within a system');
SELECT throws_ok(
  $$INSERT INTO rating_grade (rating_system_id, code, rank)
    VALUES ('00000000-0000-7000-8000-00000000d002', 'NC', 2)$$,
  '23505', NULL, 'uq_rating_grade_system_code rejects a duplicate code within a system');

-- Deleting a rating system removes its grades (CASCADE)
DELETE FROM rating_system WHERE id = '00000000-0000-7000-8000-00000000d002';
SELECT is(
  (SELECT count(*)::int FROM rating_grade WHERE rating_system_id = '00000000-0000-7000-8000-00000000d002'),
  0,
  'rating grades are deleted with their rating system (CASCADE)');

SELECT * FROM finish();
ROLLBACK;
