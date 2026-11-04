-- Dev fixtures: GDPR (batch 6). Current policy versions, consents of alice (required ones and two optional ones, one
-- withdrawn), a ready export of alice and a pending one of bob.
-- Dev data only. Idempotent. Ids: ...000000001cNN.
BEGIN;

INSERT INTO policy_version (id, document, version, url, published_at) VALUES
  ('00000000-0000-7000-8000-000000001c01', 'terms_of_service', '2026-11', 'https://teamdrop.example.test/legal/terms/2026-11', '2026-11-01 00:00:00+00'),
  ('00000000-0000-7000-8000-000000001c02', 'privacy_policy', '2026-11', 'https://teamdrop.example.test/legal/privacy/2026-11', '2026-11-01 00:00:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO user_consent (id, user_id, consent_purpose_id, policy_version_id, granted, created_at)
SELECT v.id::uuid, '00000000-0000-7000-8000-000000000001', cp.id, v.policy_id::uuid, v.granted, v.at::timestamptz
FROM (VALUES
  ('00000000-0000-7000-8000-000000001c11', 'terms_of_service', '00000000-0000-7000-8000-000000001c01', true, '2026-11-02 10:00:00+00'),
  ('00000000-0000-7000-8000-000000001c12', 'privacy_policy', '00000000-0000-7000-8000-000000001c02', true, '2026-11-02 10:00:00+00'),
  ('00000000-0000-7000-8000-000000001c13', 'geolocation', NULL, true, '2026-11-02 10:01:00+00'),
  ('00000000-0000-7000-8000-000000001c14', 'push_notifications', NULL, true, '2026-11-02 10:01:00+00'),
  ('00000000-0000-7000-8000-000000001c15', 'push_notifications', NULL, false, '2026-11-03 18:00:00+00')
) AS v(id, code, policy_id, granted, at)
JOIN consent_purpose cp ON cp.code = v.code
ON CONFLICT DO NOTHING;

INSERT INTO data_export_request (id, user_id, status, file_path, requested_at, completed_at, expires_at) VALUES
  ('00000000-0000-7000-8000-000000001c21', '00000000-0000-7000-8000-000000000001', 'ready',
   '/var/teamdrop/exports/00000000-0000-7000-8000-000000001c21.json', now() - interval '1 day',
   now() - interval '23 hours', now() - interval '23 hours' + interval '7 days'),
  ('00000000-0000-7000-8000-000000001c22', '00000000-0000-7000-8000-000000000002', 'pending', NULL, now() - interval '5 minutes',
   NULL, NULL)
ON CONFLICT DO NOTHING;

COMMIT;
