-- migrate:up
-- Reference data: municipalities, sports, skill levels and rating systems (BR-ACC-10, BR-ACC-11, BR-ACC-13, BR-ACC-17, BR-ACC-19).

CREATE TYPE sport_environment AS ENUM ('indoor', 'outdoor', 'both');
CREATE TYPE rating_value_kind AS ENUM ('numeric', 'graded');

CREATE TABLE municipality (
  id uuid NOT NULL DEFAULT uuidv7(),
  insee_code char(5) NOT NULL,
  name text NOT NULL,
  department_code varchar(3) NOT NULL,
  population int NOT NULL,
  center geography(Point) NOT NULL,
  parent_municipality_id uuid NULL,
  CONSTRAINT pk_municipality PRIMARY KEY (id),
  CONSTRAINT uq_municipality_insee_code UNIQUE (insee_code),
  CONSTRAINT ck_municipality_not_own_parent CHECK (parent_municipality_id <> id),
  CONSTRAINT fk_municipality_parent_municipality_id FOREIGN KEY (parent_municipality_id)
    REFERENCES municipality (id) ON DELETE RESTRICT
);

CREATE INDEX ix_municipality_parent_municipality_id ON municipality (parent_municipality_id);
CREATE INDEX ix_municipality_name_trgm ON municipality USING gin (immutable_unaccent(name) gin_trgm_ops);
CREATE INDEX ix_municipality_center ON municipality USING gist (center);

COMMENT ON TABLE municipality IS 'Metropolitan French municipalities and Paris, Lyon and Marseille arrondissements (BR-ACC-13, BR-ACC-19).';
COMMENT ON COLUMN municipality.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN municipality.insee_code IS 'Official INSEE municipality code (5 characters), unique.';
COMMENT ON COLUMN municipality.name IS 'Official municipality or arrondissement name.';
COMMENT ON COLUMN municipality.department_code IS 'Department code (for example 75 or 2A).';
COMMENT ON COLUMN municipality.population IS 'Population of the municipality, 0 when unknown.';
COMMENT ON COLUMN municipality.center IS 'Center point of the municipality (WGS 84 geography).';
COMMENT ON COLUMN municipality.parent_municipality_id IS 'City an arrondissement belongs to (BR-ACC-19); NULL for ordinary municipalities.';

CREATE TABLE sport (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  is_team_sport boolean NOT NULL,
  environment sport_environment NOT NULL,
  default_duration_minutes int NOT NULL,
  default_min_participants int NULL,
  default_max_participants int NULL,
  icon text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_sport PRIMARY KEY (id),
  CONSTRAINT uq_sport_code UNIQUE (code),
  CONSTRAINT ck_sport_default_duration_positive CHECK (default_duration_minutes > 0),
  CONSTRAINT ck_sport_default_min_participants CHECK (default_min_participants IS NULL OR default_min_participants >= 1),
  CONSTRAINT ck_sport_default_max_participants CHECK (default_max_participants IS NULL OR default_max_participants >= 1),
  CONSTRAINT ck_sport_default_participants_order CHECK (
    default_min_participants IS NULL OR default_max_participants IS NULL
    OR default_min_participants <= default_max_participants
  )
);

COMMENT ON TABLE sport IS 'Sports managed from the back office (BR-ACC-17).';
COMMENT ON COLUMN sport.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN sport.code IS 'Stable English code used by the code, unique (BR-TECH-12).';
COMMENT ON COLUMN sport.name IS 'English display name; the front end translates the code (BR-TECH-12).';
COMMENT ON COLUMN sport.is_team_sport IS 'True for team sports, false for individual sports.';
COMMENT ON COLUMN sport.environment IS 'Where the sport is practised: indoor, outdoor or both.';
COMMENT ON COLUMN sport.default_duration_minutes IS 'Default duration of a session in minutes, positive (BR-ACC-17).';
COMMENT ON COLUMN sport.default_min_participants IS 'Default minimum number of participants, NULL when not applicable (BR-ACC-17).';
COMMENT ON COLUMN sport.default_max_participants IS 'Default maximum number of participants, NULL when not applicable (BR-ACC-17).';
COMMENT ON COLUMN sport.icon IS 'Optional icon identifier.';
COMMENT ON COLUMN sport.is_active IS 'False hides the sport from new choices; existing data is kept (BR-ACC-17).';
COMMENT ON COLUMN sport.created_at IS 'Creation instant.';

