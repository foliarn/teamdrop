-- Dev fixtures: cheers and moderation (batch 3).
-- Cheers on the two completed sessions of E01 (040_attendance.sql): only between participants who attended (BR-SOC-11).
-- Reports: one per target kind and per status. Sanctions: a warning for karim, a temporary ban for bob (7 days from
-- loading) and a permanent ban for hugo, whose email hash is a banned identity (BR-MOD-04): hugo cannot log in in dev.
-- Audit rows for every moderator action above (BR-MOD-05).
-- Moderator: farid (...06). Admin: gina (...07). Users come from 010_accounts.sql, messages from 050_messaging.sql.
-- Ids: cheers ...000000000dNN, reports ...000000000eNN, sanctions ...000000000fNN, audit ...000000001aNN.
-- Dev data only. Idempotent: fixed ids and ON CONFLICT DO NOTHING.

BEGIN;

-- Cheers (BR-SOC-11). Session A (...801): alice and lea attended. Session B (...802): alice and karim attended.
INSERT INTO cheer (id, occurrence_id, giver_id, recipient_id, cheer_type_id, created_at)
SELECT v.id::uuid, v.occurrence_id::uuid, v.giver_id::uuid, v.recipient_id::uuid, t.id, now() - v.age
FROM (VALUES
  ('00000000-0000-7000-8000-000000000d01', '00000000-0000-7000-8000-000000000801',
   '00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000001', 'good_vibes', interval '13 days'),
  ('00000000-0000-7000-8000-000000000d02', '00000000-0000-7000-8000-000000000801',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000012', 'motivating', interval '13 days'),
  ('00000000-0000-7000-8000-000000000d03', '00000000-0000-7000-8000-000000000802',
   '00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000011', 'fair_play', interval '6 days'),
  ('00000000-0000-7000-8000-000000000d04', '00000000-0000-7000-8000-000000000802',
   '00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000001', 'punctual', interval '6 days')
) AS v(id, occurrence_id, giver_id, recipient_id, type_code, age)
JOIN cheer_type t ON t.code = v.type_code
ON CONFLICT DO NOTHING;

-- Reports (BR-MOD-01, BR-MOD-02).
INSERT INTO report (id, reporter_id, report_reason_id, target_user_id, target_event_id, target_message_id, details,
                    status, assigned_moderator_id, resolution_note, created_at, assigned_at, closed_at)
SELECT v.id::uuid, v.reporter_id::uuid, r.id, v.target_user_id::uuid, v.target_event_id::uuid, v.target_message_id::uuid,
       v.details, v.status::report_status, v.moderator_id::uuid, v.note, now() - v.age,
       CASE WHEN v.status <> 'open' THEN now() - v.age + interval '2 hours' END,
       CASE WHEN v.status IN ('resolved', 'dismissed') THEN now() - v.age + interval '1 day' END
FROM (VALUES
  -- Open: lea reports karim's behaviour.
  ('00000000-0000-7000-8000-000000000e01', '00000000-0000-7000-8000-000000000012', 'harassment',
   '00000000-0000-7000-8000-000000000011', NULL, NULL, 'Shouted at me during the session.',
   'open', NULL, NULL, interval '2 days'),
  -- Assigned to farid: ines reports karim's circle message.
  ('00000000-0000-7000-8000-000000000e02', '00000000-0000-7000-8000-000000000009', 'spam',
   NULL, NULL, '00000000-0000-7000-8000-000000000b03', NULL,
   'assigned', '00000000-0000-7000-8000-000000000006', NULL, interval '1 day'),
  -- Resolved by farid with a warning: alice reports karim.
  ('00000000-0000-7000-8000-000000000e03', '00000000-0000-7000-8000-000000000001', 'dangerous_behaviour',
   '00000000-0000-7000-8000-000000000011', NULL, NULL, 'Tackles from behind.',
   'resolved', '00000000-0000-7000-8000-000000000006', 'Warning issued.', interval '10 days'),
  -- Dismissed by farid: karim reports ines's event.
  ('00000000-0000-7000-8000-000000000e04', '00000000-0000-7000-8000-000000000011', 'no_show_organizer_or_fake_event',
   NULL, '00000000-0000-7000-8000-000000000302', NULL, NULL,
   'dismissed', '00000000-0000-7000-8000-000000000006', 'The event took place.', interval '5 days')
) AS v(id, reporter_id, reason_code, target_user_id, target_event_id, target_message_id, details, status,
       moderator_id, note, age)
JOIN report_reason r ON r.code = v.reason_code
ON CONFLICT DO NOTHING;

-- Sanctions (BR-MOD-03).
INSERT INTO user_sanction (id, user_id, kind, reason, report_id, issued_by_id, starts_at, ends_at, created_at) VALUES
  ('00000000-0000-7000-8000-000000000f01', '00000000-0000-7000-8000-000000000011', 'warning', 'Dangerous tackles.',
   '00000000-0000-7000-8000-000000000e03', '00000000-0000-7000-8000-000000000006', now() - interval '9 days', NULL,
   now() - interval '9 days'),
  ('00000000-0000-7000-8000-000000000f02', '00000000-0000-7000-8000-000000000002', 'temporary_ban', 'Repeated spam.',
   NULL, '00000000-0000-7000-8000-000000000006', now() - interval '1 day', now() + interval '6 days',
   now() - interval '1 day'),
  ('00000000-0000-7000-8000-000000000f03', '00000000-0000-7000-8000-000000000008', 'permanent_ban', 'Scam attempts.',
   NULL, '00000000-0000-7000-8000-000000000007', now() - interval '3 days', NULL, now() - interval '3 days')
ON CONFLICT DO NOTHING;

-- Banned identity of hugo's permanent ban: the email hash, as user_account.email_hash (BR-MOD-04).
INSERT INTO banned_identity (identity_kind, identity_hash, created_at)
SELECT 'email', u.email_hash, now() - interval '3 days'
FROM user_account u WHERE u.id = '00000000-0000-7000-8000-000000000008'
ON CONFLICT DO NOTHING;

-- Audit log (BR-MOD-05).
INSERT INTO audit_log (id, actor_id, action, target_table, target_id, report_id, details, created_at) VALUES
  ('00000000-0000-7000-8000-000000001a01', '00000000-0000-7000-8000-000000000006', 'report.assigned', 'report',
   '00000000-0000-7000-8000-000000000e02', '00000000-0000-7000-8000-000000000e02', NULL, now() - interval '22 hours'),
  ('00000000-0000-7000-8000-000000001a02', '00000000-0000-7000-8000-000000000006', 'report.resolved', 'report',
   '00000000-0000-7000-8000-000000000e03', '00000000-0000-7000-8000-000000000e03', NULL, now() - interval '9 days'),
  ('00000000-0000-7000-8000-000000001a03', '00000000-0000-7000-8000-000000000006', 'sanction.issued', 'user_account',
   '00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000e03',
   '{"sanctionId": "00000000-0000-7000-8000-000000000f01", "kind": "warning"}', now() - interval '9 days'),
  ('00000000-0000-7000-8000-000000001a04', '00000000-0000-7000-8000-000000000006', 'report.dismissed', 'report',
   '00000000-0000-7000-8000-000000000e04', '00000000-0000-7000-8000-000000000e04', NULL, now() - interval '4 days'),
  ('00000000-0000-7000-8000-000000001a05', '00000000-0000-7000-8000-000000000006', 'sanction.issued', 'user_account',
   '00000000-0000-7000-8000-000000000002', NULL,
   '{"sanctionId": "00000000-0000-7000-8000-000000000f02", "kind": "temporary_ban"}', now() - interval '1 day'),
  ('00000000-0000-7000-8000-000000001a06', '00000000-0000-7000-8000-000000000007', 'sanction.issued', 'user_account',
   '00000000-0000-7000-8000-000000000008', NULL,
   '{"sanctionId": "00000000-0000-7000-8000-000000000f03", "kind": "permanent_ban"}', now() - interval '3 days')
ON CONFLICT DO NOTHING;

COMMIT;
