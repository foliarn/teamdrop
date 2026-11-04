-- migrate:up
-- GDPR (batch 6): versioned policies, consent purposes and append-only consents, data export requests, the export and
-- erasure functions, and the retention jobs (BR-GDP-01 to BR-GDP-10, BR-MSG-05).
-- Scheduling: run_gdpr_jobs() nightly with pg_cron (db/scripts/schedule-jobs.sh). The erasure of due accounts is run by
-- the developers through GdprRepository.eraseDueAccounts, because it frees spots and cancels sessions whose users must be
-- notified; export files live on the server disk, so their deletion is also the developers' job.

CREATE TYPE policy_document AS ENUM ('terms_of_service', 'privacy_policy');
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'ready', 'failed', 'expired');

-- ---------------------------------------------------------------------------
-- event.owner_id: an erased owner without a co-organizer leaves the event without owner (BR-GDP-04)
-- ---------------------------------------------------------------------------
-- Past sessions must survive for the other participants' statistics (BR-GDP-05). The FK stays RESTRICT: the erasure
-- transfers the events or sets the owner to NULL explicitly before deleting the account.
ALTER TABLE event ALTER COLUMN owner_id DROP NOT NULL;
COMMENT ON COLUMN event.owner_id IS 'The single owner, who can transfer ownership (BR-EVT-20). On erasure the event goes to the oldest co-organizer; without one the owner becomes NULL and the event is cancelled (BR-GDP-04).';

-- ---------------------------------------------------------------------------
-- policy_version
-- ---------------------------------------------------------------------------
CREATE TABLE policy_version (
  id uuid NOT NULL DEFAULT uuidv7(),
  document policy_document NOT NULL,
  version text NOT NULL,
  url text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_policy_version PRIMARY KEY (id),
  CONSTRAINT uq_policy_version_document_version UNIQUE (document, version)
);

CREATE INDEX ix_policy_version_current ON policy_version (document, published_at DESC);

COMMENT ON TABLE policy_version IS 'Published versions of the terms of service and the privacy policy (BR-GDP-01).';
COMMENT ON COLUMN policy_version.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN policy_version.document IS 'terms_of_service or privacy_policy.';
COMMENT ON COLUMN policy_version.version IS 'Version label, unique per document (for example 2026-11).';
COMMENT ON COLUMN policy_version.url IS 'Where the text of this version is published.';
COMMENT ON COLUMN policy_version.published_at IS 'When it took effect; the latest published version of a document is the current one.';

-- ---------------------------------------------------------------------------
-- consent_purpose (reference)
-- ---------------------------------------------------------------------------
CREATE TABLE consent_purpose (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  is_required boolean NOT NULL,
  CONSTRAINT pk_consent_purpose PRIMARY KEY (id),
  CONSTRAINT uq_consent_purpose_code UNIQUE (code)
);

COMMENT ON TABLE consent_purpose IS 'Reference list of consent purposes (BR-GDP-01, BR-TECH-12).';
COMMENT ON COLUMN consent_purpose.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN consent_purpose.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';
COMMENT ON COLUMN consent_purpose.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';
COMMENT ON COLUMN consent_purpose.is_required IS 'True when the app cannot be used without it (terms of service, privacy policy).';

