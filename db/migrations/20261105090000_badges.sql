-- migrate:up
-- Badge groundwork (batch 4): a catalog with optional tiers, and the badges users hold (BR-GAM-01, BR-GAM-02).
-- The badges themselves are defined later (BR-GAM-01, DEFERRED): nothing is seeded. Awarding and removing badges is
-- done by the developers' code with the progress data of StatsRepository (BR-GAM-02).

-- ---------------------------------------------------------------------------
-- badge
-- ---------------------------------------------------------------------------
CREATE TABLE badge (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  icon text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL,
  CONSTRAINT pk_badge PRIMARY KEY (id),
  CONSTRAINT uq_badge_code UNIQUE (code)
);

COMMENT ON TABLE badge IS 'Badge catalog, managed from the back office (BR-GAM-01, BR-TECH-12).';
COMMENT ON COLUMN badge.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN badge.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';
COMMENT ON COLUMN badge.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';
COMMENT ON COLUMN badge.description IS 'English description of how to earn it.';
COMMENT ON COLUMN badge.category IS 'Free grouping code for display (for example sessions, social, reliability).';
COMMENT ON COLUMN badge.icon IS 'Optional icon name or path.';
COMMENT ON COLUMN badge.is_active IS 'Inactive badges are no longer awarded; holders keep them until the developers remove them.';
COMMENT ON COLUMN badge.sort_order IS 'Display order, lowest first.';

-- ---------------------------------------------------------------------------
-- badge_tier
-- ---------------------------------------------------------------------------
CREATE TABLE badge_tier (
  id uuid NOT NULL DEFAULT uuidv7(),
  badge_id uuid NOT NULL,
  tier_rank smallint NOT NULL,
  name text NOT NULL,
  threshold int NOT NULL,
  CONSTRAINT pk_badge_tier PRIMARY KEY (id),
  CONSTRAINT uq_badge_tier_badge_rank UNIQUE (badge_id, tier_rank),
  CONSTRAINT uq_badge_tier_id_badge UNIQUE (id, badge_id),
  CONSTRAINT fk_badge_tier_badge_id FOREIGN KEY (badge_id)
    REFERENCES badge (id) ON DELETE CASCADE,
  CONSTRAINT ck_badge_tier_rank_positive CHECK (tier_rank >= 1),
  CONSTRAINT ck_badge_tier_threshold_not_negative CHECK (threshold >= 0)
);

COMMENT ON TABLE badge_tier IS 'Optional levels of a badge, such as bronze, silver, gold (BR-GAM-01).';
COMMENT ON COLUMN badge_tier.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN badge_tier.badge_id IS 'The badge.';
COMMENT ON COLUMN badge_tier.tier_rank IS 'Level, 1 for the lowest; unique per badge.';
COMMENT ON COLUMN badge_tier.name IS 'English name of the level (BR-TECH-12).';
COMMENT ON COLUMN badge_tier.threshold IS 'Progress value needed for this level, read by the developers'' awarding code (BR-GAM-02).';

-- ---------------------------------------------------------------------------
-- user_badge
-- ---------------------------------------------------------------------------
CREATE TABLE user_badge (
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL,
  badge_tier_id uuid NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NULL,
  CONSTRAINT pk_user_badge PRIMARY KEY (user_id, badge_id),
  CONSTRAINT fk_user_badge_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_badge_badge_id FOREIGN KEY (badge_id)
    REFERENCES badge (id) ON DELETE CASCADE,
  -- The tier must belong to the badge; deleting the tier keeps the badge without a tier.
  CONSTRAINT fk_user_badge_badge_tier_id FOREIGN KEY (badge_tier_id, badge_id)
    REFERENCES badge_tier (id, badge_id) ON DELETE SET NULL (badge_tier_id)
);

CREATE INDEX ix_user_badge_badge_id ON user_badge (badge_id);
CREATE INDEX ix_user_badge_badge_tier_id ON user_badge (badge_tier_id);
CREATE INDEX ix_user_badge_unseen ON user_badge (user_id) WHERE seen_at IS NULL;

COMMENT ON TABLE user_badge IS 'A badge held by a user. Badges can be lost: the row is deleted (BR-GAM-02).';
COMMENT ON COLUMN user_badge.user_id IS 'The holder.';
COMMENT ON COLUMN user_badge.badge_id IS 'The badge.';
COMMENT ON COLUMN user_badge.badge_tier_id IS 'Current level, NULL for a badge without tiers; must belong to the badge.';
COMMENT ON COLUMN user_badge.unlocked_at IS 'When the badge, or its current level, was unlocked (BR-GAM-01).';
COMMENT ON COLUMN user_badge.seen_at IS 'When the user saw the unlock animation; NULL until then, so it plays once (BR-GAM-01).';

-- migrate:down
DROP TABLE user_badge;
DROP TABLE badge_tier;
DROP TABLE badge;
