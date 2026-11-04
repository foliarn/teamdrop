-- Dev roles. Passwords are dev-only (see .env.example).
CREATE ROLE teamdrop_owner LOGIN CREATEROLE PASSWORD 'teamdrop_owner_dev';
CREATE ROLE teamdrop_app LOGIN PASSWORD 'teamdrop_app_dev';
CREATE ROLE teamdrop_readonly LOGIN PASSWORD 'teamdrop_readonly_dev';
