#!/usr/bin/env bash
# Runs inside the db container. Drops and recreates the public schema of teamdrop_test
# (as superuser), re-creates the extensions, then migrates the test database with dbmate.
set -euo pipefail

TEST_DB="teamdrop_test"

psql -X -v ON_ERROR_STOP=1 -U postgres -d "${TEST_DB}" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION teamdrop_owner;

CREATE EXTENSION postgis;
CREATE EXTENSION postgis_raster;
CREATE EXTENSION h3;
CREATE EXTENSION h3_postgis;
CREATE EXTENSION pgcrypto;
CREATE EXTENSION citext;
CREATE EXTENSION pg_trgm;
CREATE EXTENSION unaccent;
CREATE EXTENSION btree_gist;
CREATE EXTENSION pgtap;
SQL

dbmate --env TEST_DATABASE_URL --no-dump-schema up
