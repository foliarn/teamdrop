-- Dev fixtures: events, occurrences, venues, registrations and guests (batch 1C).
-- Covers a weekly series with a materialized and a cancelled occurrence, a one-off full event with a waitlist,
-- an approval-mode event, an adults-only event, a circle-only series, a hidden location, a this-and-following split,
-- and one draft. Dates are computed from current_date, so they stay in the future when the fixtures are loaded.
-- Idempotent: every insert uses fixed ids and ON CONFLICT DO NOTHING.
-- Users, circles and communities come from 010_accounts.sql and 020_social.sql.
-- Ids: events ...0000000003NN, occurrences ...0000000004NN, registrations ...0000000005NN,
--      guests ...0000000006NN, venues ...0000000007NN.

-- Reference dates in the Europe/Paris calendar (psql variables, used as :'name' literals).
SELECT
  ((current_date + ((1 - extract(isodow FROM current_date)::int + 6) % 7 + 1))::date)::text AS next_monday,
  ((current_date + ((3 - extract(isodow FROM current_date)::int + 6) % 7 + 1))::date)::text AS next_wednesday,
  (current_date + 3)::date::text AS in_three_days,
  (current_date + 5)::date::text AS in_five_days,
  (current_date + 7)::date::text AS in_seven_days,
  (current_date + 10)::date::text AS in_ten_days,
  (current_date + 14)::date::text AS in_fourteen_days
\gset

BEGIN;