-- ---------------------------------------------------------------------------
-- user_consent (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE user_consent (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NULL,
  consent_purpose_id uuid NOT NULL,
  policy_version_id uuid NULL,
  granted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_consent PRIMARY KEY (id),
  CONSTRAINT fk_user_consent_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_user_consent_consent_purpose_id FOREIGN KEY (consent_purpose_id)
    REFERENCES consent_purpose (id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_consent_policy_version_id FOREIGN KEY (policy_version_id)
    REFERENCES policy_version (id) ON DELETE RESTRICT
);

CREATE INDEX ix_user_consent_user_purpose ON user_consent (user_id, consent_purpose_id, id DESC);
CREATE INDEX ix_user_consent_consent_purpose_id ON user_consent (consent_purpose_id);
CREATE INDEX ix_user_consent_policy_version_id ON user_consent (policy_version_id);
CREATE INDEX ix_user_consent_anonymous ON user_consent (created_at) WHERE user_id IS NULL;

-- Append-only (BR-GDP-01): the application role can only add rows. The FK action and the retention job (owner) still
-- update and delete.
REVOKE UPDATE, DELETE ON user_consent FROM teamdrop_app;

COMMENT ON TABLE user_consent IS 'Append-only history of consent grants and withdrawals (BR-GDP-01). Kept for the account lifetime plus 3 years (BR-GDP-09).';
COMMENT ON COLUMN user_consent.id IS 'Primary key, UUID v7 (time-ordered: the latest row per purpose is the current state).';
COMMENT ON COLUMN user_consent.user_id IS 'The user; NULL after erasure, the history is kept 3 more years (BR-GDP-09).';
COMMENT ON COLUMN user_consent.consent_purpose_id IS 'The purpose.';
COMMENT ON COLUMN user_consent.policy_version_id IS 'Policy version accepted, for the terms of service and the privacy policy.';
COMMENT ON COLUMN user_consent.granted IS 'True for a grant, false for a withdrawal. Erasure appends a withdrawal of every purpose.';
COMMENT ON COLUMN user_consent.created_at IS 'When the user granted or withdrew it.';

-- ---------------------------------------------------------------------------
-- data_export_request
-- ---------------------------------------------------------------------------
CREATE TABLE data_export_request (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  status export_status NOT NULL DEFAULT 'pending',
  file_path text NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  expires_at timestamptz NULL,
  CONSTRAINT pk_data_export_request PRIMARY KEY (id),
  CONSTRAINT fk_data_export_request_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT ck_data_export_request_ready CHECK (
    status <> 'ready' OR (file_path IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_data_export_request_active ON data_export_request (user_id)
  WHERE status IN ('pending', 'processing');
CREATE INDEX ix_data_export_request_queue ON data_export_request (requested_at) WHERE status = 'pending';
CREATE INDEX ix_data_export_request_expiry ON data_export_request (expires_at) WHERE status = 'ready';

COMMENT ON TABLE data_export_request IS 'A request to export all of a user''s data as JSON, built asynchronously (BR-GDP-07).';
COMMENT ON COLUMN data_export_request.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN data_export_request.user_id IS 'The user; requests and files go with the account.';
COMMENT ON COLUMN data_export_request.status IS 'pending, processing, ready, failed or expired. One pending or processing request per user.';
COMMENT ON COLUMN data_export_request.file_path IS 'Path of the JSON file on the server disk; NULL once deleted.';
COMMENT ON COLUMN data_export_request.requested_at IS 'When the user asked.';
COMMENT ON COLUMN data_export_request.completed_at IS 'When the file was ready.';
COMMENT ON COLUMN data_export_request.expires_at IS 'End of the download link, 7 days after completion (BR-GDP-07, BR-GDP-09).';

-- ---------------------------------------------------------------------------
-- export_user_data (BR-GDP-07)
-- ---------------------------------------------------------------------------
CREATE FUNCTION export_user_data(p_user_id uuid, p_encryption_key text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'exportedAt', now(),
    'account', (
      SELECT jsonb_build_object(
        'id', u.id, 'username', u.username,
        'email', pgp_sym_decrypt(u.email_ciphertext, p_encryption_key),
        'emailVerifiedAt', u.email_verified_at, 'firstName', u.first_name,
        'birthDate', pgp_sym_decrypt(u.birth_date_ciphertext, p_encryption_key),
        'gender', u.gender, 'municipality', m.name, 'avatarPath', u.avatar_path, 'role', u.role,
        'createdAt', u.created_at, 'lastActiveAt', u.last_active_at,
        'deletionRequestedAt', u.deletion_requested_at)
      FROM user_account u JOIN municipality m ON m.id = u.municipality_id WHERE u.id = p_user_id),
    'loginMethods', (SELECT COALESCE(jsonb_agg(jsonb_build_object('provider', ai.provider, 'createdAt', ai.created_at)), '[]')
      FROM auth_identity ai WHERE ai.user_id = p_user_id),
    'settings', (SELECT to_jsonb(s) - 'user_id' FROM user_setting s WHERE s.user_id = p_user_id),
    'sports', (SELECT COALESCE(jsonb_agg(jsonb_build_object('sport', sp.code, 'level', sl.code)), '[]')
      FROM user_sport us JOIN sport sp ON sp.id = us.sport_id JOIN skill_level sl ON sl.id = us.skill_level_id
      WHERE us.user_id = p_user_id),
    'ratings', (SELECT COALESCE(jsonb_agg(jsonb_build_object('system', rs.code, 'numericValue', ur.numeric_value,
        'grade', rg.code)), '[]')
      FROM user_rating ur JOIN rating_system rs ON rs.id = ur.rating_system_id
      LEFT JOIN rating_grade rg ON rg.id = ur.rating_grade_id WHERE ur.user_id = p_user_id),
    'availability', (SELECT COALESCE(jsonb_agg(jsonb_build_object('dayOfWeek', a.day_of_week,
        'startTime', a.start_time, 'endTime', a.end_time)), '[]')
      FROM user_availability a WHERE a.user_id = p_user_id),
    'following', (SELECT COALESCE(jsonb_agg(jsonb_build_object('username', u.username, 'status', f.status,
        'createdAt', f.created_at)), '[]')
      FROM follow f JOIN user_account u ON u.id = f.followed_id WHERE f.follower_id = p_user_id),
    'followers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('username', u.username, 'status', f.status,
        'createdAt', f.created_at)), '[]')
      FROM follow f JOIN user_account u ON u.id = f.follower_id WHERE f.followed_id = p_user_id),
    'blocks', (SELECT COALESCE(jsonb_agg(jsonb_build_object('username', u.username, 'createdAt', b.created_at)), '[]')
      FROM user_block b JOIN user_account u ON u.id = b.blocked_id WHERE b.blocker_id = p_user_id),
    'circles', (SELECT COALESCE(jsonb_agg(jsonb_build_object('circle', c.name, 'role', cm.role, 'joinedAt', cm.joined_at)), '[]')
      FROM circle_member cm JOIN circle c ON c.id = cm.circle_id WHERE cm.user_id = p_user_id),
    'communities', (SELECT COALESCE(jsonb_agg(jsonb_build_object('community', c.name, 'role', cm.role,
        'joinedAt', cm.joined_at)), '[]')
      FROM community_member cm JOIN community c ON c.id = cm.community_id WHERE cm.user_id = p_user_id),
    'venues', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', v.name, 'address', v.address,
        'isPrivate', v.is_private, 'createdAt', v.created_at)), '[]')
      FROM venue v WHERE v.created_by_id = p_user_id),
    'eventsOwned', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'status', e.status,
        'startDate', e.start_date, 'startTime', e.start_time, 'recurrenceRule', e.recurrence_rule,
        'address', e.address, 'createdAt', e.created_at)), '[]')
      FROM event e WHERE e.owner_id = p_user_id),
    'registrations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('event', e.title, 'startsAt', o.starts_at,
        'status', r.status, 'attendance', r.attendance, 'lateCancellation', r.is_late_cancellation,
        'createdAt', r.created_at,
        'guests', (SELECT COALESCE(jsonb_agg(g.display_name), '[]') FROM registration_guest g WHERE g.registration_id = r.id))
        ORDER BY o.starts_at), '[]')
      FROM registration r JOIN event_occurrence o ON o.id = r.occurrence_id JOIN event e ON e.id = o.event_id
      WHERE r.user_id = p_user_id),
    'attendanceDisputes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', d.reason, 'status', d.status,
        'createdAt', d.created_at)), '[]')
      FROM attendance_dispute d JOIN registration r ON r.id = d.registration_id WHERE r.user_id = p_user_id),
    'messages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('conversationKind', cv.kind, 'body', m.body,
        'createdAt', m.created_at, 'editedAt', m.edited_at) ORDER BY m.id), '[]')
      FROM message m JOIN conversation cv ON cv.id = m.conversation_id WHERE m.sender_id = p_user_id),
    'reactions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('reaction', mr.emoji, 'createdAt', mr.created_at)), '[]')
      FROM message_reaction mr WHERE mr.user_id = p_user_id),
    'notifications', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', t.code, 'payload', n.payload,
        'createdAt', n.created_at, 'readAt', n.read_at) ORDER BY n.id), '[]')
      FROM notification n JOIN notification_type t ON t.id = n.notification_type_id WHERE n.user_id = p_user_id),
    'notificationPreferences', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', t.code, 'push', p.push_enabled,
        'inApp', p.in_app_enabled)), '[]')
      FROM notification_preference p JOIN notification_type t ON t.id = p.notification_type_id WHERE p.user_id = p_user_id),
    'devices', (SELECT COALESCE(jsonb_agg(jsonb_build_object('userAgent', ps.user_agent, 'createdAt', ps.created_at,
        'lastUsedAt', ps.last_used_at)), '[]')
      FROM push_subscription ps WHERE ps.user_id = p_user_id),
    'cheersGiven', (SELECT COALESCE(jsonb_agg(jsonb_build_object('to', u.username, 'type', ct.code,
        'createdAt', c.created_at)), '[]')
      FROM cheer c JOIN cheer_type ct ON ct.id = c.cheer_type_id JOIN user_account u ON u.id = c.recipient_id
      WHERE c.giver_id = p_user_id),
    'cheersReceived', (SELECT COALESCE(jsonb_agg(jsonb_build_object('from', u.username, 'type', ct.code,
        'createdAt', c.created_at)), '[]')
      FROM cheer c JOIN cheer_type ct ON ct.id = c.cheer_type_id LEFT JOIN user_account u ON u.id = c.giver_id
      WHERE c.recipient_id = p_user_id),
    'reportsFiled', (SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', rr.code, 'status', rp.status,
        'details', rp.details, 'createdAt', rp.created_at)), '[]')
      FROM report rp JOIN report_reason rr ON rr.id = rp.report_reason_id WHERE rp.reporter_id = p_user_id),
    'sanctions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'reason', s.reason,
        'startsAt', s.starts_at, 'endsAt', s.ends_at, 'revokedAt', s.revoked_at)), '[]')
      FROM user_sanction s WHERE s.user_id = p_user_id),
    'badges', (SELECT COALESCE(jsonb_agg(jsonb_build_object('badge', b.code, 'tier', t.tier_rank,
        'unlockedAt', ub.unlocked_at)), '[]')
      FROM user_badge ub JOIN badge b ON b.id = ub.badge_id LEFT JOIN badge_tier t ON t.id = ub.badge_tier_id
      WHERE ub.user_id = p_user_id),
    'consents', (SELECT COALESCE(jsonb_agg(jsonb_build_object('purpose', cp.code, 'granted', uc.granted,
        'policyVersion', pv.version, 'createdAt', uc.created_at) ORDER BY uc.id), '[]')
      FROM user_consent uc JOIN consent_purpose cp ON cp.id = uc.consent_purpose_id
      LEFT JOIN policy_version pv ON pv.id = uc.policy_version_id WHERE uc.user_id = p_user_id),
    'exportRequests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', x.status, 'requestedAt', x.requested_at)), '[]')
      FROM data_export_request x WHERE x.user_id = p_user_id)
  )
