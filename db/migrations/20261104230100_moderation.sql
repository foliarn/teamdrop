-- migrate:up
-- Moderation (batch 3): report reasons (reference), reports, sanctions, banned identities and the audit log
-- (BR-MOD-01 to BR-MOD-05, BR-GDP-04, BR-TECH-12).

CREATE TYPE report_status AS ENUM ('open', 'assigned', 'resolved', 'dismissed');
CREATE TYPE sanction_kind AS ENUM ('warning', 'temporary_ban', 'permanent_ban', 'content_removal');
CREATE TYPE banned_identity_kind AS ENUM ('email', 'google_subject');

-- ---------------------------------------------------------------------------
-- report_reason (reference)
-- ---------------------------------------------------------------------------
CREATE TABLE report_reason (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL,
  CONSTRAINT pk_report_reason PRIMARY KEY (id),
  CONSTRAINT uq_report_reason_code UNIQUE (code)
);

COMMENT ON TABLE report_reason IS 'Reference list of report reasons, managed from the back office (BR-MOD-01, BR-TECH-12).';
COMMENT ON COLUMN report_reason.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN report_reason.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';
COMMENT ON COLUMN report_reason.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';
COMMENT ON COLUMN report_reason.is_active IS 'Inactive reasons cannot be chosen any more; reports already filed keep them.';
COMMENT ON COLUMN report_reason.sort_order IS 'Display order, lowest first.';