-- Venue (public, created by bob) used by the padel series.
INSERT INTO venue (id, name, address, municipality_id, location, is_private, created_by_id) VALUES
  ('00000000-0000-7000-8000-000000000701', 'Padel Lyon Center (test)', 'Centre padel test, 69003 Lyon',
   (SELECT id FROM municipality WHERE insee_code = '69383'),
   ST_SetSRID(ST_MakePoint(4.8400, 45.7550), 4326)::geography, false,
   '00000000-0000-7000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Events. start_date and start_time are local, in Europe/Paris.
INSERT INTO event (id, owner_id, community_id, sport_id, title, description, skill_level_min_id, skill_level_max_id,
                   adults_only, max_participants, owner_counts_toward_capacity, registration_mode, visibility,
                   circle_priority_hours, venue_id, address, municipality_id, location, location_hidden,
                   start_date, start_time, duration_minutes, time_zone, recurrence_rule, recurrence_until,
                   recurrence_count, status, published_at, significant_change_at, split_from_event_id) VALUES
  -- E01: weekly Monday five-a-side (alice), Paris 8e. The next Monday has a location override and a guest.
  ('00000000-0000-7000-8000-000000000301', '00000000-0000-7000-8000-000000000001', NULL,
   (SELECT id FROM sport WHERE code = 'football'), 'Monday 5v5 football',
   'Five-a-side on the Paris 8e pitch. Shin pads recommended.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'advanced'),
   false, 10, true, 'automatic', 'public', NULL, NULL,
   'Terrain test, 75008 Paris', (SELECT id FROM municipality WHERE insee_code = '75108'),
   ST_SetSRID(ST_MakePoint(2.3100, 48.8740), 4326)::geography, false,
   (:'next_monday'::date - 21), '19:00', 90, 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=MO', NULL, NULL,
   'published', now() - interval '30 days', NULL, NULL),
  -- E02: one-off tennis doubles (ines), full with a waitlist. Owner plays.
  ('00000000-0000-7000-8000-000000000302', '00000000-0000-7000-8000-000000000009', NULL,
   (SELECT id FROM sport WHERE code = 'tennis'), 'Tennis doubles',
   'Doubles on the hard court. Bring your own racket.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'advanced'),
   false, 4, true, 'automatic', 'public', NULL, NULL,
   'Court test, 75011 Paris', (SELECT id FROM municipality WHERE insee_code = '75111'),
   ST_SetSRID(ST_MakePoint(2.3790, 48.8590), 4326)::geography, false,
   (:'in_five_days'::date), '18:30', 60, 'Europe/Paris', NULL, NULL, NULL,
   'published', now() - interval '2 days', NULL, NULL),
  -- E03: chess blitz (bob), Lyon 3e, approval mode. Two requests are pending.
  ('00000000-0000-7000-8000-000000000303', '00000000-0000-7000-8000-000000000002', NULL,
   (SELECT id FROM sport WHERE code = 'chess'), 'Chess blitz evening',
   'Blitz tournament, 5 minutes per player. Boards provided.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'expert'),
   false, 8, true, 'approval', 'public', NULL, NULL,
   'Club test, 69003 Lyon', (SELECT id FROM municipality WHERE insee_code = '69383'),
   ST_SetSRID(ST_MakePoint(4.8500, 45.7600), 4326)::geography, false,
   (:'in_seven_days'::date), '20:00', 60, 'Europe/Paris', NULL, NULL, NULL,
   'published', now() - interval '1 day', NULL, NULL),
  -- E04: darts night (gina), Toulouse, adults only.
  ('00000000-0000-7000-8000-000000000304', '00000000-0000-7000-8000-000000000007', NULL,
   (SELECT id FROM sport WHERE code = 'darts'), 'Darts night',
   'Adults only. Bar league format.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'expert'),
   true, 8, true, 'automatic', 'public', NULL, NULL,
   'Bar test, 31000 Toulouse', (SELECT id FROM municipality WHERE insee_code = '31555'),
   ST_SetSRID(ST_MakePoint(1.4442, 43.6045), 4326)::geography, false,
   (:'in_ten_days'::date), '21:00', 120, 'Europe/Paris', NULL, NULL, NULL,
   'published', now() - interval '3 days', NULL, NULL),
  -- E05: Sunday football reserved for circle 01 (alice), weekly Sundays 10:00.
  ('00000000-0000-7000-8000-000000000305', '00000000-0000-7000-8000-000000000001', NULL,
   (SELECT id FROM sport WHERE code = 'football'), 'Sunday football (circle)',
   'Reserved for the Sunday football circle.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'advanced'),
   false, 12, true, 'automatic', 'circle_only', NULL, NULL,
   'Terrain test, 75008 Paris', (SELECT id FROM municipality WHERE insee_code = '75108'),
   ST_SetSRID(ST_MakePoint(2.3100, 48.8740), 4326)::geography, false,
   (:'next_monday'::date + 6 - 21), '10:00', 90, 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=SU', NULL, NULL,
   'published', now() - interval '20 days', NULL, NULL),
  -- E06: running at dawn (ines), Paris 11e, hidden location.
  ('00000000-0000-7000-8000-000000000306', '00000000-0000-7000-8000-000000000009', NULL,
   (SELECT id FROM sport WHERE code = 'running'), 'Running at dawn',
   'Easy pace along the canal. Meet at the lock.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'expert'),
   false, 15, true, 'automatic', 'public', NULL, NULL,
   'Quai test, 75011 Paris', (SELECT id FROM municipality WHERE insee_code = '75111'),
   ST_SetSRID(ST_MakePoint(2.3800, 48.8600), 4326)::geography, true,
   (:'in_three_days'::date), '07:30', 45, 'Europe/Paris', NULL, NULL, NULL,
   'published', now() - interval '1 day', NULL, NULL),
  -- E07: weekly padel (bob), Lyon, Wednesdays 20:00, until the second Wednesday after next. Uses a venue.
  ('00000000-0000-7000-8000-000000000307', '00000000-0000-7000-8000-000000000002', NULL,
   (SELECT id FROM sport WHERE code = 'padel'), 'Padel weekly',
   'Doubles padel, equipment provided.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'expert'),
   false, 4, true, 'automatic', 'public', NULL, '00000000-0000-7000-8000-000000000701',
   'Centre padel test, 69003 Lyon', (SELECT id FROM municipality WHERE insee_code = '69383'),
   ST_SetSRID(ST_MakePoint(4.8400, 45.7550), 4326)::geography, false,
   (:'next_wednesday'::date), '20:00', 90, 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=WE',
   ((:'next_wednesday'::date + 13)::date), NULL,
   'published', now() - interval '10 days', NULL, NULL),
  -- E08: the same padel series after the split of E07, Wednesdays 19:30, from the day after E07 ends.
  ('00000000-0000-7000-8000-000000000308', '00000000-0000-7000-8000-000000000002', NULL,
   (SELECT id FROM sport WHERE code = 'padel'), 'Padel weekly (evening)',
   'Doubles padel, equipment provided.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'expert'),
   false, 4, true, 'automatic', 'public', NULL, '00000000-0000-7000-8000-000000000701',
   'Centre padel test, 69003 Lyon', (SELECT id FROM municipality WHERE insee_code = '69383'),
   ST_SetSRID(ST_MakePoint(4.8400, 45.7550), 4326)::geography, false,
   (:'next_wednesday'::date + 14), '19:30', 90, 'Europe/Paris', 'FREQ=WEEKLY;BYDAY=WE', NULL, NULL,
   'published', now() - interval '5 days', NULL, '00000000-0000-7000-8000-000000000307'),
  -- E09: draft one-off football (alice), not published.
  ('00000000-0000-7000-8000-000000000309', '00000000-0000-7000-8000-000000000001', NULL,
   (SELECT id FROM sport WHERE code = 'football'), 'Draft: Saturday five-a-side',
   'Not published yet.',
   (SELECT id FROM skill_level WHERE code = 'beginner'), (SELECT id FROM skill_level WHERE code = 'advanced'),
   false, 10, true, 'automatic', 'public', NULL, NULL,
   'Brouillon, 75008 Paris', (SELECT id FROM municipality WHERE insee_code = '75108'),
   ST_SetSRID(ST_MakePoint(2.3110, 48.8745), 4326)::geography, false,
   (:'in_fourteen_days'::date), '18:00', 90, 'Europe/Paris', NULL, NULL, NULL,
   'draft', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Co-organizers and target circles.
INSERT INTO event_circle (event_id, circle_id) VALUES
  ('00000000-0000-7000-8000-000000000305', '00000000-0000-7000-8000-000000000101')
ON CONFLICT DO NOTHING;

-- Occurrences. Original and effective starts are the same unless overridden.
-- 401: E01 next Monday, with a location override (still Paris 8e). 402: E01 the Monday after, cancelled.
-- 403: E02 tennis. 404: E03 chess. 405: E04 darts. 406: E06 running (hidden location).
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at, venue_id, address, municipality_id,
                              location, status, cancelled_at, cancelled_by_id, cancellation_reason) VALUES
  ('00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-000000000301',
   (:'next_monday'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   (:'next_monday'::date + time '19:00') AT TIME ZONE 'Europe/Paris',
   NULL, 'Terrain test (accès rue voisine), 75008 Paris',
   (SELECT id FROM municipality WHERE insee_code = '75108'),
   ST_SetSRID(ST_MakePoint(2.3125, 48.8755), 4326)::geography,
   'scheduled', NULL, NULL, NULL),
  ('00000000-0000-7000-8000-000000000402', '00000000-0000-7000-8000-000000000301',
   (:'next_monday'::date + 7 + time '19:00') AT TIME ZONE 'Europe/Paris',
   (:'next_monday'::date + 7 + time '19:00') AT TIME ZONE 'Europe/Paris',
   NULL, NULL, NULL, NULL,
   'cancelled', now() - interval '1 day', '00000000-0000-7000-8000-000000000001', 'Pitch unavailable'),
  ('00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000302',
   (:'in_five_days'::date + time '18:30') AT TIME ZONE 'Europe/Paris',
   (:'in_five_days'::date + time '18:30') AT TIME ZONE 'Europe/Paris',
   NULL, NULL, NULL, NULL, 'scheduled', NULL, NULL, NULL),
  ('00000000-0000-7000-8000-000000000404', '00000000-0000-7000-8000-000000000303',
   (:'in_seven_days'::date + time '20:00') AT TIME ZONE 'Europe/Paris',
   (:'in_seven_days'::date + time '20:00') AT TIME ZONE 'Europe/Paris',
   NULL, NULL, NULL, NULL, 'scheduled', NULL, NULL, NULL),
  ('00000000-0000-7000-8000-000000000405', '00000000-0000-7000-8000-000000000304',
   (:'in_ten_days'::date + time '21:00') AT TIME ZONE 'Europe/Paris',
   (:'in_ten_days'::date + time '21:00') AT TIME ZONE 'Europe/Paris',
   NULL, NULL, NULL, NULL, 'scheduled', NULL, NULL, NULL),
  ('00000000-0000-7000-8000-000000000406', '00000000-0000-7000-8000-000000000306',
   (:'in_three_days'::date + time '07:30') AT TIME ZONE 'Europe/Paris',
   (:'in_three_days'::date + time '07:30') AT TIME ZONE 'Europe/Paris',
   NULL, NULL, NULL, NULL, 'scheduled', NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Organizer registrations (BR-EVT-22): owners who play hold a confirmed place on every materialized occurrence.
INSERT INTO registration (id, occurrence_id, user_id, status, confirmed_at, created_at) VALUES
  ('00000000-0000-7000-8000-000000000501', '00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-000000000001', 'confirmed', now() - interval '5 days', now() - interval '5 days'),
  ('00000000-0000-7000-8000-000000000502', '00000000-0000-7000-8000-000000000401', '00000000-0000-7000-8000-000000000011', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-7000-8000-000000000503', '00000000-0000-7000-8000-000000000402', '00000000-0000-7000-8000-000000000001', 'confirmed', now() - interval '20 days', now() - interval '20 days'),
  -- E02: owner ines plus three confirmed players (full at 4). Bob and David are waitlisted, in that order.
  ('00000000-0000-7000-8000-000000000504', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000009', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-7000-8000-000000000505', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000001', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-7000-8000-000000000506', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000011', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-7000-8000-000000000507', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000012', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-7000-8000-000000000508', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000002', 'waitlisted', NULL, now() - interval '90 minutes'),
  ('00000000-0000-7000-8000-000000000509', '00000000-0000-7000-8000-000000000403', '00000000-0000-7000-8000-000000000004', 'waitlisted', NULL, now() - interval '60 minutes'),
  -- E03: owner bob confirmed, two approval requests pending.
  ('00000000-0000-7000-8000-00000000050a', '00000000-0000-7000-8000-000000000404', '00000000-0000-7000-8000-000000000002', 'confirmed', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-7000-8000-00000000050b', '00000000-0000-7000-8000-000000000404', '00000000-0000-7000-8000-000000000001', 'pending_approval', NULL, now() - interval '3 hours'),
  ('00000000-0000-7000-8000-00000000050c', '00000000-0000-7000-8000-000000000404', '00000000-0000-7000-8000-000000000009', 'pending_approval', NULL, now() - interval '2 hours'),
  -- E04: owner gina.
  ('00000000-0000-7000-8000-00000000050d', '00000000-0000-7000-8000-000000000405', '00000000-0000-7000-8000-000000000007', 'confirmed', now() - interval '3 days', now() - interval '3 days'),
  -- E06: owner ines.
  ('00000000-0000-7000-8000-00000000050e', '00000000-0000-7000-8000-000000000406', '00000000-0000-7000-8000-000000000009', 'confirmed', now() - interval '1 day', now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- Guests: karim brings two guests to the next Monday of E01 (BR-REG-05).
INSERT INTO registration_guest (id, registration_id, display_name) VALUES
  ('00000000-0000-7000-8000-000000000601', '00000000-0000-7000-8000-000000000502', 'Sami'),
  ('00000000-0000-7000-8000-000000000602', '00000000-0000-7000-8000-000000000502', 'Yanis')
ON CONFLICT (id) DO NOTHING;

COMMIT;
