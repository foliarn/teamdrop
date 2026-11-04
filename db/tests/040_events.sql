-- Events, occurrences, venues, registrations and guests (batch 1C): tables, named constraints, rejected rows and
-- cascades. Runs against teamdrop_test, inside one transaction that is rolled back at the end.
BEGIN;
SELECT plan(48);

-- Tables
SELECT has_table('venue', 'table venue exists');
SELECT has_table('event', 'table event exists');
SELECT has_table('event_co_organizer', 'table event_co_organizer exists');
SELECT has_table('event_circle', 'table event_circle exists');
SELECT has_table('event_occurrence', 'table event_occurrence exists');
SELECT has_table('registration', 'table registration exists');
SELECT has_table('registration_guest', 'table registration_guest exists');

-- Enums
SELECT enum_has_labels('registration_mode', ARRAY['automatic', 'approval'], 'registration_mode has its labels');
SELECT enum_has_labels('event_visibility', ARRAY['public', 'circle_priority', 'circle_only', 'community_only'], 'event_visibility has its labels');
SELECT enum_has_labels('event_status', ARRAY['draft', 'published', 'cancelled'], 'event_status has its labels');
SELECT enum_has_labels('occurrence_status', ARRAY['scheduled', 'ongoing', 'completed', 'cancelled'], 'occurrence_status has its labels');
SELECT enum_has_labels('registration_status', ARRAY['pending_approval', 'confirmed', 'waitlisted', 'declined', 'cancelled', 'removed'], 'registration_status has its labels');
SELECT enum_has_labels('attendance_status', ARRAY['attended', 'no_show', 'excused'], 'attendance_status has its labels');

-- Named constraints and indexes exist
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE conname IN (
      'pk_venue', 'fk_venue_municipality_id', 'fk_venue_created_by_id',
      'pk_event', 'fk_event_owner_id', 'fk_event_community_id', 'fk_event_sport_id',
      'fk_event_skill_level_min_id', 'fk_event_skill_level_max_id', 'fk_event_venue_id',
      'fk_event_municipality_id', 'fk_event_split_from_event_id',
      'ck_event_max_participants', 'ck_event_min_participants', 'ck_event_duration_positive',
      'ck_event_circle_priority_hours', 'ck_event_community_only_requires_community',
      'ck_event_recurrence_end', 'ck_event_recurrence_fields', 'ck_event_recurrence_count_positive',
      'ck_event_published_at',
      'pk_event_co_organizer', 'fk_event_co_organizer_event_id', 'fk_event_co_organizer_user_id',
      'pk_event_circle', 'fk_event_circle_event_id', 'fk_event_circle_circle_id',
      'pk_event_occurrence', 'uq_event_occurrence_event_original', 'fk_event_occurrence_event_id',
      'fk_event_occurrence_venue_id', 'fk_event_occurrence_municipality_id', 'fk_event_occurrence_cancelled_by_id',
      'ck_event_occurrence_duration_positive', 'ck_event_occurrence_max_participants',
      'pk_registration', 'fk_registration_occurrence_id', 'fk_registration_user_id',
      'fk_registration_attendance_set_by_id', 'ck_registration_attendance_requires_confirmed',
      'pk_registration_guest', 'fk_registration_guest_registration_id')$$,
  ARRAY[
    'pk_venue', 'fk_venue_municipality_id', 'fk_venue_created_by_id',
    'pk_event', 'fk_event_owner_id', 'fk_event_community_id', 'fk_event_sport_id',
    'fk_event_skill_level_min_id', 'fk_event_skill_level_max_id', 'fk_event_venue_id',
    'fk_event_municipality_id', 'fk_event_split_from_event_id',
    'ck_event_max_participants', 'ck_event_min_participants', 'ck_event_duration_positive',
    'ck_event_circle_priority_hours', 'ck_event_community_only_requires_community',
    'ck_event_recurrence_end', 'ck_event_recurrence_fields', 'ck_event_recurrence_count_positive',
    'ck_event_published_at',
    'pk_event_co_organizer', 'fk_event_co_organizer_event_id', 'fk_event_co_organizer_user_id',
    'pk_event_circle', 'fk_event_circle_event_id', 'fk_event_circle_circle_id',
    'pk_event_occurrence', 'uq_event_occurrence_event_original', 'fk_event_occurrence_event_id',
    'fk_event_occurrence_venue_id', 'fk_event_occurrence_municipality_id', 'fk_event_occurrence_cancelled_by_id',
    'ck_event_occurrence_duration_positive', 'ck_event_occurrence_max_participants',
    'pk_registration', 'fk_registration_occurrence_id', 'fk_registration_user_id',
    'fk_registration_attendance_set_by_id', 'ck_registration_attendance_requires_confirmed',
    'pk_registration_guest', 'fk_registration_guest_registration_id'
  ]::text[],
  'all named event constraints exist'
);

SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_venue_location', 'ix_venue_name_trgm', 'ix_event_location', 'ix_event_title_trgm',
      'ix_event_published', 'ix_event_co_organizer_user_id', 'ix_event_circle_circle_id',
      'ix_event_occurrence_starts_at', 'ix_event_occurrence_location',
      'uq_registration_active', 'ix_registration_user_id', 'ix_registration_occurrence_status_created',
      'ix_registration_guest_registration_id', 'ix_circle_invitation_circle_id',
      'ix_community_join_request_community_id')$$,
  ARRAY[
    'ix_venue_location', 'ix_venue_name_trgm', 'ix_event_location', 'ix_event_title_trgm',
    'ix_event_published', 'ix_event_co_organizer_user_id', 'ix_event_circle_circle_id',
    'ix_event_occurrence_starts_at', 'ix_event_occurrence_location',
    'uq_registration_active', 'ix_registration_user_id', 'ix_registration_occurrence_status_created',
    'ix_registration_guest_registration_id', 'ix_circle_invitation_circle_id',
    'ix_community_join_request_community_id'
  ]::text[],
  'all named event and social-index indexes exist'
);

-- Fixtures for the rows below (inside the transaction, rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-0000000000e0', '99040', 'Events test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-0000000000e1', 'events_owner', '\x01'::bytea, '\x41'::bytea, 'Owner', '\x01'::bytea, '00000000-0000-7000-8000-0000000000e0'),
  ('00000000-0000-7000-8000-0000000000e2', 'events_guest', '\x02'::bytea, '\x42'::bytea, 'Guest', '\x02'::bytea, '00000000-0000-7000-8000-0000000000e0');
INSERT INTO sport (id, code, name, is_team_sport, environment, default_duration_minutes) VALUES
  ('00000000-0000-7000-8000-0000000000f0', 'events_test_sport', 'Events test sport', true, 'outdoor', 60);
INSERT INTO skill_level (id, code, name, rank) VALUES
  ('00000000-0000-7000-8000-0000000000f1', 'events_min', 'Minimum test level', 1),
  ('00000000-0000-7000-8000-0000000000f2', 'events_max', 'Maximum test level', 2);
INSERT INTO community (id, name, join_policy) VALUES
  ('00000000-0000-7000-8000-0000000002e1', 'Events test community', 'open');
INSERT INTO venue (id, name, address, municipality_id, location) VALUES
  ('00000000-0000-7000-8000-0000000007e1', 'Events test venue', 'Venue test address',
   '00000000-0000-7000-8000-0000000000e0', ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);

-- A valid draft one-off event, used as the base of the rejected rows below.
INSERT INTO event (id, owner_id, sport_id, title, skill_level_min_id, skill_level_max_id, max_participants,
                   address, municipality_id, location, start_date, start_time, duration_minutes) VALUES
  ('00000000-0000-7000-8000-0000000003e1', '00000000-0000-7000-8000-0000000000e1',
   '00000000-0000-7000-8000-0000000000f0', 'Base event', '00000000-0000-7000-8000-0000000000f1',
   '00000000-0000-7000-8000-0000000000f2', 10, 'Base address',
   '00000000-0000-7000-8000-0000000000e0', ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography,
   '2030-01-10', '18:00', 90);

-- Defaults (BR-EVT-01, BR-EVT-23, BR-REG-03, BR-EVT-21)
SELECT is((SELECT status::text FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), 'draft',
  'event.status defaults to draft (BR-EVT-24)');
SELECT is((SELECT time_zone FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), 'Europe/Paris',
  'event.time_zone defaults to Europe/Paris (BR-TECH-05)');
SELECT is((SELECT registration_mode::text FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), 'automatic',
  'event.registration_mode defaults to automatic (BR-REG-03)');
SELECT is((SELECT owner_counts_toward_capacity FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), true,
  'event.owner_counts_toward_capacity defaults to true (BR-EVT-21)');

-- Event CHECK constraints reject bad rows (23514)
SELECT throws_ok(
  $$UPDATE event SET max_participants = 0 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_max_participants"',
  'ck_event_max_participants rejects a capacity below 1 (BR-EVT-01)');
SELECT throws_ok(
  $$UPDATE event SET min_participants = 11 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_min_participants"',
  'ck_event_min_participants rejects a minimum above the maximum (BR-EVT-01)');
SELECT throws_ok(
  $$UPDATE event SET duration_minutes = 0 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_duration_positive"',
  'ck_event_duration_positive rejects a zero duration (BR-EVT-01)');
SELECT throws_ok(
  $$UPDATE event SET visibility = 'circle_priority' WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_circle_priority_hours"',
  'ck_event_circle_priority_hours requires a delay for circle_priority (BR-EVT-23)');
SELECT throws_ok(
  $$UPDATE event SET circle_priority_hours = 24 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_circle_priority_hours"',
  'ck_event_circle_priority_hours refuses a delay on a public event (BR-EVT-23)');
SELECT throws_ok(
  $$UPDATE event SET visibility = 'community_only' WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_community_only_requires_community"',
  'ck_event_community_only_requires_community needs a community (BR-EVT-23)');
SELECT throws_ok(
  $$UPDATE event SET recurrence_rule = 'FREQ=WEEKLY', recurrence_until = '2030-06-01', recurrence_count = 5 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_recurrence_end"',
  'ck_event_recurrence_end refuses both an end date and a count (BR-EVT-02)');
SELECT throws_ok(
  $$UPDATE event SET recurrence_until = '2030-06-01' WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_recurrence_fields"',
  'ck_event_recurrence_fields refuses an end without a rule (BR-EVT-02)');
SELECT throws_ok(
  $$UPDATE event SET recurrence_rule = 'FREQ=WEEKLY', recurrence_count = 0 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_recurrence_count_positive"',
  'ck_event_recurrence_count_positive refuses a zero count (BR-EVT-02)');
SELECT throws_ok(
  $$UPDATE event SET status = 'published' WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  '23514', 'new row for relation "event" violates check constraint "ck_event_published_at"',
  'ck_event_published_at refuses a published event without a publication date (BR-EVT-24)');

-- Valid variants of the same checks are accepted
SELECT lives_ok(
  $$UPDATE event SET visibility = 'circle_priority', circle_priority_hours = 24 WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  'a circle_priority event with a delay is accepted (BR-EVT-23)');
SELECT lives_ok(
  $$UPDATE event SET visibility = 'community_only', community_id = '00000000-0000-7000-8000-0000000002e1', circle_priority_hours = NULL WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  'a community_only event with its community is accepted (BR-EVT-23)');
SELECT lives_ok(
  $$UPDATE event SET visibility = 'public', community_id = NULL, recurrence_rule = 'FREQ=WEEKLY;BYDAY=MO', recurrence_until = '2030-06-01' WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  'a weekly series with an end date is accepted (BR-EVT-02)');
SELECT lives_ok(
  $$UPDATE event SET status = 'published', published_at = now() WHERE id = '00000000-0000-7000-8000-0000000003e1'$$,
  'a published event with its publication date is accepted (BR-EVT-24)');
UPDATE event SET recurrence_rule = NULL, recurrence_until = NULL WHERE id = '00000000-0000-7000-8000-0000000003e1';

-- Occurrence CHECK constraints (23514)
SELECT throws_ok(
  $$INSERT INTO event_occurrence (event_id, original_starts_at, starts_at, duration_minutes)
    VALUES ('00000000-0000-7000-8000-0000000003e1', '2030-01-10 17:00+00', '2030-01-10 17:00+00', 0)$$,
  '23514', 'new row for relation "event_occurrence" violates check constraint "ck_event_occurrence_duration_positive"',
  'ck_event_occurrence_duration_positive rejects a zero override duration (BR-EVT-04)');
SELECT throws_ok(
  $$INSERT INTO event_occurrence (event_id, original_starts_at, starts_at, max_participants)
    VALUES ('00000000-0000-7000-8000-0000000003e1', '2030-01-10 17:00+00', '2030-01-10 17:00+00', 0)$$,
  '23514', 'new row for relation "event_occurrence" violates check constraint "ck_event_occurrence_max_participants"',
  'ck_event_occurrence_max_participants rejects a zero override capacity (BR-EVT-04)');

-- One occurrence per event and original start (BR-EVT-04)
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at) VALUES
  ('00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000003e1', '2030-01-10 17:00+00', '2030-01-10 17:00+00');
