-- migrate:up
-- Analytics (batch 5): anonymous aggregates refreshed by the database (DB-JOB) and read by AnalyticsRepository
-- (BR-STA-06 to BR-STA-10, BR-GDP-06). The refresh functions recompute a recent window only: older rows are frozen, so
-- anonymous aggregates survive erasures and deletions (BR-GDP-06). Scheduling: db/scripts/schedule-jobs.sh (pg_cron,
-- nightly; current month ranking hourly, BR-STA-09). Calendar values are in Europe/Paris (BR-TECH-05).

-- ---------------------------------------------------------------------------
-- heatmap_cell
-- ---------------------------------------------------------------------------
CREATE TABLE heatmap_cell (
  h3_index h3index NOT NULL,
  resolution smallint NOT NULL,
  sport_id uuid NOT NULL,
  month date NOT NULL,
  day_of_week smallint NOT NULL,
  hour_of_day smallint NOT NULL,
  occurrence_count int NOT NULL,
  participant_count int NOT NULL,
  CONSTRAINT pk_heatmap_cell PRIMARY KEY (h3_index, resolution, sport_id, month, day_of_week, hour_of_day),
  CONSTRAINT fk_heatmap_cell_sport_id FOREIGN KEY (sport_id)
    REFERENCES sport (id) ON DELETE CASCADE,
  CONSTRAINT ck_heatmap_cell_resolution CHECK (resolution IN (6, 8, 9)),
  CONSTRAINT ck_heatmap_cell_month CHECK (extract(day FROM month) = 1),
  CONSTRAINT ck_heatmap_cell_day_of_week CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT ck_heatmap_cell_hour_of_day CHECK (hour_of_day BETWEEN 0 AND 23)
);

CREATE INDEX ix_heatmap_cell_lookup ON heatmap_cell (resolution, month, sport_id);
CREATE INDEX ix_heatmap_cell_sport_id ON heatmap_cell (sport_id);

COMMENT ON TABLE heatmap_cell IS 'Held occurrences per H3 hexagon, sport, month, weekday and hour (BR-STA-07). Anonymous: never deleted on erasure (BR-GDP-06). Refreshed nightly.';
COMMENT ON COLUMN heatmap_cell.h3_index IS 'H3 cell of the occurrence location (BR-STA-07).';
COMMENT ON COLUMN heatmap_cell.resolution IS 'H3 resolution: 6 (France), 8 (city) or 9 (neighbourhood) (BR-STA-07).';
COMMENT ON COLUMN heatmap_cell.sport_id IS 'The sport.';
COMMENT ON COLUMN heatmap_cell.month IS 'First day of the month of the occurrence start, Europe/Paris.';
COMMENT ON COLUMN heatmap_cell.day_of_week IS 'ISO weekday of the start, 1 = Monday, Europe/Paris.';
COMMENT ON COLUMN heatmap_cell.hour_of_day IS 'Hour of the start, 0 to 23, Europe/Paris.';
COMMENT ON COLUMN heatmap_cell.occurrence_count IS 'Completed occurrences; a cell is shown only with at least 3 (BR-STA-07).';
COMMENT ON COLUMN heatmap_cell.participant_count IS 'Attended registrations plus their guests (BR-REG-05).';

-- ---------------------------------------------------------------------------
-- sport_activity_daily
-- ---------------------------------------------------------------------------
CREATE TABLE sport_activity_daily (
  municipality_id uuid NOT NULL,
  sport_id uuid NOT NULL,
  day date NOT NULL,
  occurrence_count int NOT NULL,
  participant_count int NOT NULL,
  CONSTRAINT pk_sport_activity_daily PRIMARY KEY (municipality_id, sport_id, day),
  CONSTRAINT fk_sport_activity_daily_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE CASCADE,
  CONSTRAINT fk_sport_activity_daily_sport_id FOREIGN KEY (sport_id)
    REFERENCES sport (id) ON DELETE CASCADE
);

