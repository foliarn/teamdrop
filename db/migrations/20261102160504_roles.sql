-- migrate:up
-- Application and read-only roles, with default privileges for tables created by teamdrop_owner (BR-TECH-07).
-- Roles are created NOLOGIN here only if missing: the dev init script creates them with LOGIN.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teamdrop_app') THEN
    CREATE ROLE teamdrop_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teamdrop_readonly') THEN
    CREATE ROLE teamdrop_readonly NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO teamdrop_app, teamdrop_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teamdrop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO teamdrop_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO teamdrop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO teamdrop_app, teamdrop_readonly;


-- migrate:down
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM teamdrop_app, teamdrop_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM teamdrop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  REVOKE SELECT ON TABLES FROM teamdrop_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE teamdrop_owner IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM teamdrop_app;

REVOKE USAGE ON SCHEMA public FROM teamdrop_app, teamdrop_readonly;
