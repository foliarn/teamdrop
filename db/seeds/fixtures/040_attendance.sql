-- Dev fixtures: attendance after two past sessions of E01 (batch 1D, BR-ATT-01, BR-ATT-02).
-- Session A (14 days before the most recent Monday): alice attended, karim no_show with an open dispute, ines excused,
-- lea attended. Session B (7 days before it): alice attended, jules no_show without dispute, karim attended.
-- Both sessions are completed. Dates are real Mondays of the E01 schedule (Monday 19:00, Europe/Paris, 90 minutes).
-- Idempotent: every insert uses fixed ids and ON CONFLICT DO NOTHING.
-- Users and event E01 come from 010_accounts.sql and 030_events.sql.
-- Ids: occurrences ...0000000008NN, registrations ...0000000009NN, disputes ...000000000aNN.

-- Reference dates in the Europe/Paris calendar (psql variables, used as :'name' literals).
SELECT
  ((current_date - (extract(isodow FROM current_date)::int - 1) - 14)::date)::text AS session_a,
  ((current_date - (extract(isodow FROM current_date)::int - 1) - 7)::date)::text AS session_b
\gset

BEGIN;

-- Occurrences: completed sessions of E01 (BR-EVT-26). Duration is inherited from the event (90 minutes).
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at, status, completed_at) VALUES
  ('00000000-0000-7000-8000-000000000801', '00000000-0000-7000-8000-000000000301',
   (:'session_a'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   (:'session_a'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   'completed', (:'session_a'::date + time '20:30') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000802', '00000000-0000-7000-8000-000000000301',
   (:'session_b'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   (:'session_b'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   'completed', (:'session_b'::date + time '20:30') AT TIME ZONE 'Europe/Paris')
ON CONFLICT (id) DO NOTHING;

-- Registrations. Attendance is only set on confirmed registrations (BR-ATT-03).
-- Declared by the organizer (alice, the owner): attendance_set_by_id is alice. Attended by completion: set_by NULL.
INSERT INTO registration (id, occurrence_id, user_id, status, attendance, attendance_set_by_id, attendance_set_at,
                          created_at, confirmed_at) VALUES
  -- Session A
  ('00000000-0000-7000-8000-000000000901', '00000000-0000-7000-8000-000000000801', '00000000-0000-7000-8000-000000000001',
   'confirmed', 'attended', NULL, (:'session_a'::date + time '20:30') AT TIME ZONE 'Europe/Paris',
   ((:'session_a'::date - 3) + time '12:00') AT TIME ZONE 'Europe/Paris', ((:'session_a'::date - 3) + time '12:00') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000902', '00000000-0000-7000-8000-000000000801', '00000000-0000-7000-8000-000000000011',
   'confirmed', 'no_show', '00000000-0000-7000-8000-000000000001', (:'session_a'::date + time '21:00') AT TIME ZONE 'Europe/Paris',
   ((:'session_a'::date - 3) + time '12:05') AT TIME ZONE 'Europe/Paris', ((:'session_a'::date - 3) + time '12:05') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000903', '00000000-0000-7000-8000-000000000801', '00000000-0000-7000-8000-000000000009',
   'confirmed', 'excused', '00000000-0000-7000-8000-000000000001', (:'session_a'::date + time '21:00') AT TIME ZONE 'Europe/Paris',
   ((:'session_a'::date - 2) + time '09:00') AT TIME ZONE 'Europe/Paris', ((:'session_a'::date - 2) + time '09:00') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000904', '00000000-0000-7000-8000-000000000801', '00000000-0000-7000-8000-000000000012',
   'confirmed', 'attended', NULL, (:'session_a'::date + time '20:30') AT TIME ZONE 'Europe/Paris',
   ((:'session_a'::date - 1) + time '18:00') AT TIME ZONE 'Europe/Paris', ((:'session_a'::date - 1) + time '18:00') AT TIME ZONE 'Europe/Paris'),
  -- Session B
  ('00000000-0000-7000-8000-000000000905', '00000000-0000-7000-8000-000000000802', '00000000-0000-7000-8000-000000000001',
   'confirmed', 'attended', NULL, (:'session_b'::date + time '20:30') AT TIME ZONE 'Europe/Paris',
   ((:'session_b'::date - 3) + time '12:00') AT TIME ZONE 'Europe/Paris', ((:'session_b'::date - 3) + time '12:00') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000906', '00000000-0000-7000-8000-000000000802', '00000000-0000-7000-8000-000000000010',
   'confirmed', 'no_show', '00000000-0000-7000-8000-000000000001', (:'session_b'::date + time '21:00') AT TIME ZONE 'Europe/Paris',
   ((:'session_b'::date - 2) + time '10:00') AT TIME ZONE 'Europe/Paris', ((:'session_b'::date - 2) + time '10:00') AT TIME ZONE 'Europe/Paris'),
  ('00000000-0000-7000-8000-000000000907', '00000000-0000-7000-8000-000000000802', '00000000-0000-7000-8000-000000000011',
   'confirmed', 'attended', NULL, (:'session_b'::date + time '20:30') AT TIME ZONE 'Europe/Paris',
   ((:'session_b'::date - 2) + time '10:05') AT TIME ZONE 'Europe/Paris', ((:'session_b'::date - 2) + time '10:05') AT TIME ZONE 'Europe/Paris')
ON CONFLICT (id) DO NOTHING;

-- Dispute of karim's no-show in session A: opened the day after the session, inside the 7-day window (BR-ATT-02).
-- Still open: no moderator has decided yet.
INSERT INTO attendance_dispute (id, registration_id, reason, status, resolved_by_id, created_at, resolved_at) VALUES
  ('00000000-0000-7000-8000-000000000a01', '00000000-0000-7000-8000-000000000902',
   'I was there, arrived 5 minutes late', 'open', NULL,
   ((:'session_a'::date + 1) + time '10:00') AT TIME ZONE 'Europe/Paris', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
