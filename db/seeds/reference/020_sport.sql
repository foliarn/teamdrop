-- Default sports list (BR-ACC-17). Editable from the back office later: these are only the starting values.
-- Idempotent: existing rows (same code) are left unchanged.
INSERT INTO sport (code, name, is_team_sport, environment, default_duration_minutes, default_min_participants, default_max_participants, icon) VALUES
  ('football', 'Football', true, 'outdoor', 90, 6, 22, NULL),
  ('tennis', 'Tennis', false, 'both', 60, 2, 4, NULL),
  ('badminton', 'Badminton', false, 'indoor', 60, 2, 4, NULL),
  ('padel', 'Padel', false, 'both', 90, 4, 4, NULL),
  ('running', 'Running', false, 'outdoor', 60, 1, NULL, NULL),
  ('basketball', 'Basketball', true, 'both', 60, 4, 10, NULL),
  ('table_tennis', 'Table tennis', false, 'indoor', 60, 2, 4, NULL),
  ('american_football', 'American football', true, 'outdoor', 90, 10, 22, NULL),
  ('rugby', 'Rugby', true, 'outdoor', 80, 10, 30, NULL),
  ('fitness_gym', 'Fitness / Gym', false, 'indoor', 60, 1, NULL, NULL),
  ('street_workout', 'Street workout / Calisthenics', false, 'outdoor', 60, 1, NULL, NULL),
  ('golf', 'Golf', false, 'outdoor', 240, 1, 4, NULL),
  ('darts', 'Darts', false, 'indoor', 60, 2, 8, NULL),
  ('chess', 'Chess', false, 'indoor', 60, 2, 2, NULL),
  ('volleyball', 'Volleyball', true, 'both', 90, 4, 12, NULL),
  ('handball', 'Handball', true, 'indoor', 60, 8, 14, NULL),
  ('cycling', 'Cycling', false, 'outdoor', 120, 1, NULL, NULL),
  ('swimming', 'Swimming', false, 'indoor', 60, 1, NULL, NULL),
  ('climbing', 'Climbing', false, 'both', 120, 2, NULL, NULL),
  ('hiking', 'Hiking', false, 'outdoor', 180, 2, NULL, NULL),
  ('yoga', 'Yoga', false, 'both', 60, 1, NULL, NULL),
  ('boxing', 'Boxing', false, 'indoor', 60, 2, NULL, NULL),
  ('skiing', 'Skiing', false, 'outdoor', 240, 1, NULL, NULL)
ON CONFLICT DO NOTHING;