CREATE INDEX ix_sport_activity_daily_day ON sport_activity_daily (day, sport_id);
CREATE INDEX ix_sport_activity_daily_sport_id ON sport_activity_daily (sport_id);

COMMENT ON TABLE sport_activity_daily IS 'Held occurrences per municipality, sport and day: popular sports and trends (BR-STA-08), back-office top sports and cities (BR-STA-10). Anonymous (BR-GDP-06).';
COMMENT ON COLUMN sport_activity_daily.municipality_id IS 'Municipality or arrondissement of the occurrence (BR-ACC-19).';
COMMENT ON COLUMN sport_activity_daily.sport_id IS 'The sport.';
COMMENT ON COLUMN sport_activity_daily.day IS 'Local date of the start, Europe/Paris.';
COMMENT ON COLUMN sport_activity_daily.occurrence_count IS 'Completed occurrences.';
COMMENT ON COLUMN sport_activity_daily.participant_count IS 'Attended registrations plus their guests (BR-REG-05).';

-- ---------------------------------------------------------------------------
-- user_city_activity
-- ---------------------------------------------------------------------------
CREATE TABLE user_city_activity (
  user_id uuid NOT NULL,
  municipality_id uuid NOT NULL,
  month date NOT NULL,
  sessions int NOT NULL,
  minutes int NOT NULL,
  CONSTRAINT pk_user_city_activity PRIMARY KEY (user_id, municipality_id, month),
  CONSTRAINT fk_user_city_activity_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_city_activity_municipality_id FOREIGN KEY (municipality_id)
    REFERENCES municipality (id) ON DELETE CASCADE,
  CONSTRAINT ck_user_city_activity_month CHECK (extract(day FROM month) = 1)
);

CREATE INDEX ix_user_city_activity_city_month ON user_city_activity (municipality_id, month);

COMMENT ON TABLE user_city_activity IS 'Completed sessions and planned minutes per user, city of the events and month, for city rankings (BR-STA-06). Users who hide from rankings are left out when reading. Current month refreshed hourly.';
COMMENT ON COLUMN user_city_activity.user_id IS 'The user; deleted with the account (per-user data, not anonymous).';
COMMENT ON COLUMN user_city_activity.municipality_id IS 'City of the events: arrondissements are grouped under their parent city (BR-ACC-19, BR-STA-06).';
COMMENT ON COLUMN user_city_activity.month IS 'First day of the month, Europe/Paris.';
COMMENT ON COLUMN user_city_activity.sessions IS 'Completed sessions (BR-STA-01).';
COMMENT ON COLUMN user_city_activity.minutes IS 'Planned minutes of those sessions (BR-STA-02).';

-- ---------------------------------------------------------------------------
-- platform_daily_stat
-- ---------------------------------------------------------------------------
CREATE TABLE platform_daily_stat (
  day date NOT NULL,
  signups int NOT NULL,
  active_users int NOT NULL,
  events_created int NOT NULL,
  occurrences_held int NOT NULL,
  occurrences_cancelled int NOT NULL,
  no_shows int NOT NULL,
  reports_opened int NOT NULL,
  reports_closed int NOT NULL,
  CONSTRAINT pk_platform_daily_stat PRIMARY KEY (day)
);

COMMENT ON TABLE platform_daily_stat IS 'Back-office statistics per day, Europe/Paris (BR-STA-10). Anonymous (BR-GDP-06). Refreshed nightly.';
COMMENT ON COLUMN platform_daily_stat.day IS 'Local date, Europe/Paris.';
COMMENT ON COLUMN platform_daily_stat.signups IS 'Accounts created that day.';
COMMENT ON COLUMN platform_daily_stat.active_users IS 'Users whose last activity was that day, measured by the nightly refresh after that day; the highest measure is kept.';
COMMENT ON COLUMN platform_daily_stat.events_created IS 'Events created that day.';
COMMENT ON COLUMN platform_daily_stat.occurrences_held IS 'Occurrences completed that started that day.';
COMMENT ON COLUMN platform_daily_stat.occurrences_cancelled IS 'Occurrences cancelled that day.';
COMMENT ON COLUMN platform_daily_stat.no_shows IS 'No-shows on occurrences that started that day.';
COMMENT ON COLUMN platform_daily_stat.reports_opened IS 'Reports filed that day.';
COMMENT ON COLUMN platform_daily_stat.reports_closed IS 'Reports resolved or dismissed that day.';

