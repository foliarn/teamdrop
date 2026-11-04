-- Consent purposes (BR-GDP-01, BR-TECH-12). Idempotent: existing rows are left unchanged.
INSERT INTO consent_purpose (code, name, is_required) VALUES
  ('terms_of_service', 'Terms of service', true),
  ('privacy_policy', 'Privacy policy', true),
  ('geolocation', 'Geolocation', false),
  ('push_notifications', 'Push notifications', false),
  ('analytics', 'Analytics', false),
  ('rankings', 'Appearing in rankings', false)
ON CONFLICT DO NOTHING;
