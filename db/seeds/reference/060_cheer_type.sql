-- Cheer types (BR-SOC-11, BR-TECH-12): the starter list. Idempotent: existing rows are left unchanged, because the
-- back office may have edited them.
INSERT INTO cheer_type (code, name, sort_order) VALUES
  ('fair_play', 'Fair play', 1),
  ('punctual', 'Punctual', 2),
  ('great_teammate', 'Great teammate', 3),
  ('good_vibes', 'Good vibes', 4),
  ('skilled', 'Skilled', 5),
  ('motivating', 'Motivating', 6)
ON CONFLICT DO NOTHING;