SELECT throws_ok(
  $$INSERT INTO event_occurrence (event_id, original_starts_at, starts_at) VALUES
    ('00000000-0000-7000-8000-0000000003e1', '2030-01-10 17:00+00', '2030-01-10 18:00+00')$$,
  '23505', 'duplicate key value violates unique constraint "uq_event_occurrence_event_original"',
  'uq_event_occurrence_event_original rejects a second row for the same original start (BR-EVT-04)');

-- Registrations: one active registration per user and occurrence (BR-REG-02)
INSERT INTO registration (id, occurrence_id, user_id, status) VALUES
  ('00000000-0000-7000-8000-0000000005e1', '00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000000e2', 'pending_approval');
SELECT throws_ok(
  $$INSERT INTO registration (occurrence_id, user_id, status) VALUES
    ('00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000000e2', 'waitlisted')$$,
  '23505', 'duplicate key value violates unique constraint "uq_registration_active"',
  'uq_registration_active rejects a second active registration (BR-REG-02)');
UPDATE registration SET status = 'cancelled' WHERE id = '00000000-0000-7000-8000-0000000005e1';
SELECT lives_ok(
  $$INSERT INTO registration (occurrence_id, user_id, status) VALUES
    ('00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000000e2', 'confirmed')$$,
  'a new active registration is allowed after a cancellation (BR-REG-02)');
