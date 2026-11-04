-- Analytics (batch 5): derived tables, named constraints, comments, refresh functions and their windows
-- (BR-STA-06 to BR-STA-10, BR-GDP-06). Runs against teamdrop_test, inside one transaction rolled back at the end.
BEGIN;
SELECT plan(12);

SELECT has_table('heatmap_cell', 'table heatmap_cell exists');
SELECT has_table('sport_activity_daily', 'table sport_activity_daily exists');
SELECT has_table('user_city_activity', 'table user_city_activity exists');
SELECT has_table('platform_daily_stat', 'table platform_daily_stat exists');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'heatmap_cell'::regclass, 'sport_activity_daily'::regclass, 'user_city_activity'::regclass,
      'platform_daily_stat'::regclass)$$,
  ARRAY[
    'pk_heatmap_cell', 'fk_heatmap_cell_sport_id', 'ck_heatmap_cell_resolution', 'ck_heatmap_cell_month',
    'ck_heatmap_cell_day_of_week', 'ck_heatmap_cell_hour_of_day',
    'pk_sport_activity_daily', 'fk_sport_activity_daily_municipality_id', 'fk_sport_activity_daily_sport_id',
    'pk_user_city_activity', 'fk_user_city_activity_user_id', 'fk_user_city_activity_municipality_id',
    'ck_user_city_activity_month',
    'pk_platform_daily_stat'
  ]::text[],
  'the analytics tables have exactly their named constraints'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('heatmap_cell'::regclass, 'sport_activity_daily'::regclass,
                         'user_city_activity'::regclass, 'platform_daily_stat'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  ),
  'every column of the analytics tables has a comment'
);
SELECT has_function('refresh_analytics_nightly', 'the nightly refresh exists (BR-STA-09)');
SELECT has_function('refresh_user_city_activity', ARRAY['date'], 'the ranking refresh exists (BR-STA-09)');

-- Fixtures
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-00000000b000', '99110', 'Analytics test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-00000000b010', 'analytics_sport', 'Analytics sport', true, 'outdoor', 60);

SELECT throws_ok(
  $$INSERT INTO heatmap_cell VALUES ('881fb46625fffff', 7, '00000000-0000-7000-8000-00000000b010', '2026-01-01', 1, 10, 3, 3)$$,
  '23514', NULL, 'BR-STA-07: heatmap resolutions are 6, 8 and 9');
SELECT throws_ok(
  $$INSERT INTO heatmap_cell VALUES ('881fb46625fffff', 8, '00000000-0000-7000-8000-00000000b010', '2026-01-02', 1, 10, 3, 3)$$,
  '23514', NULL, 'heatmap months are first days of month');

-- BR-GDP-06: rows older than the refresh window are kept
INSERT INTO heatmap_cell VALUES ('881fb46625fffff', 8, '00000000-0000-7000-8000-00000000b010', '2020-01-01', 1, 10, 3, 3);
INSERT INTO sport_activity_daily VALUES ('00000000-0000-7000-8000-00000000b000', '00000000-0000-7000-8000-00000000b010', '2020-01-05', 3, 3);
SELECT refresh_analytics_nightly();
SELECT is(
  (SELECT count(*)::int FROM heatmap_cell WHERE month = '2020-01-01')
  + (SELECT count(*)::int FROM sport_activity_daily WHERE day = '2020-01-05'),
  2, 'BR-GDP-06: the nightly refresh keeps old anonymous aggregates');
SELECT is(
  (SELECT count(*)::int FROM platform_daily_stat WHERE day = (now() AT TIME ZONE 'Europe/Paris')::date - 1),
  1, 'BR-STA-10: the nightly refresh writes yesterday''s back-office row');

SELECT * FROM finish();
ROLLBACK;
