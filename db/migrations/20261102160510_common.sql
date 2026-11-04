-- migrate:up
-- Shared trigger function: keeps updated_at current on every UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS 'Trigger function that sets updated_at to now() on UPDATE.';

-- Immutable wrapper around unaccent, usable in indexes (unaccent itself is not immutable).
CREATE FUNCTION immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

COMMENT ON FUNCTION immutable_unaccent(text) IS 'Immutable wrapper around unaccent, for use in indexes.';


-- migrate:down
DROP FUNCTION immutable_unaccent(text);
DROP FUNCTION set_updated_at();