SELECT lives_ok(
  $$INSERT INTO registration (occurrence_id, user_id, status) VALUES
    ('00000000-0000-7000-8000-0000000004e1', NULL, 'confirmed'),
    ('00000000-0000-7000-8000-0000000004e1', NULL, 'confirmed')$$,
  'erased registrations (user_id NULL) do not count for the uniqueness rule (BR-GDP-04)');

-- Attendance only on confirmed registrations (BR-ATT-03)
SELECT throws_ok(
  $$UPDATE registration SET attendance = 'attended' WHERE id = '00000000-0000-7000-8000-0000000005e1'$$,
  '23514', 'new row for relation "registration" violates check constraint "ck_registration_attendance_requires_confirmed"',
  'ck_registration_attendance_requires_confirmed rejects attendance on a non-confirmed registration (BR-ATT-03)');

-- Guests and cascades (BR-REG-05)
INSERT INTO registration (id, occurrence_id, user_id, status) VALUES
  ('00000000-0000-7000-8000-0000000005e2', '00000000-0000-7000-8000-0000000004e1', '00000000-0000-7000-8000-0000000000e1', 'confirmed');
INSERT INTO registration_guest (id, registration_id, display_name) VALUES
  ('00000000-0000-7000-8000-0000000006e1', '00000000-0000-7000-8000-0000000005e2', 'Guest one');
SELECT lives_ok(
  $$INSERT INTO registration_guest (registration_id, display_name) VALUES ('00000000-0000-7000-8000-0000000005e2', NULL)$$,
  'a guest name may be NULL after erasure (BR-REG-05)');
DELETE FROM event_occurrence WHERE id = '00000000-0000-7000-8000-0000000004e1';
SELECT is(
  (SELECT count(*)::int FROM registration WHERE occurrence_id = '00000000-0000-7000-8000-0000000004e1'), 0,
  'deleting an occurrence deletes its registrations (CASCADE)');
SELECT is(
  (SELECT count(*)::int FROM registration_guest WHERE registration_id = '00000000-0000-7000-8000-0000000005e2'), 0,
  'deleting an occurrence deletes the guests of its registrations (CASCADE)');

-- Erasure: a deleted user keeps the registration row with a NULL user (BR-GDP-04)
INSERT INTO event_occurrence (id, event_id, original_starts_at, starts_at) VALUES
  ('00000000-0000-7000-8000-0000000004e2', '00000000-0000-7000-8000-0000000003e1', '2030-01-17 17:00+00', '2030-01-17 17:00+00');
INSERT INTO registration (id, occurrence_id, user_id, status) VALUES
  ('00000000-0000-7000-8000-0000000005e3', '00000000-0000-7000-8000-0000000004e2', '00000000-0000-7000-8000-0000000000e2', 'confirmed');
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-0000000000e2';
SELECT is(
  (SELECT user_id FROM registration WHERE id = '00000000-0000-7000-8000-0000000005e3'), NULL,
  'deleting a user sets registration.user_id to NULL and keeps the row (BR-GDP-04)');

-- Venues: deleting a venue keeps the event with its copied address (BR-EVT-08)
UPDATE event SET venue_id = '00000000-0000-7000-8000-0000000007e1' WHERE id = '00000000-0000-7000-8000-0000000003e1';
DELETE FROM venue WHERE id = '00000000-0000-7000-8000-0000000007e1';
SELECT is(
  (SELECT venue_id FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), NULL,
  'deleting a venue sets event.venue_id to NULL (ON DELETE SET NULL, BR-EVT-08)');
SELECT is(
  (SELECT address FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1'), 'Base address',
  'the event keeps its own address after the venue is deleted (BR-EVT-08)');

-- Cascade: deleting an event deletes its occurrences and co-organizers (BR-EVT-05 structure)
INSERT INTO event_co_organizer (event_id, user_id, counts_toward_capacity, added_at) VALUES
  ('00000000-0000-7000-8000-0000000003e1', '00000000-0000-7000-8000-0000000000e1', true, now());
DELETE FROM event WHERE id = '00000000-0000-7000-8000-0000000003e1';
SELECT is(
  (SELECT count(*)::int FROM event_occurrence WHERE event_id = '00000000-0000-7000-8000-0000000003e1'), 0,
  'deleting an event deletes its occurrences (CASCADE)');
SELECT is(
  (SELECT count(*)::int FROM event_co_organizer WHERE event_id = '00000000-0000-7000-8000-0000000003e1'), 0,
  'deleting an event deletes its co-organizers (CASCADE)');

SELECT * FROM finish();
ROLLBACK;
