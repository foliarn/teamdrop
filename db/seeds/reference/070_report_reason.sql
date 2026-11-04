-- Report reasons (BR-MOD-01, BR-TECH-12). Idempotent: existing rows are left unchanged, because the back office may
-- have edited them.
INSERT INTO report_reason (code, name, sort_order) VALUES
  ('harassment', 'Harassment', 1),
  ('hate_speech', 'Hate speech', 2),
  ('spam', 'Spam', 3),
  ('inappropriate_content', 'Inappropriate content', 4),
  ('fake_profile', 'Fake profile', 5),
  ('dangerous_behaviour', 'Dangerous behaviour', 6),
  ('no_show_organizer_or_fake_event', 'No-show organizer or fake event', 7),
  ('underage_user', 'Underage user', 8),
  ('scam_or_illegal_payment', 'Scam or illegal payment', 9),
  ('other', 'Other', 10)
ON CONFLICT DO NOTHING;
