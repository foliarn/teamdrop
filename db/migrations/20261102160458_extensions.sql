-- migrate:up
-- Extensions used by TeamDrop.
-- On a server, a superuser must create them first (see db/docker/initdb/03_extensions.sql).
-- For the owner role these statements are no-ops when the extensions already exist.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- migrate:down
-- extensions are managed by the database administrator; nothing to undo
