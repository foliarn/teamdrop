-- migrate:up
-- Accounts and profiles: users, authentication, tokens, settings, sports, ratings and availability (batch 1A).

CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE gender AS ENUM ('woman', 'man', 'non_binary', 'prefer_not_to_say');
CREATE TYPE auth_provider AS ENUM ('password', 'google');
CREATE TYPE account_token_purpose AS ENUM ('email_verification', 'password_reset');
CREATE TYPE visibility_level AS ENUM ('public', 'members', 'friends', 'only_me');
CREATE TYPE invite_policy AS ENUM ('everyone', 'friends', 'nobody');

-- ---------------------------------------------------------------------------
-- user_account
-- ---------------------------------------------------------------------------
CREATE TABLE user_account (
  id uuid NOT NULL DEFAULT uuidv7(),
  username citext NOT NULL,
  email_ciphertext bytea NOT NULL,
  email_hash bytea NOT NULL,
  email_verified_at timestamptz NULL,
  first_name text NOT NULL,
  birth_date_ciphertext bytea NOT NULL,
  gender gender NULL,
  municipality_id uuid NOT NULL,
  avatar_path text NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NULL,
  inactivity_warned_at timestamptz NULL,
  deletion_requested_at timestamptz NULL,
  CONSTRAINT pk_user_account PRIMARY KEY (id),
  CONSTRAINT uq_user_account_username UNIQUE (username),
  CONSTRAINT uq_user_account_email_hash UNIQUE (email_hash),
  CONSTRAINT fk_user_account_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE RESTRICT
);

CREATE INDEX ix_user_account_municipality_id ON user_account (municipality_id);
CREATE INDEX ix_user_account_username_trgm ON user_account USING gin (immutable_unaccent(username::text) gin_trgm_ops);

COMMENT ON TABLE user_account IS 'A TeamDrop member account. Email and birth date are encrypted (BR-ACC-04).';
COMMENT ON COLUMN user_account.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN user_account.username IS 'Public username, unique and case-insensitive (BR-ACC-02).';
COMMENT ON COLUMN user_account.email_ciphertext IS 'Normalized email encrypted with pgcrypto (BR-ACC-04).';
COMMENT ON COLUMN user_account.email_hash IS 'HMAC-SHA256 blind index of the normalized email, unique, used for lookups (BR-ACC-04).';
COMMENT ON COLUMN user_account.email_verified_at IS 'Instant the email was verified, NULL when not verified (BR-ACC-07).';
COMMENT ON COLUMN user_account.first_name IS 'First name shown on the profile (BR-ACC-01).';
COMMENT ON COLUMN user_account.birth_date_ciphertext IS 'Birth date encrypted with pgcrypto; the minimum age is checked on creation (BR-ACC-03, BR-ACC-04).';
COMMENT ON COLUMN user_account.gender IS 'Optional, informative only (BR-ACC-09).';
COMMENT ON COLUMN user_account.municipality_id IS 'Declared municipality or arrondissement (BR-ACC-13, BR-ACC-19).';
COMMENT ON COLUMN user_account.avatar_path IS 'Path of the profile photo on the server disk, NULL when none (BR-ACC-16).';
COMMENT ON COLUMN user_account.role IS 'Single role of the account: user, moderator or admin (BR-ACC-08).';
COMMENT ON COLUMN user_account.created_at IS 'Account creation instant.';
COMMENT ON COLUMN user_account.last_active_at IS 'Last activity instant, used for inactivity rules (BR-GDP-08).';
COMMENT ON COLUMN user_account.inactivity_warned_at IS 'Instant the inactivity warning was sent, NULL when not warned (BR-GDP-08).';
COMMENT ON COLUMN user_account.deletion_requested_at IS 'Instant the deletion was requested; erasure runs after a 30-day grace period (BR-GDP-03).';

