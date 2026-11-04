-- Notifications (batch 2): tables, named constraints and indexes, comments, rejected rows, RESTRICT on types in use and
-- cascades on erasure (BR-NOT-01, BR-TECH-12, BR-GDP-04). Runs against teamdrop_test, inside one transaction that is
-- rolled back at the end.
BEGIN;
SELECT plan(17);

SELECT has_table('notification_type', 'table notification_type exists');
SELECT has_table('notification_preference', 'table notification_preference exists');
SELECT has_table('notification', 'table notification exists');
SELECT has_table('push_subscription', 'table push_subscription exists');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'notification_type'::regclass, 'notification_preference'::regclass, 'notification'::regclass,
      'push_subscription'::regclass)$$,
  ARRAY[
    'pk_notification_type', 'uq_notification_type_code',
    'pk_notification_preference', 'fk_notification_preference_user_id', 'fk_notification_preference_notification_type_id',
    'pk_notification', 'fk_notification_user_id', 'fk_notification_notification_type_id', 'ck_notification_payload_object',
    'pk_push_subscription', 'uq_push_subscription_endpoint', 'fk_push_subscription_user_id'
  ]::text[],
  'the notification tables have exactly their named constraints'
);
SELECT set_eq(
  $$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'ix_notification_preference_notification_type_id', 'ix_notification_user_id_id', 'ix_notification_unread',
      'ix_notification_created_at', 'ix_notification_notification_type_id', 'ix_push_subscription_user_id')$$,
  ARRAY['ix_notification_preference_notification_type_id', 'ix_notification_user_id_id', 'ix_notification_unread',
        'ix_notification_created_at', 'ix_notification_notification_type_id', 'ix_push_subscription_user_id']::text[],
  'all named notification indexes exist'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['notification_type', 'notification_preference', 'notification', 'push_subscription']) AS t(name)
    WHERE obj_description(t.name::regclass, 'pg_class') IS NULL
  ),
  'every notification table has a comment'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('notification_type'::regclass, 'notification_preference'::regclass,
                         'notification'::regclass, 'push_subscription'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  ),
  'every column of the notification tables has a comment'
);

-- Fixtures (rolled back at the end)
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-000000007000', '99070', 'Notifications test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-000000007001', 'notifications_a', '\x01'::bytea, '\x7071'::bytea, 'A', '\x01'::bytea, '00000000-0000-7000-8000-000000007000'),
  ('00000000-0000-7000-8000-000000007002', 'notifications_b', '\x02'::bytea, '\x7072'::bytea, 'B', '\x02'::bytea, '00000000-0000-7000-8000-000000007000');
INSERT INTO notification_type (id, code, name, default_push, default_in_app) VALUES
  ('00000000-0000-7000-8000-000000007010', 'test_used', 'Used test type', true, true),
  ('00000000-0000-7000-8000-000000007011', 'test_unused', 'Unused test type', false, true);

SELECT throws_ok(
  $$INSERT INTO notification_type (code, name, default_push, default_in_app) VALUES ('test_used', 'Again', true, true)$$,
  '23505', 'duplicate key value violates unique constraint "uq_notification_type_code"',
  'BR-TECH-12: notification type codes are unique');

INSERT INTO notification (id, user_id, notification_type_id, payload) VALUES
  ('00000000-0000-7000-8000-000000007020', '00000000-0000-7000-8000-000000007001',
   '00000000-0000-7000-8000-000000007010', '{"eventId": "x"}');
SELECT throws_ok(
  $$INSERT INTO notification (user_id, notification_type_id, payload) VALUES
    ('00000000-0000-7000-8000-000000007001', '00000000-0000-7000-8000-000000007010', '[1, 2]')$$,
  '23514', 'new row for relation "notification" violates check constraint "ck_notification_payload_object"',
  'a notification payload must be a JSON object');
SELECT is(
  (SELECT read_at FROM notification WHERE id = '00000000-0000-7000-8000-000000007020'), NULL,
  'BR-NOT-01: a new notification is unread');

-- A type in use cannot be deleted (RESTRICT); an unused one can
SELECT throws_ok(
  $$DELETE FROM notification_type WHERE id = '00000000-0000-7000-8000-000000007010'$$,
  '23001', NULL, 'a notification type used by notifications cannot be deleted (RESTRICT)');
INSERT INTO notification_preference (user_id, notification_type_id, push_enabled, in_app_enabled) VALUES
  ('00000000-0000-7000-8000-000000007002', '00000000-0000-7000-8000-000000007011', false, false);
SELECT throws_ok(
  $$DELETE FROM notification_type WHERE id = '00000000-0000-7000-8000-000000007011'$$,
  '23001', NULL, 'a notification type used by preferences cannot be deleted (RESTRICT)');
DELETE FROM notification_preference WHERE notification_type_id = '00000000-0000-7000-8000-000000007011';
SELECT lives_ok(
  $$DELETE FROM notification_type WHERE id = '00000000-0000-7000-8000-000000007011'$$,
  'an unused notification type can be deleted');

-- One subscription per device (BR-NOT-01)
INSERT INTO push_subscription (user_id, endpoint, p256dh, auth_secret) VALUES
  ('00000000-0000-7000-8000-000000007001', 'https://push.test/device-1', 'key', 'secret');
SELECT throws_ok(
  $$INSERT INTO push_subscription (user_id, endpoint, p256dh, auth_secret) VALUES
    ('00000000-0000-7000-8000-000000007002', 'https://push.test/device-1', 'key2', 'secret2')$$,
  '23505', 'duplicate key value violates unique constraint "uq_push_subscription_endpoint"',
  'BR-NOT-01: one push subscription per device (endpoint)');

-- Erasure deletes the user's notifications, preferences and subscriptions (BR-GDP-04)
INSERT INTO notification_preference (user_id, notification_type_id, push_enabled, in_app_enabled) VALUES
  ('00000000-0000-7000-8000-000000007001', '00000000-0000-7000-8000-000000007010', false, true);
DELETE FROM user_account WHERE id = '00000000-0000-7000-8000-000000007001';
SELECT is(
  (SELECT count(*)::int FROM notification WHERE user_id = '00000000-0000-7000-8000-000000007001')
  + (SELECT count(*)::int FROM notification_preference WHERE user_id = '00000000-0000-7000-8000-000000007001')
  + (SELECT count(*)::int FROM push_subscription WHERE user_id = '00000000-0000-7000-8000-000000007001'),
  0, 'BR-GDP-04: notifications, preferences and push subscriptions of an erased user are deleted');
SELECT lives_ok(
  $$DELETE FROM notification_type WHERE id = '00000000-0000-7000-8000-000000007010'$$,
  'a type is deletable again once its notifications are gone');

SELECT * FROM finish();
ROLLBACK;
