# TeamDrop database

PostgreSQL 18 + PostGIS 3.6 + h3-pg + pg_cron + pgTAP, run in Docker, with migrations managed by dbmate (run inside the container).

## Prerequisites

- Docker (Docker Desktop on Windows or macOS, or Docker Engine in WSL2 or Linux).
- Node.js 24 and npm, to run the scripts in the root `package.json`.
- Port `54329` free on your machine.
- Copy `.env.example` to `.env` at the repository root (dev values only, already filled in).

## Connection

| Database | Owner role | Port |
|---|---|---|
| `teamdrop_dev` | `teamdrop_owner` (migrations), `teamdrop_app` (API) | `54329` |
| `teamdrop_test` | same | `54329` |

Dev passwords are in `.env.example`. Never use them outside a local machine.

## Scripts (run from the repository root)

| Command | What it does |
|---|---|
| `npm run db:start` | Builds the image if needed and starts the `db` container in the background. |
| `npm run db:stop` | Stops and removes the `db` container (the data volume is kept). |
| `npm run db:migrate` | Applies pending migrations to `teamdrop_dev` and rewrites `db/schema.sql`. |
| `npm run db:rollback` | Rolls back the last migration on `teamdrop_dev`. |
| `npm run db:migrate:test` | Applies pending migrations to `teamdrop_test` (no schema dump). |
| `npm run db:reset:test` | Drops and recreates the `public` schema of `teamdrop_test`, re-creates the extensions and migrates it (`db/scripts/reset-test.sh`). |
| `npm run db:new -- <name>` | Creates a new timestamped migration file `db/migrations/<timestamp>_<name>.sql`. |
| `npm run db:test` | Runs the pgTAP tests in `db/tests/*.sql` against `teamdrop_test` with `pg_prove`. |
| `npm run db:fixtures` | Loads `db/seeds/reference/*.sql` then `db/seeds/fixtures/*.sql` into `teamdrop_dev`. |
| `npm run db:fixtures -- teamdrop_test` | Same, into another database (here `teamdrop_test`). |
| `npm run db:types` | Regenerates `apps/api/src/data/internal/generated/database.ts` from `teamdrop_dev` with kysely-codegen (owner URL read from `.env`). |
| `npm run db:jobs` | Installs pg_cron in `teamdrop_dev` and (re)schedules the database jobs (`db/scripts/schedule-jobs.sh`, idempotent). |
| `npm run db:generate -- --seed <seed>` | Generates a realistic dataset (10,000 users, 2 years by default) into `teamdrop_dev` (`db/generator/README.md`). |
| `npm run test:data` | Runs the data layer integration tests (`*.int-spec.ts`) against `teamdrop_test` (run `npm run db:reset:test` first). |

On Windows, Docker runs in WSL: the npm scripts call `docker compose`, so run them where Docker is available, or run the same command in WSL with `docker compose -f db/docker-compose.yml exec -T db bash /workspace/db/scripts/load-fixtures.sh teamdrop_test`.

## Files

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Service `db` (image `teamdrop-db:dev`, port `54329`, volume, healthcheck, dbmate environment). |
| `docker/Dockerfile` | Base image plus `h3-pg`, `pgTAP`, `pg_prove` and the pinned dbmate binary. |
| `docker/initdb/` | First-start init: roles, databases, extensions (runs once per empty volume). |
| `scripts/reset-test.sh` | Runs inside the container: resets `teamdrop_test` and migrates it. |
| `scripts/schedule-jobs.sh` | Runs inside the container as `postgres`: creates pg_cron in `teamdrop_dev` and schedules the jobs. |
| `scripts/load-fixtures.sh` | Runs inside the container: loads the seed folders into a database. |
| `migrations/` | dbmate migrations: extensions, roles, common functions, reference, accounts, social, events, attendance (batches 0 to 1D), messaging and notifications (2), cheers and moderation (3), badges (4), analytics (5), GDPR (6). |
| `schema.sql` | Schema dump written by dbmate (generated, do not edit). |
| `tests/` | pgTAP tests. |
| `generator/` | Deterministic dataset generator (BR-DATA-01, BR-DATA-02), also a Claude skill (`.claude/skills/teamdrop-dataset`). |
| `seeds/reference/`, `seeds/fixtures/` | Seed SQL files, loaded in alphabetical order. |

## Notes

- The init scripts run only when the data volume is empty. To start again from scratch: `docker compose -f db/docker-compose.yml down -v`, then `npm run db:start`.
- The first `db:start` builds the image (it downloads packages), so it can take a few minutes.

## Database jobs (pg_cron)

- pg_cron is preloaded by `docker-compose.yml` and runs in `teamdrop_dev` only (`cron.database_name`), in Europe/Paris time (`cron.timezone`). The test database has no scheduler: tests call the job functions directly.
- After `npm run db:start` (or a volume created before batch 5), run `npm run db:jobs` once. A container created before batch 5 must be recreated (`npm run db:start`) so the new `command` and image apply.
- Jobs: `analytics-nightly` (02:17, `refresh_analytics_nightly()`), `ranking-current-month` (hourly at :07, `refresh_user_city_activity()`), `gdpr-nightly` (03:43, `run_gdpr_jobs()`, batch 6). They run as `teamdrop_owner`.
- Check them: `SELECT * FROM cron.job;` and `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;` in `teamdrop_dev`.