-- ---------------------------------------------------------------------------
-- auth_identity
-- ---------------------------------------------------------------------------
CREATE TABLE auth_identity (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  provider auth_provider NOT NULL,
  provider_subject text NULL,
  password_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  CONSTRAINT pk_auth_identity PRIMARY KEY (id),
  CONSTRAINT fk_auth_identity_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT uq_auth_identity_provider_subject UNIQUE (provider, provider_subject),
  CONSTRAINT uq_auth_identity_user_provider UNIQUE (user_id, provider),
  CONSTRAINT ck_auth_identity_credentials CHECK (
    (provider = 'password' AND password_hash IS NOT NULL AND provider_subject IS NULL)
    OR (provider = 'google' AND provider_subject IS NOT NULL AND password_hash IS NULL)
  )
);

COMMENT ON TABLE auth_identity IS 'One login method of a user: email and password, or Google (BR-ACC-05).';
COMMENT ON COLUMN auth_identity.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN auth_identity.user_id IS 'Owner account; identities are deleted with the account.';
COMMENT ON COLUMN auth_identity.provider IS 'Login method: password or google (BR-ACC-05).';
COMMENT ON COLUMN auth_identity.provider_subject IS 'Google subject identifier, NULL for password identities; unique per provider (BR-ACC-05).';
COMMENT ON COLUMN auth_identity.password_hash IS 'argon2id hash of the password, NULL for Google identities (BR-TECH-11).';
COMMENT ON COLUMN auth_identity.created_at IS 'Creation instant of the login method.';
COMMENT ON COLUMN auth_identity.last_used_at IS 'Last instant this login method was used, NULL when never used.';

-- ---------------------------------------------------------------------------
-- refresh_token
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_token (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  family_id uuid NOT NULL,
  token_hash bytea NOT NULL,
  user_agent text NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  replaced_by_id uuid NULL,
  CONSTRAINT pk_refresh_token PRIMARY KEY (id),
  CONSTRAINT uq_refresh_token_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_token_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_refresh_token_replaced_by_id FOREIGN KEY (replaced_by_id)
    REFERENCES refresh_token (id) ON DELETE SET NULL
);

CREATE INDEX ix_refresh_token_user_id ON refresh_token (user_id);
CREATE INDEX ix_refresh_token_family_id ON refresh_token (family_id);
CREATE INDEX ix_refresh_token_replaced_by_id ON refresh_token (replaced_by_id);

COMMENT ON TABLE refresh_token IS 'Hashed refresh tokens, rotated on use and grouped by family to detect reuse (BR-ACC-07, BR-TECH-11).';
COMMENT ON COLUMN refresh_token.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN refresh_token.user_id IS 'Owner account.';
COMMENT ON COLUMN refresh_token.family_id IS 'Rotation family: all tokens issued by one login share it (BR-TECH-11).';
COMMENT ON COLUMN refresh_token.token_hash IS 'SHA-256 hash of the raw token, unique (BR-ACC-04).';
COMMENT ON COLUMN refresh_token.user_agent IS 'User agent of the device that received the token, for the sessions list.';
COMMENT ON COLUMN refresh_token.issued_at IS 'Instant the token was issued.';
COMMENT ON COLUMN refresh_token.expires_at IS 'Instant after which the token is refused.';
COMMENT ON COLUMN refresh_token.revoked_at IS 'Instant the token was revoked, NULL while valid (BR-ACC-07).';
COMMENT ON COLUMN refresh_token.replaced_by_id IS 'Token that replaced this one on rotation, NULL for the last token of a family.';

