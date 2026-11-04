-- Shared self-declared skill scale (BR-ACC-10). Idempotent: existing rows are left unchanged.
INSERT INTO skill_level (code, name, rank) VALUES
  ('beginner', 'Beginner', 1),
  ('intermediate', 'Intermediate', 2),
  ('advanced', 'Advanced', 3),
  ('expert', 'Expert', 4)
ON CONFLICT DO NOTHING;
