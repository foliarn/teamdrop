-- migrate:up
-- Cheers (batch 3): typed positive feedback between participants of a completed occurrence (BR-SOC-11, BR-SOC-12,
-- BR-TECH-12). Formerly "kudos".

-- ---------------------------------------------------------------------------
-- cheer_type (reference)
-- ---------------------------------------------------------------------------
CREATE TABLE cheer_type (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  icon text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL,
  CONSTRAINT pk_cheer_type PRIMARY KEY (id),
  CONSTRAINT uq_cheer_type_code UNIQUE (code)
);

COMMENT ON TABLE cheer_type IS 'Reference list of cheer types, managed from the back office (BR-SOC-11, BR-TECH-12).';
COMMENT ON COLUMN cheer_type.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN cheer_type.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';
COMMENT ON COLUMN cheer_type.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';
COMMENT ON COLUMN cheer_type.icon IS 'Optional icon name or path.';
COMMENT ON COLUMN cheer_type.is_active IS 'Inactive types cannot be given any more; cheers already given keep them.';
COMMENT ON COLUMN cheer_type.sort_order IS 'Display order, lowest first.';

-- ---------------------------------------------------------------------------
-- cheer
-- ---------------------------------------------------------------------------
CREATE TABLE cheer (
  id uuid NOT NULL DEFAULT uuidv7(),
  occurrence_id uuid NOT NULL,
  giver_id uuid NULL,
  recipient_id uuid NOT NULL,
  cheer_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cheer PRIMARY KEY (id),
  CONSTRAINT uq_cheer_giver_recipient_occurrence UNIQUE (giver_id, recipient_id, occurrence_id),
  CONSTRAINT fk_cheer_occurrence_id FOREIGN KEY (occurrence_id)
    REFERENCES event_occurrence (id) ON DELETE CASCADE,
  CONSTRAINT fk_cheer_giver_id FOREIGN KEY (giver_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_cheer_recipient_id FOREIGN KEY (recipient_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_cheer_cheer_type_id FOREIGN KEY (cheer_type_id)
    REFERENCES cheer_type (id) ON DELETE RESTRICT,
  CONSTRAINT ck_cheer_not_self CHECK (giver_id IS NULL OR giver_id <> recipient_id)
);

CREATE INDEX ix_cheer_recipient_id ON cheer (recipient_id);
CREATE INDEX ix_cheer_occurrence_id ON cheer (occurrence_id);
CREATE INDEX ix_cheer_cheer_type_id ON cheer (cheer_type_id);

COMMENT ON TABLE cheer IS 'A typed cheer from one participant to another after an occurrence; at most one per giver, recipient and occurrence (BR-SOC-11).';
COMMENT ON COLUMN cheer.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN cheer.occurrence_id IS 'The completed occurrence both users attended (BR-SOC-11).';
COMMENT ON COLUMN cheer.giver_id IS 'Who gave it, seen only by the recipient (BR-SOC-12); NULL after erasure of the giver, the recipient keeps it (BR-GDP-05).';
COMMENT ON COLUMN cheer.recipient_id IS 'Who received it (BR-SOC-11).';
COMMENT ON COLUMN cheer.cheer_type_id IS 'The cheer type; a type in use cannot be deleted.';
COMMENT ON COLUMN cheer.created_at IS 'When the cheer was given; there is no deadline (BR-SOC-11).';

-- migrate:down
DROP TABLE cheer;
DROP TABLE cheer_type;