-- ---------------------------------------------------------------------------
-- account_token
-- ---------------------------------------------------------------------------
CREATE TABLE account_token (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  purpose account_token_purpose NOT NULL,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_account_token PRIMARY KEY (id),
  CONSTRAINT uq_account_token_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_account_token_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE INDEX ix_account_token_user_id ON account_token (user_id);

COMMENT ON TABLE account_token IS 'Single-use hashed tokens for email verification and password reset (BR-ACC-07).';
COMMENT ON COLUMN account_token.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN account_token.user_id IS 'Account the token belongs to.';
COMMENT ON COLUMN account_token.purpose IS 'What the token allows: email_verification or password_reset.';
COMMENT ON COLUMN account_token.token_hash IS 'SHA-256 hash of the raw token, unique (BR-ACC-04).';
COMMENT ON COLUMN account_token.expires_at IS 'Instant after which the token is refused.';
COMMENT ON COLUMN account_token.used_at IS 'Instant the token was used, NULL while unused (single use).';
COMMENT ON COLUMN account_token.created_at IS 'Creation instant.';

-- ---------------------------------------------------------------------------
-- user_setting
-- ---------------------------------------------------------------------------
CREATE TABLE user_setting (
  user_id uuid NOT NULL,
  profile_visibility visibility_level NOT NULL DEFAULT 'members',
  stats_visibility visibility_level NOT NULL DEFAULT 'members',
  badges_visibility visibility_level NOT NULL DEFAULT 'members',
  reliability_visibility visibility_level NOT NULL DEFAULT 'members',
  circles_visibility visibility_level NOT NULL DEFAULT 'members',
  history_visibility visibility_level NOT NULL DEFAULT 'members',
  follows_visibility visibility_level NOT NULL DEFAULT 'members',
  is_private_account boolean NOT NULL DEFAULT false,
  hide_from_rankings boolean NOT NULL DEFAULT false,
  circle_invite_policy invite_policy NOT NULL DEFAULT 'everyone',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_setting PRIMARY KEY (user_id),
  CONSTRAINT fk_user_setting_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE TRIGGER trg_user_setting_set_updated_at
  BEFORE UPDATE ON user_setting
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_setting IS 'Privacy and interaction settings of one account (BR-ACC-14, BR-ACC-15).';
COMMENT ON COLUMN user_setting.user_id IS 'Owner account, also the primary key (one settings row per account).';
COMMENT ON COLUMN user_setting.profile_visibility IS 'Who can see the profile section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.stats_visibility IS 'Who can see the statistics section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.badges_visibility IS 'Who can see the badges section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.reliability_visibility IS 'Who can see the reliability section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.circles_visibility IS 'Who can see the circles section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.history_visibility IS 'Who can see the event history section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.follows_visibility IS 'Who can see the follows section (BR-ACC-14).';
COMMENT ON COLUMN user_setting.is_private_account IS 'When true, follow requests need approval (BR-ACC-14).';
COMMENT ON COLUMN user_setting.hide_from_rankings IS 'When true, the user is left out of city rankings (BR-ACC-15).';
COMMENT ON COLUMN user_setting.circle_invite_policy IS 'Who can invite the user to circles (BR-ACC-15).';
COMMENT ON COLUMN user_setting.updated_at IS 'Last update instant (maintained by trigger).';

-- ---------------------------------------------------------------------------
-- user_sport
-- ---------------------------------------------------------------------------
CREATE TABLE user_sport (
  user_id uuid NOT NULL,
  sport_id uuid NOT NULL,
  skill_level_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_sport PRIMARY KEY (user_id, sport_id),
  CONSTRAINT fk_user_sport_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sport_sport_id FOREIGN KEY (sport_id)
    REFERENCES sport (id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_sport_skill_level_id FOREIGN KEY (skill_level_id)
    REFERENCES skill_level (id) ON DELETE RESTRICT
);

CREATE INDEX ix_user_sport_sport_id ON user_sport (sport_id);
CREATE INDEX ix_user_sport_skill_level_id ON user_sport (skill_level_id);

COMMENT ON TABLE user_sport IS 'Sports declared by a user with a self-declared level, one level per sport (BR-ACC-10).';
COMMENT ON COLUMN user_sport.user_id IS 'Declaring account.';
COMMENT ON COLUMN user_sport.sport_id IS 'Declared sport.';
COMMENT ON COLUMN user_sport.skill_level_id IS 'Self-declared level on the shared scale (BR-ACC-10).';
COMMENT ON COLUMN user_sport.created_at IS 'Instant the sport was declared.';

-- ---------------------------------------------------------------------------
-- user_rating
-- ---------------------------------------------------------------------------
CREATE TABLE user_rating (
  user_id uuid NOT NULL,
  rating_system_id uuid NOT NULL,
  numeric_value numeric NULL,
  rating_grade_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_rating PRIMARY KEY (user_id, rating_system_id),
  CONSTRAINT fk_user_rating_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_rating_rating_system_id FOREIGN KEY (rating_system_id)
    REFERENCES rating_system (id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_rating_rating_grade_id FOREIGN KEY (rating_grade_id)
    REFERENCES rating_grade (id) ON DELETE RESTRICT,
  CONSTRAINT ck_user_rating_one_value CHECK (num_nonnulls(numeric_value, rating_grade_id) = 1)
);

CREATE INDEX ix_user_rating_rating_system_id ON user_rating (rating_system_id);
CREATE INDEX ix_user_rating_rating_grade_id ON user_rating (rating_grade_id);

CREATE TRIGGER trg_user_rating_set_updated_at
  BEFORE UPDATE ON user_rating
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_rating IS 'Official rating of a user in one rating system, numeric or graded, never both (BR-ACC-11).';
COMMENT ON COLUMN user_rating.user_id IS 'Rated account.';
COMMENT ON COLUMN user_rating.rating_system_id IS 'Rating system of the value.';
COMMENT ON COLUMN user_rating.numeric_value IS 'Numeric value for a numeric system, NULL for a graded system (BR-ACC-11).';
COMMENT ON COLUMN user_rating.rating_grade_id IS 'Grade for a graded system, NULL for a numeric system (BR-ACC-11).';
COMMENT ON COLUMN user_rating.updated_at IS 'Last update instant (maintained by trigger).';

-- ---------------------------------------------------------------------------
-- user_availability
-- ---------------------------------------------------------------------------
CREATE TABLE user_availability (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  day_of_week smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  CONSTRAINT pk_user_availability PRIMARY KEY (id),
  CONSTRAINT fk_user_availability_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT ck_user_availability_day_of_week CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT ck_user_availability_time_order CHECK (start_time < end_time),
  CONSTRAINT ex_user_availability_no_overlap EXCLUDE USING gist (
    user_id WITH =,
    day_of_week WITH =,
    tsrange('2000-01-01'::date + start_time, '2000-01-01'::date + end_time) WITH &&
  )
);

CREATE INDEX ix_user_availability_user_id ON user_availability (user_id);

COMMENT ON TABLE user_availability IS 'Recurring weekly availability slots in local time; slots of one user never overlap (BR-ACC-12).';
COMMENT ON COLUMN user_availability.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN user_availability.user_id IS 'Owner account.';
COMMENT ON COLUMN user_availability.day_of_week IS 'ISO day of the week, 1 = Monday to 7 = Sunday (BR-ACC-12).';
COMMENT ON COLUMN user_availability.start_time IS 'Local start time of the slot (Europe/Paris, BR-TECH-05).';
COMMENT ON COLUMN user_availability.end_time IS 'Local end time of the slot, strictly after start_time (BR-ACC-12).';


-- migrate:down
DROP TABLE user_availability;
DROP TABLE user_rating;
DROP TABLE user_sport;
DROP TABLE user_setting;
DROP TABLE account_token;
DROP TABLE refresh_token;
DROP TABLE auth_identity;
DROP TABLE user_account;
DROP TYPE invite_policy;
DROP TYPE visibility_level;
DROP TYPE account_token_purpose;
DROP TYPE auth_provider;
DROP TYPE gender;
DROP TYPE user_role;