-- ---------------------------------------------------------------------------
-- Refresh functions (DB-JOB)
-- ---------------------------------------------------------------------------

-- Held occurrences since p_from (local date) with their effective place, local start and participants.
CREATE FUNCTION analytics_held_occurrences(p_from date)
RETURNS TABLE (
  occurrence_id uuid,
  sport_id uuid,
  local_start timestamp,
  municipality_id uuid,
  location geography,
  minutes int,
  participants int
)
LANGUAGE sql STABLE AS $$
  SELECT o.id, e.sport_id, (o.starts_at AT TIME ZONE 'Europe/Paris'),
    COALESCE(o.municipality_id, e.municipality_id), COALESCE(o.location, e.location),
    COALESCE(o.duration_minutes, e.duration_minutes),
    (
      SELECT count(*)::int + COALESCE(sum((SELECT count(*) FROM registration_guest g WHERE g.registration_id = r.id)), 0)::int
      FROM registration r
      WHERE r.occurrence_id = o.id AND r.status = 'confirmed' AND r.attendance = 'attended'
    )
  FROM event_occurrence o
  JOIN event e ON e.id = o.event_id
  WHERE o.status = 'completed'
    AND o.starts_at >= (p_from::timestamp AT TIME ZONE 'Europe/Paris')
$$;

COMMENT ON FUNCTION analytics_held_occurrences(date) IS 'Completed occurrences starting on or after a local date, with effective place, duration and participants including guests (BR-REG-05).';

CREATE FUNCTION refresh_heatmap(
  p_from date DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris') - interval '1 month'))::date
) RETURNS int
LANGUAGE plpgsql
SET client_min_messages = error
AS $$
DECLARE
  v_from date := date_trunc('month', p_from)::date;
  v_rows int;
BEGIN
  DELETE FROM heatmap_cell WHERE month >= v_from;
  INSERT INTO heatmap_cell (h3_index, resolution, sport_id, month, day_of_week, hour_of_day,
                            occurrence_count, participant_count)
  SELECT h3_lat_lng_to_cell(h.location, r.res), r.res, h.sport_id,
    date_trunc('month', h.local_start)::date, extract(isodow FROM h.local_start)::smallint,
    extract(hour FROM h.local_start)::smallint, count(*)::int, sum(h.participants)::int
  FROM analytics_held_occurrences(v_from) h
  CROSS JOIN (VALUES (6), (8), (9)) AS r(res)
  GROUP BY 1, 2, 3, 4, 5, 6;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION refresh_heatmap(date) IS 'Recomputes the heatmap from the month of p_from (default: previous month); older months are kept (BR-STA-07, BR-GDP-06).';

CREATE FUNCTION refresh_sport_activity_daily(
  p_from date DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date - 35)
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_rows int;
BEGIN
  DELETE FROM sport_activity_daily WHERE day >= p_from;
  INSERT INTO sport_activity_daily (municipality_id, sport_id, day, occurrence_count, participant_count)
  SELECT h.municipality_id, h.sport_id, h.local_start::date, count(*)::int, sum(h.participants)::int
  FROM analytics_held_occurrences(p_from) h
  GROUP BY 1, 2, 3;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION refresh_sport_activity_daily(date) IS 'Recomputes sport activity from p_from (default: the last 35 days); older days are kept (BR-STA-08, BR-GDP-06).';

