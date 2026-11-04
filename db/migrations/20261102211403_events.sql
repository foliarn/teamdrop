-- migrate:up
-- Events, occurrences, venues, registrations and guests (batch 1C, BR-EVT-*, BR-REG-*).

CREATE TYPE registration_mode AS ENUM ('automatic', 'approval');
CREATE TYPE event_visibility AS ENUM ('public', 'circle_priority', 'circle_only', 'community_only');
CREATE TYPE event_status AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE occurrence_status AS ENUM ('scheduled', 'ongoing', 'completed', 'cancelled');
CREATE TYPE registration_status AS ENUM ('pending_approval', 'confirmed', 'waitlisted', 'declined', 'cancelled', 'removed');
CREATE TYPE attendance_status AS ENUM ('attended', 'no_show', 'excused');

-- ---------------------------------------------------------------------------
-- venue
-- ---------------------------------------------------------------------------
CREATE TABLE venue (
  id uuid NOT NULL DEFAULT uuidv7(),
  name text NOT NULL,
  address text NOT NULL,
  municipality_id uuid NOT NULL,
  location geography(Point) NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  created_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_venue PRIMARY KEY (id),
  CONSTRAINT fk_venue_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE RESTRICT,
  CONSTRAINT fk_venue_created_by_id FOREIGN KEY (created_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL
);

CREATE INDEX ix_venue_location ON venue USING gist (location);
CREATE INDEX ix_venue_name_trgm ON venue USING gin (immutable_unaccent(name) gin_trgm_ops);
CREATE INDEX ix_venue_municipality_id ON venue (municipality_id);
CREATE INDEX ix_venue_created_by_id ON venue (created_by_id);

COMMENT ON TABLE venue IS 'A saved, reusable place for events. Public by default, can be private (BR-EVT-08).';
COMMENT ON COLUMN venue.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN venue.name IS 'Name of the venue, searchable with trigram matching (BR-TECH-10).';
COMMENT ON COLUMN venue.address IS 'Text address of the venue (BR-EVT-08).';
COMMENT ON COLUMN venue.municipality_id IS 'Municipality or arrondissement of the venue (BR-ACC-19).';
COMMENT ON COLUMN venue.location IS 'GPS point of the venue (WGS 84 geography, BR-EVT-08).';
COMMENT ON COLUMN venue.is_private IS 'When true, only the creator sees the venue in searches (BR-EVT-08).';
COMMENT ON COLUMN venue.created_by_id IS 'Creator of the venue; NULL after erasure of the creator (BR-GDP-04).';
COMMENT ON COLUMN venue.created_at IS 'When the venue was created.';

-- ---------------------------------------------------------------------------
-- event
-- ---------------------------------------------------------------------------
CREATE TABLE event (
  id uuid NOT NULL DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  community_id uuid NULL,
  sport_id uuid NOT NULL,
  title text NOT NULL,
  description text NULL,
  skill_level_min_id uuid NOT NULL,
  skill_level_max_id uuid NOT NULL,
  adults_only boolean NOT NULL DEFAULT false,
  min_participants int NULL,
  max_participants int NOT NULL,
  owner_counts_toward_capacity boolean NOT NULL DEFAULT true,
  registration_mode registration_mode NOT NULL DEFAULT 'automatic',
  visibility event_visibility NOT NULL DEFAULT 'public',
  circle_priority_hours int NULL,
  venue_id uuid NULL,
  address text NOT NULL,
  municipality_id uuid NOT NULL,
  location geography(Point) NOT NULL,
  location_hidden boolean NOT NULL DEFAULT false,
  start_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes int NOT NULL,
  time_zone text NOT NULL DEFAULT 'Europe/Paris',
  recurrence_rule text NULL,
  recurrence_until date NULL,
  recurrence_count int NULL,
  status event_status NOT NULL DEFAULT 'draft',
  published_at timestamptz NULL,
  significant_change_at timestamptz NULL,
  split_from_event_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_event PRIMARY KEY (id),
  CONSTRAINT fk_event_owner_id FOREIGN KEY (owner_id)
    REFERENCES user_account (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_community_id FOREIGN KEY (community_id)
    REFERENCES community (id) ON DELETE SET NULL,
  CONSTRAINT fk_event_sport_id FOREIGN KEY (sport_id)
    REFERENCES sport (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_skill_level_min_id FOREIGN KEY (skill_level_min_id)
    REFERENCES skill_level (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_skill_level_max_id FOREIGN KEY (skill_level_max_id)
    REFERENCES skill_level (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_venue_id FOREIGN KEY (venue_id)
    REFERENCES venue (id) ON DELETE SET NULL,
  CONSTRAINT fk_event_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_split_from_event_id FOREIGN KEY (split_from_event_id)
    REFERENCES event (id) ON DELETE SET NULL,
  CONSTRAINT ck_event_max_participants CHECK (max_participants >= 1),
  CONSTRAINT ck_event_min_participants CHECK (
    min_participants IS NULL OR (min_participants >= 1 AND min_participants <= max_participants)
  ),
  CONSTRAINT ck_event_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT ck_event_circle_priority_hours CHECK (
    ((visibility = 'circle_priority') = (circle_priority_hours IS NOT NULL))
    AND (circle_priority_hours IS NULL OR circle_priority_hours > 0)
  ),
  CONSTRAINT ck_event_community_only_requires_community CHECK (
    visibility <> 'community_only' OR community_id IS NOT NULL
  ),
  CONSTRAINT ck_event_recurrence_end CHECK (
    NOT (recurrence_until IS NOT NULL AND recurrence_count IS NOT NULL)
  ),
  CONSTRAINT ck_event_recurrence_fields CHECK (
    recurrence_rule IS NOT NULL OR (recurrence_until IS NULL AND recurrence_count IS NULL)
  ),
  CONSTRAINT ck_event_recurrence_count_positive CHECK (recurrence_count IS NULL OR recurrence_count >= 1),
  CONSTRAINT ck_event_published_at CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE INDEX ix_event_location ON event USING gist (location);
CREATE INDEX ix_event_title_trgm ON event USING gin (immutable_unaccent(title) gin_trgm_ops);
CREATE INDEX ix_event_owner_id ON event (owner_id);
CREATE INDEX ix_event_community_id ON event (community_id);
CREATE INDEX ix_event_sport_id ON event (sport_id);
CREATE INDEX ix_event_skill_level_min_id ON event (skill_level_min_id);
CREATE INDEX ix_event_skill_level_max_id ON event (skill_level_max_id);
CREATE INDEX ix_event_venue_id ON event (venue_id);
CREATE INDEX ix_event_municipality_id ON event (municipality_id);
CREATE INDEX ix_event_split_from_event_id ON event (split_from_event_id);
CREATE INDEX ix_event_published ON event (sport_id) WHERE status = 'published';

CREATE TRIGGER trg_event_set_updated_at
  BEFORE UPDATE ON event
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE event IS 'Template of a recurring or one-off activity: sport, level range, capacity, visibility, place and time (BR-EVT-01, BR-EVT-02).';
COMMENT ON COLUMN event.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN event.owner_id IS 'The single owner, who can transfer ownership (BR-EVT-20). Erasure transfers or cancels first (BR-GDP-03).';
COMMENT ON COLUMN event.community_id IS 'Community that organizes the event, NULL for a user event (BR-SOC-10).';
COMMENT ON COLUMN event.sport_id IS 'The sport, exactly one per event (BR-EVT-01).';
COMMENT ON COLUMN event.title IS 'Title of the event, searchable with trigram matching (BR-TECH-10).';
COMMENT ON COLUMN event.description IS 'Free text description, equipment included (BR-EVT-11).';
COMMENT ON COLUMN event.skill_level_min_id IS 'Lowest accepted self-declared level (BR-EVT-01, BR-ACC-10).';
COMMENT ON COLUMN event.skill_level_max_id IS 'Highest accepted self-declared level (BR-EVT-01, BR-ACC-10).';
COMMENT ON COLUMN event.adults_only IS 'When true, minors (15 to 17) cannot register (BR-EVT-11).';
COMMENT ON COLUMN event.min_participants IS 'Optional minimum number of participants; nothing happens automatically below it (BR-EVT-27).';
COMMENT ON COLUMN event.max_participants IS 'Maximum number of participants, guests included (BR-EVT-01, BR-REG-05).';
COMMENT ON COLUMN event.owner_counts_toward_capacity IS 'Whether the owner plays and takes a spot (BR-EVT-21).';
COMMENT ON COLUMN event.registration_mode IS 'automatic or approval by an organizer (BR-REG-03).';
COMMENT ON COLUMN event.visibility IS 'public, circle_priority, circle_only or community_only (BR-EVT-23).';
COMMENT ON COLUMN event.circle_priority_hours IS 'Hours after publication before public visibility, set when visibility is circle_priority (BR-EVT-23).';
COMMENT ON COLUMN event.venue_id IS 'Saved venue the event takes place at, NULL when the venue was deleted or not used (BR-EVT-08).';
COMMENT ON COLUMN event.address IS 'Text address of the event, copied from the venue when one is used (BR-EVT-08).';
COMMENT ON COLUMN event.municipality_id IS 'Municipality or arrondissement of the event, shown to viewers when the location is hidden (BR-EVT-09, BR-ACC-19).';
COMMENT ON COLUMN event.location IS 'GPS point of the event (WGS 84 geography, BR-EVT-08).';
COMMENT ON COLUMN event.location_hidden IS 'When true, non-registered viewers only see the municipality (BR-EVT-09).';
COMMENT ON COLUMN event.start_date IS 'Local date of the first occurrence, in time_zone (BR-TECH-05).';
COMMENT ON COLUMN event.start_time IS 'Local start time, in time_zone, kept across daylight saving changes (BR-TECH-05).';
COMMENT ON COLUMN event.duration_minutes IS 'Mandatory planned duration in minutes (BR-EVT-01).';
COMMENT ON COLUMN event.time_zone IS 'IANA time zone of the local schedule, Europe/Paris by default (BR-TECH-05).';
COMMENT ON COLUMN event.recurrence_rule IS 'RFC 5545 RRULE of the series, NULL for a one-off event (BR-EVT-02).';
COMMENT ON COLUMN event.recurrence_until IS 'Last local date of the series, inclusive (BR-EVT-02). Never set together with recurrence_count.';
COMMENT ON COLUMN event.recurrence_count IS 'Number of occurrences of the series (BR-EVT-02). Never set together with recurrence_until.';
COMMENT ON COLUMN event.status IS 'draft, published or cancelled (BR-EVT-24).';
COMMENT ON COLUMN event.published_at IS 'When the event was published; drives the circle_priority delay (BR-EVT-23, BR-EVT-24).';
COMMENT ON COLUMN event.significant_change_at IS 'Last significant change of the series schedule or place, used for the 24-hour withdrawal window (BR-EVT-07).';
COMMENT ON COLUMN event.split_from_event_id IS 'The series this one was split from by a this-and-following edit; NULL after erasure of the origin (BR-EVT-05).';
COMMENT ON COLUMN event.created_at IS 'When the event was created.';
COMMENT ON COLUMN event.updated_at IS 'Last update instant (maintained by trigger).';

-- ---------------------------------------------------------------------------
-- event_co_organizer
-- ---------------------------------------------------------------------------
CREATE TABLE event_co_organizer (
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  counts_toward_capacity boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL,
  CONSTRAINT pk_event_co_organizer PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_event_co_organizer_event_id FOREIGN KEY (event_id)
    REFERENCES event (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_co_organizer_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE INDEX ix_event_co_organizer_user_id ON event_co_organizer (user_id);

COMMENT ON TABLE event_co_organizer IS 'A co-organizer of an event, added by the owner (BR-EVT-20).';
COMMENT ON COLUMN event_co_organizer.event_id IS 'The event.';
COMMENT ON COLUMN event_co_organizer.user_id IS 'The co-organizer (BR-EVT-20).';
COMMENT ON COLUMN event_co_organizer.counts_toward_capacity IS 'Whether this co-organizer plays and takes a spot (BR-EVT-21).';
COMMENT ON COLUMN event_co_organizer.added_at IS 'When the co-organizer was added.';

-- ---------------------------------------------------------------------------
-- event_circle
-- ---------------------------------------------------------------------------
CREATE TABLE event_circle (
  event_id uuid NOT NULL,
  circle_id uuid NOT NULL,
  CONSTRAINT pk_event_circle PRIMARY KEY (event_id, circle_id),
  CONSTRAINT fk_event_circle_event_id FOREIGN KEY (event_id)
    REFERENCES event (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_circle_circle_id FOREIGN KEY (circle_id)
    REFERENCES circle (id) ON DELETE CASCADE
);

CREATE INDEX ix_event_circle_circle_id ON event_circle (circle_id);

COMMENT ON TABLE event_circle IS 'A circle targeted by an event whose visibility is circle_priority or circle_only (BR-EVT-23).';
COMMENT ON COLUMN event_circle.event_id IS 'The event.';
COMMENT ON COLUMN event_circle.circle_id IS 'The targeted circle (BR-EVT-23).';

-- ---------------------------------------------------------------------------
-- event_occurrence
-- ---------------------------------------------------------------------------
CREATE TABLE event_occurrence (
  id uuid NOT NULL DEFAULT uuidv7(),
  event_id uuid NOT NULL,
  original_starts_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_minutes int NULL,
  venue_id uuid NULL,
  address text NULL,
  municipality_id uuid NULL,
  location geography(Point) NULL,
  max_participants int NULL,
  status occurrence_status NOT NULL DEFAULT 'scheduled',
  significant_change_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  cancelled_by_id uuid NULL,
  cancellation_reason text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_event_occurrence PRIMARY KEY (id),
  CONSTRAINT uq_event_occurrence_event_original UNIQUE (event_id, original_starts_at),
  CONSTRAINT fk_event_occurrence_event_id FOREIGN KEY (event_id)
    REFERENCES event (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_occurrence_venue_id FOREIGN KEY (venue_id)
    REFERENCES venue (id) ON DELETE SET NULL,
  CONSTRAINT fk_event_occurrence_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE RESTRICT,
  CONSTRAINT fk_event_occurrence_cancelled_by_id FOREIGN KEY (cancelled_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT ck_event_occurrence_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT ck_event_occurrence_max_participants CHECK (max_participants IS NULL OR max_participants >= 1)
);

CREATE INDEX ix_event_occurrence_starts_at ON event_occurrence (starts_at);
CREATE INDEX ix_event_occurrence_location ON event_occurrence USING gist (location);
CREATE INDEX ix_event_occurrence_venue_id ON event_occurrence (venue_id);
CREATE INDEX ix_event_occurrence_municipality_id ON event_occurrence (municipality_id);
CREATE INDEX ix_event_occurrence_cancelled_by_id ON event_occurrence (cancelled_by_id);

CREATE TRIGGER trg_event_occurrence_set_updated_at
  BEFORE UPDATE ON event_occurrence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE event_occurrence IS 'One dated session of an event, created on first need (BR-EVT-03, BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN event_occurrence.event_id IS 'The event this occurrence belongs to (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.original_starts_at IS 'Start instant the date had in the schedule; identifies the occurrence with event_id (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.starts_at IS 'Effective start instant, equal to original_starts_at unless overridden for this date (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.duration_minutes IS 'Duration override for this date, NULL to inherit from the event (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.venue_id IS 'Venue override for this date, NULL to inherit (BR-EVT-04, BR-EVT-08).';
COMMENT ON COLUMN event_occurrence.address IS 'Address override for this date, NULL to inherit (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.municipality_id IS 'Municipality override for this date, NULL to inherit (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.location IS 'Location override for this date, NULL to inherit (BR-EVT-04).';
COMMENT ON COLUMN event_occurrence.max_participants IS 'Capacity override for this date, NULL to inherit (BR-EVT-04, BR-EVT-06).';
COMMENT ON COLUMN event_occurrence.status IS 'scheduled, ongoing, completed or cancelled (BR-EVT-24, BR-EVT-26).';
COMMENT ON COLUMN event_occurrence.significant_change_at IS 'Last significant change made to this date only (BR-EVT-07).';
COMMENT ON COLUMN event_occurrence.cancelled_at IS 'When the occurrence was cancelled.';
COMMENT ON COLUMN event_occurrence.cancelled_by_id IS 'Organizer who cancelled it; NULL after erasure of that user (BR-EVT-25).';
COMMENT ON COLUMN event_occurrence.cancellation_reason IS 'Free text reason given to the participants.';
COMMENT ON COLUMN event_occurrence.completed_at IS 'When the occurrence was completed (BR-EVT-26).';
COMMENT ON COLUMN event_occurrence.created_at IS 'When the occurrence row was created (materialization, BR-EVT-03).';
COMMENT ON COLUMN event_occurrence.updated_at IS 'Last update instant (maintained by trigger).';

-- ---------------------------------------------------------------------------
-- registration
-- ---------------------------------------------------------------------------
CREATE TABLE registration (
  id uuid NOT NULL DEFAULT uuidv7(),
  occurrence_id uuid NOT NULL,
  user_id uuid NULL,
  anonymous_key uuid NOT NULL DEFAULT gen_random_uuid(),
  status registration_status NOT NULL,
  is_late_cancellation boolean NOT NULL DEFAULT false,
  attendance attendance_status NULL,
  attendance_set_by_id uuid NULL,
  attendance_set_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  CONSTRAINT pk_registration PRIMARY KEY (id),
  CONSTRAINT fk_registration_occurrence_id FOREIGN KEY (occurrence_id)
    REFERENCES event_occurrence (id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_registration_attendance_set_by_id FOREIGN KEY (attendance_set_by_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT ck_registration_attendance_requires_confirmed CHECK (
    attendance IS NULL OR status = 'confirmed'
  )
);

CREATE UNIQUE INDEX uq_registration_active ON registration (occurrence_id, user_id)
  WHERE status IN ('pending_approval', 'confirmed', 'waitlisted') AND user_id IS NOT NULL;
CREATE INDEX ix_registration_user_id ON registration (user_id);
CREATE INDEX ix_registration_occurrence_status_created ON registration (occurrence_id, status, created_at, id);
CREATE INDEX ix_registration_attendance_set_by_id ON registration (attendance_set_by_id);

COMMENT ON TABLE registration IS 'A user place on one occurrence. At most one active registration per user and occurrence (BR-REG-01, BR-REG-02).';
COMMENT ON COLUMN registration.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN registration.occurrence_id IS 'The occurrence the place is for (BR-REG-01).';
COMMENT ON COLUMN registration.user_id IS 'The participant; NULL after erasure of the account (BR-GDP-04).';
COMMENT ON COLUMN registration.anonymous_key IS 'Random key that identifies the registration in anonymous statistics.';
COMMENT ON COLUMN registration.status IS 'pending_approval, confirmed, waitlisted, declined, cancelled or removed (BR-REG-02, BR-REG-04).';
COMMENT ON COLUMN registration.is_late_cancellation IS 'True when cancelled less than 24 hours before the start, frozen at cancellation (BR-REG-06).';
COMMENT ON COLUMN registration.attendance IS 'attended, no_show or excused, set by organizers; only for confirmed registrations (BR-ATT-01, BR-ATT-03).';
COMMENT ON COLUMN registration.attendance_set_by_id IS 'Organizer who set the attendance; NULL after erasure (BR-ATT-01).';
COMMENT ON COLUMN registration.attendance_set_at IS 'When the attendance was set (BR-ATT-01).';
COMMENT ON COLUMN registration.created_at IS 'When the registration was made; orders the waitlist (BR-REG-04).';
COMMENT ON COLUMN registration.confirmed_at IS 'When the place was confirmed, NULL while pending or waitlisted (BR-REG-04).';
COMMENT ON COLUMN registration.cancelled_at IS 'When the registration was cancelled, removed or otherwise ended.';

-- ---------------------------------------------------------------------------
-- registration_guest
-- ---------------------------------------------------------------------------
CREATE TABLE registration_guest (
  id uuid NOT NULL DEFAULT uuidv7(),
  registration_id uuid NOT NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_registration_guest PRIMARY KEY (id),
  CONSTRAINT fk_registration_guest_registration_id FOREIGN KEY (registration_id)
    REFERENCES registration (id) ON DELETE CASCADE
);

CREATE INDEX ix_registration_guest_registration_id ON registration_guest (registration_id);

COMMENT ON TABLE registration_guest IS 'A guest ("+1") brought by a registration. Counts toward capacity and global statistics only (BR-REG-05).';
COMMENT ON COLUMN registration_guest.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN registration_guest.registration_id IS 'The registration that brings the guest (BR-REG-05).';
COMMENT ON COLUMN registration_guest.display_name IS 'Name of the guest, erased when the occurrence is completed (BR-REG-05).';
COMMENT ON COLUMN registration_guest.created_at IS 'When the guest was added.';

-- migrate:down
DROP TABLE registration_guest;
DROP TABLE registration;
DROP TABLE event_occurrence;
DROP TABLE event_circle;
DROP TABLE event_co_organizer;
DROP TABLE event;
DROP TABLE venue;
DROP TYPE attendance_status;
DROP TYPE registration_status;
DROP TYPE occurrence_status;
DROP TYPE event_status;
DROP TYPE event_visibility;
DROP TYPE registration_mode;
