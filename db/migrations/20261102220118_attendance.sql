-- migrate:up
-- Attendance disputes (batch 1D, BR-ATT-01, BR-ATT-02). The attendance columns of registration and the
-- attendance_status enum already exist since batch 1C.

CREATE TYPE dispute_status AS ENUM ('open', 'upheld', 'rejected');

-- ---------------------------------------------------------------------------
-- attendance_dispute
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_dispute (
  id uuid NOT NULL DEFAULT uuidv7(),
  registration_id uuid NOT NULL,
  reason text NOT NULL,
  status dispute_status NOT NULL DEFAULT 'open',
  resolved_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT pk_attendance_dispute PRIMARY KEY (id),
  CONSTRAINT uq_attendance_dispute_registration_id UNIQUE (registration_id),
  CONSTRAINT fk_attendance_dispute_registration_id FOREIGN KEY (registration_id)
    REFERENCES registration (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_dispute_resolved_by_id FOREIGN KEY (resolved_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT ck_attendance_dispute_resolution CHECK (
    (status = 'open') = (resolved_at IS NULL)
  )
);

CREATE INDEX ix_attendance_dispute_resolved_by_id ON attendance_dispute (resolved_by_id);
CREATE INDEX ix_attendance_dispute_open ON attendance_dispute (created_at) WHERE status = 'open';

COMMENT ON TABLE attendance_dispute IS 'A participant contests a no_show; a moderator upholds or rejects it. One dispute per registration (BR-ATT-02).';
COMMENT ON COLUMN attendance_dispute.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN attendance_dispute.registration_id IS 'The disputed registration, at most one dispute per registration (BR-ATT-02). Deleted with the registration.';
COMMENT ON COLUMN attendance_dispute.reason IS 'Free text reason given by the participant (BR-ATT-02).';
COMMENT ON COLUMN attendance_dispute.status IS 'open until a moderator decides: upheld or rejected (BR-ATT-02).';
COMMENT ON COLUMN attendance_dispute.resolved_by_id IS 'Moderator who decided the dispute; NULL while open or after erasure of that moderator (BR-ATT-02, BR-GDP-04).';
COMMENT ON COLUMN attendance_dispute.created_at IS 'When the participant opened the dispute, inside the 7-day window (BR-ATT-02).';
COMMENT ON COLUMN attendance_dispute.resolved_at IS 'When the moderator decided, NULL while the dispute is open (BR-ATT-02).';

-- migrate:down
DROP TABLE attendance_dispute;
DROP TYPE dispute_status;