CREATE FUNCTION refresh_user_city_activity(
  p_from date DEFAULT (date_trunc('month', now() AT TIME ZONE 'Europe/Paris'))::date
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_from date := date_trunc('month', p_from)::date;
  v_rows int;
BEGIN
  DELETE FROM user_city_activity WHERE month >= v_from;
  INSERT INTO user_city_activity (user_id, municipality_id, month, sessions, minutes)
  SELECT r.user_id, COALESCE(m.parent_municipality_id, m.id),
    date_trunc('month', o.starts_at AT TIME ZONE 'Europe/Paris')::date,
    count(*)::int, sum(COALESCE(o.duration_minutes, e.duration_minutes))::int
  FROM registration r
  JOIN event_occurrence o ON o.id = r.occurrence_id
  JOIN event e ON e.id = o.event_id
  JOIN municipality m ON m.id = COALESCE(o.municipality_id, e.municipality_id)
  WHERE r.user_id IS NOT NULL AND r.status = 'confirmed' AND r.attendance = 'attended'
    AND o.status = 'completed'
    AND o.starts_at >= (v_from::timestamp AT TIME ZONE 'Europe/Paris')
  GROUP BY 1, 2, 3;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION refresh_user_city_activity(date) IS 'Recomputes city ranking activity from the month of p_from (default: current month, hourly job) (BR-STA-06, BR-STA-09).';

CREATE FUNCTION refresh_platform_daily_stat(
  p_from date DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date - 7)
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_rows int;
BEGIN
  INSERT INTO platform_daily_stat (day, signups, active_users, events_created, occurrences_held,
                                   occurrences_cancelled, no_shows, reports_opened, reports_closed)
  SELECT d.day,
    (SELECT count(*) FROM user_account u WHERE (u.created_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM user_account u WHERE (u.last_active_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM event e WHERE (e.created_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM event_occurrence o
       WHERE o.status = 'completed' AND (o.starts_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM event_occurrence o
       WHERE o.status = 'cancelled' AND (o.cancelled_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM registration r JOIN event_occurrence o ON o.id = r.occurrence_id
       WHERE r.attendance = 'no_show' AND (o.starts_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM report rp WHERE (rp.created_at AT TIME ZONE 'Europe/Paris')::date = d.day),
    (SELECT count(*) FROM report rp WHERE (rp.closed_at AT TIME ZONE 'Europe/Paris')::date = d.day)
  FROM (
    SELECT g::date AS day
    FROM generate_series(p_from, (now() AT TIME ZONE 'Europe/Paris')::date - 1, interval '1 day') AS g
  ) d
  ON CONFLICT (day) DO UPDATE SET
    signups = excluded.signups,
    -- last_active_at keeps only the latest activity: the first measure after the day is the most complete.
    active_users = GREATEST(platform_daily_stat.active_users, excluded.active_users),
    events_created = excluded.events_created,
    occurrences_held = excluded.occurrences_held,
    occurrences_cancelled = excluded.occurrences_cancelled,
    no_shows = excluded.no_shows,
    reports_opened = excluded.reports_opened,
    reports_closed = excluded.reports_closed;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION refresh_platform_daily_stat(date) IS 'Recomputes the back-office statistics of the days from p_from to yesterday (default: the last 7 days) (BR-STA-10).';

CREATE FUNCTION refresh_analytics_nightly() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_heatmap();
  PERFORM refresh_sport_activity_daily();
  -- Attendance can still change after the end of a month: refresh the previous month too.
  PERFORM refresh_user_city_activity((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris') - interval '1 month'))::date);
  PERFORM refresh_platform_daily_stat();
END;
$$;

COMMENT ON FUNCTION refresh_analytics_nightly() IS 'Nightly job: heatmap, sport activity, rankings of the current and previous month, back-office statistics (BR-STA-09).';

-- migrate:down
DROP FUNCTION refresh_analytics_nightly();
DROP FUNCTION refresh_platform_daily_stat(date);
DROP FUNCTION refresh_user_city_activity(date);
DROP FUNCTION refresh_sport_activity_daily(date);
DROP FUNCTION refresh_heatmap(date);
DROP FUNCTION analytics_held_occurrences(date);
DROP TABLE platform_daily_stat;
DROP TABLE user_city_activity;
DROP TABLE sport_activity_daily;
DROP TABLE heatmap_cell;