$$;

COMMENT ON FUNCTION export_user_data(uuid, text) IS 'Every piece of data of a user as one JSON object, emails and birth date decrypted with the key passed by the data layer (BR-GDP-07). Never logged.';

-- ---------------------------------------------------------------------------
-- erase_user_account (BR-GDP-03, BR-GDP-04, BR-GDP-05)
-- ---------------------------------------------------------------------------
-- Final step of the erasure, called by the data layer after it has cancelled the user's upcoming registrations (with
-- waitlist promotion) and cancelled the upcoming sessions of owned events without a co-organizer (to notify people).
-- Here: owned events go to the oldest co-organizer, or keep no owner; every consent is withdrawn (kept 3 years); then
-- the account row is deleted and the foreign keys do the rest: personal rows are deleted (CASCADE); messages, cheers
-- given, registrations (anonymous_key kept), reports and audit entries stay without the identity (SET NULL). Banned
-- identities and anonymous aggregates are kept (BR-MOD-04, BR-GDP-06).
CREATE FUNCTION erase_user_account(p_user_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_event record;
  v_co record;
BEGIN
  FOR v_event IN SELECT id FROM event WHERE owner_id = p_user_id FOR UPDATE LOOP
    SELECT user_id, counts_toward_capacity INTO v_co
    FROM event_co_organizer WHERE event_id = v_event.id
    ORDER BY added_at, user_id LIMIT 1;
    IF FOUND THEN
      DELETE FROM event_co_organizer WHERE event_id = v_event.id AND user_id = v_co.user_id;
      UPDATE event SET owner_id = v_co.user_id, owner_counts_toward_capacity = v_co.counts_toward_capacity
      WHERE id = v_event.id;
    ELSE
      UPDATE event SET owner_id = NULL,
        status = CASE WHEN status = 'cancelled' THEN status ELSE 'cancelled'::event_status END
      WHERE id = v_event.id;
    END IF;
  END LOOP;

  INSERT INTO user_consent (user_id, consent_purpose_id, granted)
  SELECT p_user_id, cp.id, false FROM consent_purpose cp;

  DELETE FROM user_account WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION erase_user_account(uuid) IS 'Final step of the account erasure (BR-GDP-03 to BR-GDP-05). Call it through GdprRepository, never directly.';

-- ---------------------------------------------------------------------------
-- run_gdpr_jobs (BR-GDP-08, BR-GDP-09, BR-MSG-05), nightly with pg_cron
-- ---------------------------------------------------------------------------
CREATE FUNCTION run_gdpr_jobs() RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_messages int;
  v_conversations int;
  v_refresh int;
  v_account int;
  v_notifications int;
  v_audit int;
  v_consents int;
  v_exports int;
  v_inactive int;
  v_reactivated int;
BEGIN
  -- BR-MSG-05: occurrence chat messages are purged 1 year after the occurrence, unless a report targets them: then they
  -- are kept until the report is closed, plus 1 year.
  DELETE FROM message m
  USING conversation cv, event_occurrence o
  WHERE cv.id = m.conversation_id AND o.id = cv.occurrence_id
    AND o.starts_at < now() - interval '1 year'
    AND NOT EXISTS (
      SELECT 1 FROM report r
      WHERE r.target_message_id = m.id
        AND (r.closed_at IS NULL OR r.closed_at > now() - interval '1 year')
    );
  GET DIAGNOSTICS v_messages = ROW_COUNT;
  DELETE FROM conversation cv
  USING event_occurrence o
  WHERE o.id = cv.occurrence_id AND o.starts_at < now() - interval '1 year'
    AND NOT EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = cv.id);
  GET DIAGNOSTICS v_conversations = ROW_COUNT;

  -- BR-GDP-09: tokens 30 days after expiry.
  DELETE FROM refresh_token WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS v_refresh = ROW_COUNT;
  DELETE FROM account_token WHERE expires_at < now() - interval '30 days';
  GET DIAGNOSTICS v_account = ROW_COUNT;

  -- BR-NOT-01, BR-GDP-09: in-app notifications are kept 90 days.
  DELETE FROM notification WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  -- BR-MOD-05, BR-GDP-09: the audit log is kept 3 years.
  DELETE FROM audit_log WHERE created_at < now() - interval '3 years';
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- BR-GDP-09: consent history for the account lifetime plus 3 years. Rows of an erased account (user_id NULL) are
  -- deleted 3 years after the withdrawals the erasure appended.
  DELETE FROM user_consent uc
  WHERE uc.user_id IS NULL AND uc.created_at < now() - interval '3 years';
  GET DIAGNOSTICS v_consents = ROW_COUNT;

  -- BR-GDP-07: download links last 7 days. The files are deleted from the disk by the developers
  -- (GdprRepository.listExpiredExportFiles).
  UPDATE data_export_request SET status = 'expired'
  WHERE status = 'ready' AND expires_at < now();
  GET DIAGNOSTICS v_exports = ROW_COUNT;

  -- BR-GDP-08: a user active again after the warning is no longer warned.
  UPDATE user_account SET inactivity_warned_at = NULL
  WHERE inactivity_warned_at IS NOT NULL AND last_active_at > inactivity_warned_at;
  GET DIAGNOSTICS v_reactivated = ROW_COUNT;

  -- BR-GDP-08: deletion at 24 months of inactivity, for warned accounts. The request is dated 30 days back, so the
  -- account is due for erasure now (the 30-day grace period ran since the warning).
  UPDATE user_account
  SET deletion_requested_at = now() - interval '30 days'
  WHERE deletion_requested_at IS NULL
    AND inactivity_warned_at IS NOT NULL
    AND inactivity_warned_at < now() - interval '30 days'
    AND COALESCE(last_active_at, created_at) < now() - interval '24 months';
  GET DIAGNOSTICS v_inactive = ROW_COUNT;

  RETURN jsonb_build_object(
    'occurrenceMessages', v_messages, 'occurrenceConversations', v_conversations,
    'refreshTokens', v_refresh, 'accountTokens', v_account, 'notifications', v_notifications,
    'auditEntries', v_audit, 'consents', v_consents, 'expiredExports', v_exports,
    'reactivatedAccounts', v_reactivated, 'inactiveAccountsScheduled', v_inactive);
END;
$$;

COMMENT ON FUNCTION run_gdpr_jobs() IS 'Nightly retention and inactivity job (BR-GDP-08, BR-GDP-09, BR-MSG-05). Returns the number of rows touched per purge.';

-- migrate:down
DROP FUNCTION run_gdpr_jobs();
DROP FUNCTION erase_user_account(uuid);
DROP FUNCTION export_user_data(uuid, text);
DROP TABLE data_export_request;
DROP TABLE user_consent;
DROP TABLE consent_purpose;
DROP TABLE policy_version;
DROP TYPE export_status;
DROP TYPE policy_document;
COMMENT ON COLUMN event.owner_id IS 'The single owner, who can transfer ownership (BR-EVT-20). Erasure transfers or cancels first (BR-GDP-03).';
ALTER TABLE event ALTER COLUMN owner_id SET NOT NULL;