CREATE TABLE skill_level (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  rank smallint NOT NULL,
  CONSTRAINT pk_skill_level PRIMARY KEY (id),
  CONSTRAINT uq_skill_level_code UNIQUE (code),
  CONSTRAINT uq_skill_level_rank UNIQUE (rank),
  CONSTRAINT ck_skill_level_rank_positive CHECK (rank >= 1)
);

COMMENT ON TABLE skill_level IS 'Shared self-declared skill scale: beginner, intermediate, advanced, expert (BR-ACC-10).';
COMMENT ON COLUMN skill_level.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN skill_level.code IS 'Stable English code, unique (BR-TECH-12).';
COMMENT ON COLUMN skill_level.name IS 'English display name.';
COMMENT ON COLUMN skill_level.rank IS 'Position on the scale, 1 is the lowest; unique.';

CREATE TABLE rating_system (
  id uuid NOT NULL DEFAULT uuidv7(),
  sport_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  value_kind rating_value_kind NOT NULL,
  min_value numeric NULL,
  max_value numeric NULL,
  CONSTRAINT pk_rating_system PRIMARY KEY (id),
  CONSTRAINT uq_rating_system_code UNIQUE (code),
  CONSTRAINT fk_rating_system_sport_id FOREIGN KEY (sport_id) REFERENCES sport (id) ON DELETE RESTRICT,
  CONSTRAINT ck_rating_system_bounds_order CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

CREATE INDEX ix_rating_system_sport_id ON rating_system (sport_id);

COMMENT ON TABLE rating_system IS 'Official rating scales of a sport, numeric (chess Elo) or graded (tennis ranking) (BR-ACC-11).';
COMMENT ON COLUMN rating_system.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN rating_system.sport_id IS 'Sport this rating system belongs to.';
COMMENT ON COLUMN rating_system.code IS 'Stable English code, unique.';
COMMENT ON COLUMN rating_system.name IS 'English display name.';
COMMENT ON COLUMN rating_system.value_kind IS 'numeric (a number within bounds) or graded (a rating_grade row) (BR-ACC-11).';
COMMENT ON COLUMN rating_system.min_value IS 'Lowest allowed numeric value, NULL when unbounded.';
COMMENT ON COLUMN rating_system.max_value IS 'Highest allowed numeric value, NULL when unbounded.';

CREATE TABLE rating_grade (
  id uuid NOT NULL DEFAULT uuidv7(),
  rating_system_id uuid NOT NULL,
  code text NOT NULL,
  rank smallint NOT NULL,
  CONSTRAINT pk_rating_grade PRIMARY KEY (id),
  CONSTRAINT fk_rating_grade_rating_system_id FOREIGN KEY (rating_system_id)
    REFERENCES rating_system (id) ON DELETE CASCADE,
  CONSTRAINT uq_rating_grade_system_rank UNIQUE (rating_system_id, rank),
  CONSTRAINT uq_rating_grade_system_code UNIQUE (rating_system_id, code)
);

COMMENT ON TABLE rating_grade IS 'Ordered labels of a graded rating system, lowest rank first (BR-ACC-11).';
COMMENT ON COLUMN rating_grade.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN rating_grade.rating_system_id IS 'Graded rating system this label belongs to.';
COMMENT ON COLUMN rating_grade.code IS 'Label as published, for example 15/2 or NC; unique within the system.';
COMMENT ON COLUMN rating_grade.rank IS 'Position of the label, 1 is the lowest; unique within the system.';


-- migrate:down
DROP TABLE rating_grade;
DROP TABLE rating_system;
DROP TABLE skill_level;
DROP TABLE sport;
DROP TABLE municipality;
DROP TYPE rating_value_kind;
DROP TYPE sport_environment;
