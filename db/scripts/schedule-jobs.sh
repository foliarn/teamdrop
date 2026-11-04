#!/usr/bin/env bash
# Runs inside the db container, as the postgres superuser. Installs pg_cron in teamdrop_dev (the cron database, see
# docker-compose.yml) and (re)schedules the database jobs (DB-JOB). Idempotent: cron.schedule_in_database replaces a
# job with the same name. Jobs run as teamdrop_owner, in Europe/Paris time (cron.timezone).
# Usage: schedule-jobs.sh
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 -U postgres -d teamdrop_dev <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- BR-STA-09: heatmap, trends and back-office statistics nightly; the current month's ranking hourly.
SELECT cron.schedule_in_database('analytics-nightly', '17 2 * * *',
  'SELECT refresh_analytics_nightly()', 'teamdrop_dev', 'teamdrop_owner');
SELECT cron.schedule_in_database('ranking-current-month', '7 * * * *',
  'SELECT refresh_user_city_activity()', 'teamdrop_dev', 'teamdrop_owner');

-- Jobs of later batches are added below when their functions exist.
DO $$
BEGIN
  IF to_regprocedure('run_gdpr_jobs()') IS NOT NULL THEN
    -- BR-GDP-03, BR-GDP-08, BR-GDP-09, BR-MSG-05: erasures, inactivity and retention purges, nightly.
    PERFORM cron.schedule_in_database('gdpr-nightly', '43 3 * * *',
      'SELECT run_gdpr_jobs()', 'teamdrop_dev', 'teamdrop_owner');
  END IF;
END
$$;

SELECT jobname, schedule, command, username FROM cron.job ORDER BY jobname;
SQL