-- ---------------------------------------------------------------------------
-- report
-- ---------------------------------------------------------------------------
CREATE TABLE report (
  id uuid NOT NULL DEFAULT uuidv7(),
  reporter_id uuid NULL,
  report_reason_id uuid NOT NULL,
  target_user_id uuid NULL,
  target_event_id uuid NULL,
  target_message_id uuid NULL,
  details text NULL,
  status report_status NOT NULL DEFAULT 'open',
  assigned_moderator_id uuid NULL,
  resolution_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz NULL,
  closed_at timestamptz NULL,
  CONSTRAINT pk_report PRIMARY KEY (id),
  CONSTRAINT fk_report_reporter_id FOREIGN KEY (reporter_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_report_report_reason_id FOREIGN KEY (report_reason_id)
    REFERENCES report_reason (id) ON DELETE RESTRICT,
  CONSTRAINT fk_report_target_user_id FOREIGN KEY (target_user_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_report_target_event_id FOREIGN KEY (target_event_id)
    REFERENCES event (id) ON DELETE SET NULL,
  CONSTRAINT fk_report_target_message_id FOREIGN KEY (target_message_id)
    REFERENCES message (id) ON DELETE SET NULL,
  CONSTRAINT fk_report_assigned_moderator_id FOREIGN KEY (assigned_moderator_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  -- BR-MOD-01: a report is filed with exactly one target (checked by the data layer). The target becomes NULL when the
  -- user is erased or the event or message is deleted, and the report is kept without it (BR-GDP-04).
  CONSTRAINT ck_report_at_most_one_target CHECK (num_nonnulls(target_user_id, target_event_id, target_message_id) <= 1),
  CONSTRAINT ck_report_closed_at CHECK ((status IN ('resolved', 'dismissed')) = (closed_at IS NOT NULL)),
  CONSTRAINT ck_report_assigned_at CHECK (status = 'open' OR assigned_at IS NOT NULL OR status = 'dismissed')
);

CREATE INDEX ix_report_queue ON report (created_at) WHERE status IN ('open', 'assigned');
CREATE INDEX ix_report_reporter_id ON report (reporter_id);
CREATE INDEX ix_report_report_reason_id ON report (report_reason_id);
CREATE INDEX ix_report_target_user_id ON report (target_user_id);
CREATE INDEX ix_report_target_event_id ON report (target_event_id);
CREATE INDEX ix_report_target_message_id ON report (target_message_id);
CREATE INDEX ix_report_assigned_moderator_id ON report (assigned_moderator_id);

COMMENT ON TABLE report IS 'A complaint about one user, event or message, handled by a moderator (BR-MOD-01, BR-MOD-02).';
COMMENT ON COLUMN report.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN report.reporter_id IS 'Who filed it; NULL after erasure, the report is kept (BR-GDP-04).';
COMMENT ON COLUMN report.report_reason_id IS 'The reason (BR-MOD-01).';
COMMENT ON COLUMN report.target_user_id IS 'Reported user; NULL for another target or after erasure (BR-MOD-01, BR-GDP-04).';
COMMENT ON COLUMN report.target_event_id IS 'Reported event; NULL for another target or after deletion (BR-MOD-01).';
COMMENT ON COLUMN report.target_message_id IS 'Reported message, kept from the purge while the report is open (BR-MSG-05); NULL for another target or after deletion.';
COMMENT ON COLUMN report.details IS 'Optional free text from the reporter.';
COMMENT ON COLUMN report.status IS 'open, assigned, resolved or dismissed (BR-MOD-02).';
COMMENT ON COLUMN report.assigned_moderator_id IS 'Moderator in charge (BR-MOD-02); NULL while open or after erasure.';
COMMENT ON COLUMN report.resolution_note IS 'What the moderator decided, written when closing.';
COMMENT ON COLUMN report.created_at IS 'When the report was filed.';
COMMENT ON COLUMN report.assigned_at IS 'When a moderator was last assigned.';
COMMENT ON COLUMN report.closed_at IS 'When the report was resolved or dismissed; NULL while open or assigned.';

-- ---------------------------------------------------------------------------
-- user_sanction
-- ---------------------------------------------------------------------------
CREATE TABLE user_sanction (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  kind sanction_kind NOT NULL,
  reason text NOT NULL,
  report_id uuid NULL,
  issued_by_id uuid NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_sanction PRIMARY KEY (id),
  CONSTRAINT fk_user_sanction_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sanction_report_id FOREIGN KEY (report_id)
    REFERENCES report (id) ON DELETE SET NULL,
  CONSTRAINT fk_user_sanction_issued_by_id FOREIGN KEY (issued_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT ck_user_sanction_ends_at CHECK (
    ((kind = 'temporary_ban') = (ends_at IS NOT NULL)) AND (ends_at IS NULL OR ends_at > starts_at)
  ),
  CONSTRAINT ck_user_sanction_reason_not_blank CHECK (reason ~ '[^[:space:]]')
);

CREATE INDEX ix_user_sanction_user_id ON user_sanction (user_id);
CREATE INDEX ix_user_sanction_report_id ON user_sanction (report_id);
CREATE INDEX ix_user_sanction_issued_by_id ON user_sanction (issued_by_id);

COMMENT ON TABLE user_sanction IS 'A sanction: warning, temporary ban, permanent ban or content removal (BR-MOD-03).';
COMMENT ON COLUMN user_sanction.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN user_sanction.user_id IS 'The sanctioned user.';
COMMENT ON COLUMN user_sanction.kind IS 'warning, temporary_ban, permanent_ban or content_removal (BR-MOD-03).';
COMMENT ON COLUMN user_sanction.reason IS 'Reason given by the moderator.';
COMMENT ON COLUMN user_sanction.report_id IS 'The report that led to it, if any.';
COMMENT ON COLUMN user_sanction.issued_by_id IS 'Moderator who issued it; NULL after erasure.';
COMMENT ON COLUMN user_sanction.starts_at IS 'When it takes effect.';
COMMENT ON COLUMN user_sanction.ends_at IS 'End of a temporary ban (length chosen by the moderator, BR-MOD-03); NULL for every other kind.';
COMMENT ON COLUMN user_sanction.revoked_at IS 'When a moderator lifted it early; NULL otherwise.';
COMMENT ON COLUMN user_sanction.created_at IS 'When it was recorded.';

-- ---------------------------------------------------------------------------
-- banned_identity
-- ---------------------------------------------------------------------------
CREATE TABLE banned_identity (
  id uuid NOT NULL DEFAULT uuidv7(),
  identity_kind banned_identity_kind NOT NULL,
  identity_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_banned_identity PRIMARY KEY (id),
  CONSTRAINT uq_banned_identity_kind_hash UNIQUE (identity_kind, identity_hash)
);

COMMENT ON TABLE banned_identity IS 'Hashes of the identities of permanently banned users, kept after erasure to prevent signing up again (BR-MOD-04).';
COMMENT ON COLUMN banned_identity.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN banned_identity.identity_kind IS 'email or google_subject (BR-MOD-04).';
COMMENT ON COLUMN banned_identity.identity_hash IS 'Keyed HMAC-SHA256 of the normalized email (same as user_account.email_hash) or of the Google subject. Never the clear value.';
COMMENT ON COLUMN banned_identity.created_at IS 'When the identity was banned.';

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id uuid NOT NULL DEFAULT uuidv7(),
  actor_id uuid NULL,
  action text NOT NULL,
  target_table text NULL,
  target_id uuid NULL,
  report_id uuid NULL,
  details jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_audit_log PRIMARY KEY (id),
  CONSTRAINT fk_audit_log_actor_id FOREIGN KEY (actor_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_log_report_id FOREIGN KEY (report_id)
    REFERENCES report (id) ON DELETE SET NULL,
  CONSTRAINT ck_audit_log_details_object CHECK (details IS NULL OR jsonb_typeof(details) = 'object')
);

CREATE INDEX ix_audit_log_created_at ON audit_log (created_at);
CREATE INDEX ix_audit_log_actor_id ON audit_log (actor_id);
CREATE INDEX ix_audit_log_target ON audit_log (target_table, target_id);
CREATE INDEX ix_audit_log_report_id ON audit_log (report_id);

COMMENT ON TABLE audit_log IS 'Every moderator and admin action, and the circle admin and organizer actions without a dedicated column; kept 3 years (BR-MOD-05, BR-GDP-09).';
COMMENT ON COLUMN audit_log.id IS 'Primary key, UUID v7 (time-ordered).';
COMMENT ON COLUMN audit_log.actor_id IS 'Who acted; NULL after erasure.';
COMMENT ON COLUMN audit_log.action IS 'Stable action code, for example report.resolved or registration.removed.';
COMMENT ON COLUMN audit_log.target_table IS 'Table of the target row, if any.';
COMMENT ON COLUMN audit_log.target_id IS 'Id of the target row; no foreign key, so the entry outlives the target.';
COMMENT ON COLUMN audit_log.report_id IS 'Report the action belongs to, if any.';
COMMENT ON COLUMN audit_log.details IS 'JSON object of ids and codes; never emails, birth dates, tokens or message bodies.';
COMMENT ON COLUMN audit_log.created_at IS 'When the action happened; purged after 3 years (BR-MOD-05).';

-- migrate:down
DROP TABLE audit_log;
DROP TABLE banned_identity;
DROP TABLE user_sanction;
DROP TABLE report;
DROP TABLE report_reason;
DROP TYPE banned_identity_kind;
DROP TYPE sanction_kind;
DROP TYPE report_status;
