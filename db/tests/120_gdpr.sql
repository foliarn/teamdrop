-- GDPR (batch 6): tables, enums, named constraints, comments, append-only consents, the export and erasure functions
-- and the retention job (BR-GDP-01 to BR-GDP-09, BR-MSG-05). Runs against teamdrop_test, rolled back at the end.
BEGIN;
SELECT plan(16);

SELECT has_table('policy_version', 'table policy_version exists');
SELECT has_table('consent_purpose', 'table consent_purpose exists');
SELECT has_table('user_consent', 'table user_consent exists');
SELECT has_table('data_export_request', 'table data_export_request exists');
SELECT enum_has_labels('export_status', ARRAY['pending', 'processing', 'ready', 'failed', 'expired'],
  'export_status has its labels');
SELECT set_eq(
  $$SELECT conname::text FROM pg_constraint WHERE contype <> 'n' AND conrelid IN (
      'policy_version'::regclass, 'consent_purpose'::regclass, 'user_consent'::regclass,
      'data_export_request'::regclass)$$,
  ARRAY[
    'pk_policy_version', 'uq_policy_version_document_version',
    'pk_consent_purpose', 'uq_consent_purpose_code',
    'pk_user_consent', 'fk_user_consent_user_id', 'fk_user_consent_consent_purpose_id', 'fk_user_consent_policy_version_id',
    'pk_data_export_request', 'fk_data_export_request_user_id', 'ck_data_export_request_ready'
  ]::text[],
  'the GDPR tables have exactly their named constraints'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    LEFT JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE a.attrelid IN ('policy_version'::regclass, 'consent_purpose'::regclass, 'user_consent'::regclass,
                         'data_export_request'::regclass)
      AND a.attnum > 0 AND NOT a.attisdropped AND d.description IS NULL
  ),
  'every column of the GDPR tables has a comment'
);
SELECT ok(NOT has_table_privilege('teamdrop_app', 'user_consent', 'UPDATE')
          AND NOT has_table_privilege('teamdrop_app', 'user_consent', 'DELETE')
          AND has_table_privilege('teamdrop_app', 'user_consent', 'INSERT'),
  'BR-GDP-01: user_consent is append-only for the application role');
SELECT col_is_null('event', 'owner_id', 'BR-GDP-04: an event can lose its owner on erasure');

-- Fixtures
INSERT INTO municipality (id, insee_code, name, department_code, population, center) VALUES
  ('00000000-0000-7000-8000-00000000c000', '99120', 'GDPR test city', '99', 1000,
   ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)::geography);
INSERT INTO user_account (id, username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id) VALUES
  ('00000000-0000-7000-8000-00000000c001', 'gdpr_a', pgp_sym_encrypt('a@gdpr.test', 'k'), '\xc0c1'::bytea, 'A',
   pgp_sym_encrypt('1990-01-01', 'k'), '00000000-0000-7000-8000-00000000c000');
INSERT INTO user_setting (user_id) VALUES ('00000000-0000-7000-8000-00000000c001');
INSERT INTO consent_purpose (id, code, name, is_required) VALUES
  ('00000000-0000-7000-8000-00000000c010', 'test_purpose', 'Test purpose', false);

SELECT throws_ok(
  $$INSERT INTO data_export_request (user_id, status) VALUES ('00000000-0000-7000-8000-00000000c001', 'ready')$$,
  '23514', NULL, 'BR-GDP-07: a ready export has its file, completion and expiry');
INSERT INTO data_export_request (user_id) VALUES ('00000000-0000-7000-8000-00000000c001');
SELECT throws_ok(
  $$INSERT INTO data_export_request (user_id) VALUES ('00000000-0000-7000-8000-00000000c001')$$,
  '23505', NULL, 'BR-GDP-07: one pending export per user');

SELECT is(
  (export_user_data('00000000-0000-7000-8000-00000000c001', 'k') -> 'account' ->> 'email'), 'a@gdpr.test',
  'BR-GDP-07: the export decrypts the email with the key given');

INSERT INTO user_consent (user_id, consent_purpose_id, granted) VALUES
  ('00000000-0000-7000-8000-00000000c001', '00000000-0000-7000-8000-00000000c010', true);
UPDATE user_account SET deletion_requested_at = now() - interval '31 days' WHERE id = '00000000-0000-7000-8000-00000000c001';
SELECT erase_user_account('00000000-0000-7000-8000-00000000c001');
SELECT is((SELECT count(*)::int FROM user_account WHERE id = '00000000-0000-7000-8000-00000000c001'), 0,
  'BR-GDP-04: the erasure deletes the account');
SELECT is(
  (SELECT count(*)::int FROM user_consent
   WHERE user_id IS NULL AND consent_purpose_id = '00000000-0000-7000-8000-00000000c010'),
  2, 'BR-GDP-09: the consent history is kept without the identity, with a final withdrawal');

UPDATE user_consent SET created_at = now() - interval '4 years'
WHERE user_id IS NULL AND consent_purpose_id = '00000000-0000-7000-8000-00000000c010';
SELECT ok((run_gdpr_jobs() ->> 'consents')::int >= 2, 'BR-GDP-09: consent history of erased accounts goes after 3 years');
SELECT is((SELECT count(*)::int FROM user_consent WHERE consent_purpose_id = '00000000-0000-7000-8000-00000000c010'), 0,
  'the old anonymous consents are gone');

SELECT * FROM finish();
ROLLBACK;
