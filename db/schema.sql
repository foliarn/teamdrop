\restrict dbmate

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: h3; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS h3 WITH SCHEMA public;


--
-- Name: EXTENSION h3; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION h3 IS 'H3 bindings for PostgreSQL';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_raster; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_raster WITH SCHEMA public;


--
-- Name: EXTENSION postgis_raster; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_raster IS 'PostGIS raster types and functions';


--
-- Name: h3_postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS h3_postgis WITH SCHEMA public;


--
-- Name: EXTENSION h3_postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION h3_postgis IS 'H3 PostGIS integration';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: account_token_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_token_purpose AS ENUM (
    'email_verification',
    'password_reset'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'attended',
    'no_show',
    'excused'
);


--
-- Name: auth_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auth_provider AS ENUM (
    'password',
    'google'
);


--
-- Name: banned_identity_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.banned_identity_kind AS ENUM (
    'email',
    'google_subject'
);


--
-- Name: circle_invitation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.circle_invitation_status AS ENUM (
    'awaiting_admin',
    'awaiting_invitee',
    'accepted',
    'declined',
    'rejected_by_admin',
    'cancelled'
);


--
-- Name: circle_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.circle_role AS ENUM (
    'owner',
    'admin',
    'member'
);


--
-- Name: community_join_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.community_join_policy AS ENUM (
    'open',
    'on_request'
);


--
-- Name: community_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.community_role AS ENUM (
    'owner',
    'moderator',
    'member'
);


--
-- Name: conversation_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_kind AS ENUM (
    'occurrence',
    'circle',
    'community'
);


--
-- Name: dispute_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_status AS ENUM (
    'open',
    'upheld',
    'rejected'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'draft',
    'published',
    'cancelled'
);


--
-- Name: event_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_visibility AS ENUM (
    'public',
    'circle_priority',
    'circle_only',
    'community_only'
);


--
-- Name: follow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.follow_status AS ENUM (
    'pending',
    'accepted'
);


--
-- Name: gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender AS ENUM (
    'woman',
    'man',
    'non_binary',
    'prefer_not_to_say'
);


--
-- Name: invite_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invite_policy AS ENUM (
    'everyone',
    'friends',
    'nobody'
);


--
-- Name: join_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.join_request_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'cancelled'
);


--
-- Name: occurrence_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.occurrence_status AS ENUM (
    'scheduled',
    'ongoing',
    'completed',
    'cancelled'
);


--
-- Name: rating_value_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rating_value_kind AS ENUM (
    'numeric',
    'graded'
);


--
-- Name: registration_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registration_mode AS ENUM (
    'automatic',
    'approval'
);


--
-- Name: registration_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registration_status AS ENUM (
    'pending_approval',
    'confirmed',
    'waitlisted',
    'declined',
    'cancelled',
    'removed'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_status AS ENUM (
    'open',
    'assigned',
    'resolved',
    'dismissed'
);


--
-- Name: sanction_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sanction_kind AS ENUM (
    'warning',
    'temporary_ban',
    'permanent_ban',
    'content_removal'
);


--
-- Name: sport_environment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sport_environment AS ENUM (
    'indoor',
    'outdoor',
    'both'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'moderator',
    'admin'
);


--
-- Name: visibility_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.visibility_level AS ENUM (
    'public',
    'members',
    'friends',
    'only_me'
);


--
-- Name: create_circle_conversation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_circle_conversation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO conversation (kind, circle_id) VALUES ('circle', NEW.id);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION create_circle_conversation(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_circle_conversation() IS 'Creates the chat of a new circle (BR-SOC-08, BR-MSG-01).';


--
-- Name: create_community_conversation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_community_conversation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO conversation (kind, community_id) VALUES ('community', NEW.id);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION create_community_conversation(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_community_conversation() IS 'Creates the chat of a new community (BR-SOC-09, BR-MSG-01).';


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $_$;


--
-- Name: FUNCTION immutable_unaccent(text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.immutable_unaccent(text) IS 'Immutable wrapper around unaccent, for use in indexes.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION set_updated_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger function that sets updated_at to now() on UPDATE.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_token (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    purpose public.account_token_purpose NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE account_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account_token IS 'Single-use hashed tokens for email verification and password reset (BR-ACC-07).';


--
-- Name: COLUMN account_token.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN account_token.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.user_id IS 'Account the token belongs to.';


--
-- Name: COLUMN account_token.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.purpose IS 'What the token allows: email_verification or password_reset.';


--
-- Name: COLUMN account_token.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.token_hash IS 'SHA-256 hash of the raw token, unique (BR-ACC-04).';


--
-- Name: COLUMN account_token.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.expires_at IS 'Instant after which the token is refused.';


--
-- Name: COLUMN account_token.used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.used_at IS 'Instant the token was used, NULL while unused (single use).';


--
-- Name: COLUMN account_token.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_token.created_at IS 'Creation instant.';


--
-- Name: attendance_dispute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_dispute (
    id uuid DEFAULT uuidv7() NOT NULL,
    registration_id uuid NOT NULL,
    reason text NOT NULL,
    status public.dispute_status DEFAULT 'open'::public.dispute_status NOT NULL,
    resolved_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT ck_attendance_dispute_resolution CHECK (((status = 'open'::public.dispute_status) = (resolved_at IS NULL)))
);


--
-- Name: TABLE attendance_dispute; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.attendance_dispute IS 'A participant contests a no_show; a moderator upholds or rejects it. One dispute per registration (BR-ATT-02).';


--
-- Name: COLUMN attendance_dispute.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN attendance_dispute.registration_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.registration_id IS 'The disputed registration, at most one dispute per registration (BR-ATT-02). Deleted with the registration.';


--
-- Name: COLUMN attendance_dispute.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.reason IS 'Free text reason given by the participant (BR-ATT-02).';


--
-- Name: COLUMN attendance_dispute.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.status IS 'open until a moderator decides: upheld or rejected (BR-ATT-02).';


--
-- Name: COLUMN attendance_dispute.resolved_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.resolved_by_id IS 'Moderator who decided the dispute; NULL while open or after erasure of that moderator (BR-ATT-02, BR-GDP-04).';


--
-- Name: COLUMN attendance_dispute.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.created_at IS 'When the participant opened the dispute, inside the 7-day window (BR-ATT-02).';


--
-- Name: COLUMN attendance_dispute.resolved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attendance_dispute.resolved_at IS 'When the moderator decided, NULL while the dispute is open (BR-ATT-02).';


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT uuidv7() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_table text,
    target_id uuid,
    report_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_audit_log_details_object CHECK (((details IS NULL) OR (jsonb_typeof(details) = 'object'::text)))
);


--
-- Name: TABLE audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log IS 'Every moderator and admin action, and the circle admin and organizer actions without a dedicated column; kept 3 years (BR-MOD-05, BR-GDP-09).';


--
-- Name: COLUMN audit_log.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.id IS 'Primary key, UUID v7 (time-ordered).';


--
-- Name: COLUMN audit_log.actor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.actor_id IS 'Who acted; NULL after erasure.';


--
-- Name: COLUMN audit_log.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.action IS 'Stable action code, for example report.resolved or registration.removed.';


--
-- Name: COLUMN audit_log.target_table; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.target_table IS 'Table of the target row, if any.';


--
-- Name: COLUMN audit_log.target_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.target_id IS 'Id of the target row; no foreign key, so the entry outlives the target.';


--
-- Name: COLUMN audit_log.report_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.report_id IS 'Report the action belongs to, if any.';


--
-- Name: COLUMN audit_log.details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.details IS 'JSON object of ids and codes; never emails, birth dates, tokens or message bodies.';


--
-- Name: COLUMN audit_log.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.created_at IS 'When the action happened; purged after 3 years (BR-MOD-05).';


--
-- Name: auth_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_identity (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    provider public.auth_provider NOT NULL,
    provider_subject text,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT ck_auth_identity_credentials CHECK ((((provider = 'password'::public.auth_provider) AND (password_hash IS NOT NULL) AND (provider_subject IS NULL)) OR ((provider = 'google'::public.auth_provider) AND (provider_subject IS NOT NULL) AND (password_hash IS NULL))))
);


--
-- Name: TABLE auth_identity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auth_identity IS 'One login method of a user: email and password, or Google (BR-ACC-05).';


--
-- Name: COLUMN auth_identity.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN auth_identity.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.user_id IS 'Owner account; identities are deleted with the account.';


--
-- Name: COLUMN auth_identity.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.provider IS 'Login method: password or google (BR-ACC-05).';


--
-- Name: COLUMN auth_identity.provider_subject; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.provider_subject IS 'Google subject identifier, NULL for password identities; unique per provider (BR-ACC-05).';


--
-- Name: COLUMN auth_identity.password_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.password_hash IS 'argon2id hash of the password, NULL for Google identities (BR-TECH-11).';


--
-- Name: COLUMN auth_identity.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.created_at IS 'Creation instant of the login method.';


--
-- Name: COLUMN auth_identity.last_used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_identity.last_used_at IS 'Last instant this login method was used, NULL when never used.';


--
-- Name: banned_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_identity (
    id uuid DEFAULT uuidv7() NOT NULL,
    identity_kind public.banned_identity_kind NOT NULL,
    identity_hash bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE banned_identity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.banned_identity IS 'Hashes of the identities of permanently banned users, kept after erasure to prevent signing up again (BR-MOD-04).';


--
-- Name: COLUMN banned_identity.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banned_identity.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN banned_identity.identity_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banned_identity.identity_kind IS 'email or google_subject (BR-MOD-04).';


--
-- Name: COLUMN banned_identity.identity_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banned_identity.identity_hash IS 'Keyed HMAC-SHA256 of the normalized email (same as user_account.email_hash) or of the Google subject. Never the clear value.';


--
-- Name: COLUMN banned_identity.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banned_identity.created_at IS 'When the identity was banned.';


--
-- Name: cheer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheer (
    id uuid DEFAULT uuidv7() NOT NULL,
    occurrence_id uuid NOT NULL,
    giver_id uuid,
    recipient_id uuid NOT NULL,
    cheer_type_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cheer_not_self CHECK (((giver_id IS NULL) OR (giver_id <> recipient_id)))
);


--
-- Name: TABLE cheer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cheer IS 'A typed cheer from one participant to another after an occurrence; at most one per giver, recipient and occurrence (BR-SOC-11).';


--
-- Name: COLUMN cheer.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN cheer.occurrence_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.occurrence_id IS 'The completed occurrence both users attended (BR-SOC-11).';


--
-- Name: COLUMN cheer.giver_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.giver_id IS 'Who gave it, seen only by the recipient (BR-SOC-12); NULL after erasure of the giver, the recipient keeps it (BR-GDP-05).';


--
-- Name: COLUMN cheer.recipient_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.recipient_id IS 'Who received it (BR-SOC-11).';


--
-- Name: COLUMN cheer.cheer_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.cheer_type_id IS 'The cheer type; a type in use cannot be deleted.';


--
-- Name: COLUMN cheer.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer.created_at IS 'When the cheer was given; there is no deadline (BR-SOC-11).';


--
-- Name: cheer_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheer_type (
    id uuid DEFAULT uuidv7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    icon text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order smallint NOT NULL
);


--
-- Name: TABLE cheer_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cheer_type IS 'Reference list of cheer types, managed from the back office (BR-SOC-11, BR-TECH-12).';


--
-- Name: COLUMN cheer_type.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN cheer_type.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';


--
-- Name: COLUMN cheer_type.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';


--
-- Name: COLUMN cheer_type.icon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.icon IS 'Optional icon name or path.';


--
-- Name: COLUMN cheer_type.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.is_active IS 'Inactive types cannot be given any more; cheers already given keep them.';


--
-- Name: COLUMN cheer_type.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cheer_type.sort_order IS 'Display order, lowest first.';


--
-- Name: circle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circle (
    id uuid DEFAULT uuidv7() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE circle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.circle IS 'A private group of members with its own chat (BR-SOC-05, BR-SOC-08).';


--
-- Name: COLUMN circle.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN circle.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle.name IS 'Name of the circle.';


--
-- Name: COLUMN circle.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle.description IS 'Optional description of the circle.';


--
-- Name: COLUMN circle.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle.created_at IS 'When the circle was created.';


--
-- Name: circle_invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circle_invitation (
    id uuid DEFAULT uuidv7() NOT NULL,
    circle_id uuid NOT NULL,
    invitee_id uuid NOT NULL,
    inviter_id uuid,
    approved_by_id uuid,
    status public.circle_invitation_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT ck_circle_invitation_not_self CHECK (((inviter_id IS NULL) OR (inviter_id <> invitee_id)))
);


--
-- Name: TABLE circle_invitation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.circle_invitation IS 'An invitation to join a circle. Joining is by invitation only (BR-SOC-06).';


--
-- Name: COLUMN circle_invitation.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN circle_invitation.circle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.circle_id IS 'The circle the invitee is invited to.';


--
-- Name: COLUMN circle_invitation.invitee_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.invitee_id IS 'The invited user.';


--
-- Name: COLUMN circle_invitation.inviter_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.inviter_id IS 'The member who invited; kept as NULL after the inviter is erased (BR-GDP-04).';


--
-- Name: COLUMN circle_invitation.approved_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.approved_by_id IS 'The admin who approved a member invitation (BR-SOC-06); NULL after erasure of that admin.';


--
-- Name: COLUMN circle_invitation.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.status IS 'awaiting_admin, awaiting_invitee, accepted, declined, rejected_by_admin or cancelled (BR-SOC-06).';


--
-- Name: COLUMN circle_invitation.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.created_at IS 'When the invitation was created.';


--
-- Name: COLUMN circle_invitation.responded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_invitation.responded_at IS 'When the invitee, or an admin, answered the invitation.';


--
-- Name: circle_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circle_member (
    circle_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.circle_role NOT NULL,
    joined_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE circle_member; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.circle_member IS 'Membership of a user in a circle. The member list is private (BR-SOC-05).';


--
-- Name: COLUMN circle_member.circle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_member.circle_id IS 'The circle.';


--
-- Name: COLUMN circle_member.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_member.user_id IS 'The member.';


--
-- Name: COLUMN circle_member.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_member.role IS 'owner, admin or member. Exactly one owner per circle (BR-SOC-05).';


--
-- Name: COLUMN circle_member.joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.circle_member.joined_at IS 'When the user joined; ownership passes to the oldest admin, then member (BR-SOC-07).';


--
-- Name: community; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community (
    id uuid DEFAULT uuidv7() NOT NULL,
    name text NOT NULL,
    description text,
    join_policy public.community_join_policy NOT NULL,
    avatar_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE community; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.community IS 'A public group such as a club, a sport or a streamer, with its own chat (BR-SOC-09).';


--
-- Name: COLUMN community.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN community.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.name IS 'Name of the community; searched with pg_trgm and unaccent (BR-TECH-10).';


--
-- Name: COLUMN community.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.description IS 'Optional description of the community.';


--
-- Name: COLUMN community.join_policy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.join_policy IS 'open (anyone can join) or on_request (a moderator or owner approves) (BR-SOC-09).';


--
-- Name: COLUMN community.avatar_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.avatar_path IS 'Path of the community picture on the server disk.';


--
-- Name: COLUMN community.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community.created_at IS 'When the community was created.';


--
-- Name: community_join_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_join_request (
    id uuid DEFAULT uuidv7() NOT NULL,
    community_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.join_request_status NOT NULL,
    decided_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone
);


--
-- Name: TABLE community_join_request; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.community_join_request IS 'A request to join a community with the on_request policy (BR-SOC-09).';


--
-- Name: COLUMN community_join_request.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN community_join_request.community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.community_id IS 'The community the user asks to join.';


--
-- Name: COLUMN community_join_request.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.user_id IS 'The user asking to join.';


--
-- Name: COLUMN community_join_request.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.status IS 'pending, accepted, declined or cancelled (BR-SOC-09).';


--
-- Name: COLUMN community_join_request.decided_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.decided_by_id IS 'The owner or moderator who decided; NULL after erasure of that person (BR-GDP-04).';


--
-- Name: COLUMN community_join_request.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.created_at IS 'When the request was made.';


--
-- Name: COLUMN community_join_request.decided_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_join_request.decided_at IS 'When the request was accepted, declined or cancelled.';


--
-- Name: community_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_member (
    community_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.community_role NOT NULL,
    joined_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE community_member; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.community_member IS 'Membership of a user in a community (BR-SOC-09).';


--
-- Name: COLUMN community_member.community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_member.community_id IS 'The community.';


--
-- Name: COLUMN community_member.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_member.user_id IS 'The member.';


--
-- Name: COLUMN community_member.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_member.role IS 'owner, moderator or member. Exactly one owner per community (BR-SOC-09).';


--
-- Name: COLUMN community_member.joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.community_member.joined_at IS 'When the user joined; ownership passes to the oldest moderator, then member (BR-SOC-09).';


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    id uuid DEFAULT uuidv7() NOT NULL,
    kind public.conversation_kind NOT NULL,
    occurrence_id uuid,
    circle_id uuid,
    community_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_conversation_kind_target CHECK ((((kind = 'occurrence'::public.conversation_kind) = (occurrence_id IS NOT NULL)) AND ((kind = 'circle'::public.conversation_kind) = (circle_id IS NOT NULL)) AND ((kind = 'community'::public.conversation_kind) = (community_id IS NOT NULL)))),
    CONSTRAINT ck_conversation_one_target CHECK ((num_nonnulls(occurrence_id, circle_id, community_id) = 1))
);


--
-- Name: TABLE conversation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversation IS 'A chat attached to exactly one occurrence, circle or community (BR-MSG-01).';


--
-- Name: COLUMN conversation.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN conversation.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.kind IS 'occurrence, circle or community; must match the target column that is set (BR-MSG-01).';


--
-- Name: COLUMN conversation.occurrence_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.occurrence_id IS 'Occurrence of an occurrence chat, created on first need (BR-EVT-03, BR-MSG-01). Purged 1 year after the occurrence (BR-MSG-05).';


--
-- Name: COLUMN conversation.circle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.circle_id IS 'Circle of a circle chat, created with the circle (BR-SOC-08, BR-MSG-01). Deleted with the circle (BR-MSG-06).';


--
-- Name: COLUMN conversation.community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.community_id IS 'Community of a community chat, created with the community (BR-SOC-09, BR-MSG-01). Deleted with the community (BR-MSG-06).';


--
-- Name: COLUMN conversation.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation.created_at IS 'When the conversation was created.';


--
-- Name: conversation_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_member (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_message_id uuid,
    muted boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE conversation_member; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversation_member IS 'Per-user state in a conversation: read pointer and mute. Access itself is derived from circles, communities, organizers and registrations (BR-MSG-01, BR-MSG-02).';


--
-- Name: COLUMN conversation_member.conversation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_member.conversation_id IS 'The conversation.';


--
-- Name: COLUMN conversation_member.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_member.user_id IS 'The user.';


--
-- Name: COLUMN conversation_member.last_read_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_member.last_read_message_id IS 'Last message read by the user; gives unread counts and "seen by" (BR-MSG-02).';


--
-- Name: COLUMN conversation_member.muted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_member.muted IS 'When true, the user gets no push for this conversation but still sees unread counts (BR-NOT-01).';


--
-- Name: COLUMN conversation_member.joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_member.joined_at IS 'When the row was created (first read or mute).';


--
-- Name: event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event (
    id uuid DEFAULT uuidv7() NOT NULL,
    owner_id uuid NOT NULL,
    community_id uuid,
    sport_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    skill_level_min_id uuid NOT NULL,
    skill_level_max_id uuid NOT NULL,
    adults_only boolean DEFAULT false NOT NULL,
    min_participants integer,
    max_participants integer NOT NULL,
    owner_counts_toward_capacity boolean DEFAULT true NOT NULL,
    registration_mode public.registration_mode DEFAULT 'automatic'::public.registration_mode NOT NULL,
    visibility public.event_visibility DEFAULT 'public'::public.event_visibility NOT NULL,
    circle_priority_hours integer,
    venue_id uuid,
    address text NOT NULL,
    municipality_id uuid NOT NULL,
    location public.geography(Point,4326) NOT NULL,
    location_hidden boolean DEFAULT false NOT NULL,
    start_date date NOT NULL,
    start_time time without time zone NOT NULL,
    duration_minutes integer NOT NULL,
    time_zone text DEFAULT 'Europe/Paris'::text NOT NULL,
    recurrence_rule text,
    recurrence_until date,
    recurrence_count integer,
    status public.event_status DEFAULT 'draft'::public.event_status NOT NULL,
    published_at timestamp with time zone,
    significant_change_at timestamp with time zone,
    split_from_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_event_circle_priority_hours CHECK ((((visibility = 'circle_priority'::public.event_visibility) = (circle_priority_hours IS NOT NULL)) AND ((circle_priority_hours IS NULL) OR (circle_priority_hours > 0)))),
    CONSTRAINT ck_event_community_only_requires_community CHECK (((visibility <> 'community_only'::public.event_visibility) OR (community_id IS NOT NULL))),
    CONSTRAINT ck_event_duration_positive CHECK ((duration_minutes > 0)),
    CONSTRAINT ck_event_max_participants CHECK ((max_participants >= 1)),
    CONSTRAINT ck_event_min_participants CHECK (((min_participants IS NULL) OR ((min_participants >= 1) AND (min_participants <= max_participants)))),
    CONSTRAINT ck_event_published_at CHECK (((status = 'draft'::public.event_status) OR (published_at IS NOT NULL))),
    CONSTRAINT ck_event_recurrence_count_positive CHECK (((recurrence_count IS NULL) OR (recurrence_count >= 1))),
    CONSTRAINT ck_event_recurrence_end CHECK ((NOT ((recurrence_until IS NOT NULL) AND (recurrence_count IS NOT NULL)))),
    CONSTRAINT ck_event_recurrence_fields CHECK (((recurrence_rule IS NOT NULL) OR ((recurrence_until IS NULL) AND (recurrence_count IS NULL))))
);


--
-- Name: TABLE event; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event IS 'Template of a recurring or one-off activity: sport, level range, capacity, visibility, place and time (BR-EVT-01, BR-EVT-02).';


--
-- Name: COLUMN event.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN event.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.owner_id IS 'The single owner, who can transfer ownership (BR-EVT-20). Erasure transfers or cancels first (BR-GDP-03).';


--
-- Name: COLUMN event.community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.community_id IS 'Community that organizes the event, NULL for a user event (BR-SOC-10).';


--
-- Name: COLUMN event.sport_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.sport_id IS 'The sport, exactly one per event (BR-EVT-01).';


--
-- Name: COLUMN event.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.title IS 'Title of the event, searchable with trigram matching (BR-TECH-10).';


--
-- Name: COLUMN event.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.description IS 'Free text description, equipment included (BR-EVT-11).';


--
-- Name: COLUMN event.skill_level_min_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.skill_level_min_id IS 'Lowest accepted self-declared level (BR-EVT-01, BR-ACC-10).';


--
-- Name: COLUMN event.skill_level_max_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.skill_level_max_id IS 'Highest accepted self-declared level (BR-EVT-01, BR-ACC-10).';


--
-- Name: COLUMN event.adults_only; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.adults_only IS 'When true, minors (15 to 17) cannot register (BR-EVT-11).';


--
-- Name: COLUMN event.min_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.min_participants IS 'Optional minimum number of participants; nothing happens automatically below it (BR-EVT-27).';


--
-- Name: COLUMN event.max_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.max_participants IS 'Maximum number of participants, guests included (BR-EVT-01, BR-REG-05).';


--
-- Name: COLUMN event.owner_counts_toward_capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.owner_counts_toward_capacity IS 'Whether the owner plays and takes a spot (BR-EVT-21).';


--
-- Name: COLUMN event.registration_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.registration_mode IS 'automatic or approval by an organizer (BR-REG-03).';


--
-- Name: COLUMN event.visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.visibility IS 'public, circle_priority, circle_only or community_only (BR-EVT-23).';


--
-- Name: COLUMN event.circle_priority_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.circle_priority_hours IS 'Hours after publication before public visibility, set when visibility is circle_priority (BR-EVT-23).';


--
-- Name: COLUMN event.venue_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.venue_id IS 'Saved venue the event takes place at, NULL when the venue was deleted or not used (BR-EVT-08).';


--
-- Name: COLUMN event.address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.address IS 'Text address of the event, copied from the venue when one is used (BR-EVT-08).';


--
-- Name: COLUMN event.municipality_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.municipality_id IS 'Municipality or arrondissement of the event, shown to viewers when the location is hidden (BR-EVT-09, BR-ACC-19).';


--
-- Name: COLUMN event.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.location IS 'GPS point of the event (WGS 84 geography, BR-EVT-08).';


--
-- Name: COLUMN event.location_hidden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.location_hidden IS 'When true, non-registered viewers only see the municipality (BR-EVT-09).';


--
-- Name: COLUMN event.start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.start_date IS 'Local date of the first occurrence, in time_zone (BR-TECH-05).';


--
-- Name: COLUMN event.start_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.start_time IS 'Local start time, in time_zone, kept across daylight saving changes (BR-TECH-05).';


--
-- Name: COLUMN event.duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.duration_minutes IS 'Mandatory planned duration in minutes (BR-EVT-01).';


--
-- Name: COLUMN event.time_zone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.time_zone IS 'IANA time zone of the local schedule, Europe/Paris by default (BR-TECH-05).';


--
-- Name: COLUMN event.recurrence_rule; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.recurrence_rule IS 'RFC 5545 RRULE of the series, NULL for a one-off event (BR-EVT-02).';


--
-- Name: COLUMN event.recurrence_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.recurrence_until IS 'Last local date of the series, inclusive (BR-EVT-02). Never set together with recurrence_count.';


--
-- Name: COLUMN event.recurrence_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.recurrence_count IS 'Number of occurrences of the series (BR-EVT-02). Never set together with recurrence_until.';


--
-- Name: COLUMN event.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.status IS 'draft, published or cancelled (BR-EVT-24).';


--
-- Name: COLUMN event.published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.published_at IS 'When the event was published; drives the circle_priority delay (BR-EVT-23, BR-EVT-24).';


--
-- Name: COLUMN event.significant_change_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.significant_change_at IS 'Last significant change of the series schedule or place, used for the 24-hour withdrawal window (BR-EVT-07).';


--
-- Name: COLUMN event.split_from_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.split_from_event_id IS 'The series this one was split from by a this-and-following edit; NULL after erasure of the origin (BR-EVT-05).';


--
-- Name: COLUMN event.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.created_at IS 'When the event was created.';


--
-- Name: COLUMN event.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event.updated_at IS 'Last update instant (maintained by trigger).';


--
-- Name: event_circle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_circle (
    event_id uuid NOT NULL,
    circle_id uuid NOT NULL
);


--
-- Name: TABLE event_circle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_circle IS 'A circle targeted by an event whose visibility is circle_priority or circle_only (BR-EVT-23).';


--
-- Name: COLUMN event_circle.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_circle.event_id IS 'The event.';


--
-- Name: COLUMN event_circle.circle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_circle.circle_id IS 'The targeted circle (BR-EVT-23).';


--
-- Name: event_co_organizer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_co_organizer (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    counts_toward_capacity boolean DEFAULT false NOT NULL,
    added_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE event_co_organizer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_co_organizer IS 'A co-organizer of an event, added by the owner (BR-EVT-20).';


--
-- Name: COLUMN event_co_organizer.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_co_organizer.event_id IS 'The event.';


--
-- Name: COLUMN event_co_organizer.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_co_organizer.user_id IS 'The co-organizer (BR-EVT-20).';


--
-- Name: COLUMN event_co_organizer.counts_toward_capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_co_organizer.counts_toward_capacity IS 'Whether this co-organizer plays and takes a spot (BR-EVT-21).';


--
-- Name: COLUMN event_co_organizer.added_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_co_organizer.added_at IS 'When the co-organizer was added.';


--
-- Name: event_occurrence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_occurrence (
    id uuid DEFAULT uuidv7() NOT NULL,
    event_id uuid NOT NULL,
    original_starts_at timestamp with time zone NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    duration_minutes integer,
    venue_id uuid,
    address text,
    municipality_id uuid,
    location public.geography(Point,4326),
    max_participants integer,
    status public.occurrence_status DEFAULT 'scheduled'::public.occurrence_status NOT NULL,
    significant_change_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancelled_by_id uuid,
    cancellation_reason text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_event_occurrence_duration_positive CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0))),
    CONSTRAINT ck_event_occurrence_max_participants CHECK (((max_participants IS NULL) OR (max_participants >= 1)))
);


--
-- Name: TABLE event_occurrence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_occurrence IS 'One dated session of an event, created on first need (BR-EVT-03, BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN event_occurrence.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.event_id IS 'The event this occurrence belongs to (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.original_starts_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.original_starts_at IS 'Start instant the date had in the schedule; identifies the occurrence with event_id (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.starts_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.starts_at IS 'Effective start instant, equal to original_starts_at unless overridden for this date (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.duration_minutes IS 'Duration override for this date, NULL to inherit from the event (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.venue_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.venue_id IS 'Venue override for this date, NULL to inherit (BR-EVT-04, BR-EVT-08).';


--
-- Name: COLUMN event_occurrence.address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.address IS 'Address override for this date, NULL to inherit (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.municipality_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.municipality_id IS 'Municipality override for this date, NULL to inherit (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.location IS 'Location override for this date, NULL to inherit (BR-EVT-04).';


--
-- Name: COLUMN event_occurrence.max_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.max_participants IS 'Capacity override for this date, NULL to inherit (BR-EVT-04, BR-EVT-06).';


--
-- Name: COLUMN event_occurrence.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.status IS 'scheduled, ongoing, completed or cancelled (BR-EVT-24, BR-EVT-26).';


--
-- Name: COLUMN event_occurrence.significant_change_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.significant_change_at IS 'Last significant change made to this date only (BR-EVT-07).';


--
-- Name: COLUMN event_occurrence.cancelled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.cancelled_at IS 'When the occurrence was cancelled.';


--
-- Name: COLUMN event_occurrence.cancelled_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.cancelled_by_id IS 'Organizer who cancelled it; NULL after erasure of that user (BR-EVT-25).';


--
-- Name: COLUMN event_occurrence.cancellation_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.cancellation_reason IS 'Free text reason given to the participants.';


--
-- Name: COLUMN event_occurrence.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.completed_at IS 'When the occurrence was completed (BR-EVT-26).';


--
-- Name: COLUMN event_occurrence.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.created_at IS 'When the occurrence row was created (materialization, BR-EVT-03).';


--
-- Name: COLUMN event_occurrence.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_occurrence.updated_at IS 'Last update instant (maintained by trigger).';


--
-- Name: follow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow (
    follower_id uuid NOT NULL,
    followed_id uuid NOT NULL,
    status public.follow_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT ck_follow_not_self CHECK ((follower_id <> followed_id))
);


--
-- Name: TABLE follow; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.follow IS 'A follow from one account to another. Two accepted follows make the users friends (BR-SOC-01).';


--
-- Name: COLUMN follow.follower_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow.follower_id IS 'The user who follows (BR-SOC-01).';


--
-- Name: COLUMN follow.followed_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow.followed_id IS 'The user being followed (BR-SOC-01).';


--
-- Name: COLUMN follow.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow.status IS 'pending when the followed account is private and must approve the request (BR-ACC-14).';


--
-- Name: COLUMN follow.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow.created_at IS 'When the follow was requested.';


--
-- Name: COLUMN follow.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow.accepted_at IS 'When the follow was accepted; NULL while pending.';


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    id uuid DEFAULT uuidv7() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid,
    client_message_id uuid NOT NULL,
    reply_to_message_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    CONSTRAINT ck_message_body_max_length CHECK ((char_length(body) <= 4000)),
    CONSTRAINT ck_message_body_not_blank CHECK ((body ~ '[^[:space:]]'::text)),
    CONSTRAINT ck_message_not_reply_to_self CHECK (((reply_to_message_id IS NULL) OR (reply_to_message_id <> id)))
);


--
-- Name: TABLE message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.message IS 'A chat message. Hard deleted when removed (BR-MSG-02, BR-MSG-03).';


--
-- Name: COLUMN message.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.id IS 'Primary key, UUID v7: time-ordered, used for ordering, pagination and read pointers (BR-TECH-08).';


--
-- Name: COLUMN message.conversation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.conversation_id IS 'The conversation the message belongs to (BR-MSG-01).';


--
-- Name: COLUMN message.sender_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.sender_id IS 'Author; NULL after erasure, shown as "deleted user" (BR-GDP-04).';


--
-- Name: COLUMN message.client_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.client_message_id IS 'Id generated by the client, unique per sender: a re-sent message is deduplicated (BR-TECH-08).';


--
-- Name: COLUMN message.reply_to_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.reply_to_message_id IS 'Message this one replies to, in the same conversation; NULL when the target was deleted (BR-MSG-02).';


--
-- Name: COLUMN message.body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.body IS 'Text of the message: not blank, at most 4000 characters (BR-MSG-02). Never logged.';


--
-- Name: COLUMN message.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.created_at IS 'When the message was sent.';


--
-- Name: COLUMN message.edited_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message.edited_at IS 'When the author last edited the message, NULL if never edited (BR-MSG-02).';


--
-- Name: message_reaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reaction (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_message_reaction_emoji CHECK ((emoji = ANY (ARRAY['thumbs_up'::text, 'thumbs_down'::text, 'laugh'::text, 'surprised'::text, 'angry'::text, 'smile'::text, 'heart'::text])))
);


--
-- Name: TABLE message_reaction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.message_reaction IS 'A reaction of a user to a message (BR-MSG-02).';


--
-- Name: COLUMN message_reaction.message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message_reaction.message_id IS 'The message; reactions are deleted with it (BR-MSG-03).';


--
-- Name: COLUMN message_reaction.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message_reaction.user_id IS 'The user who reacted.';


--
-- Name: COLUMN message_reaction.emoji; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message_reaction.emoji IS 'Reaction code from the fixed list: thumbs_up, thumbs_down, laugh, surprised, angry, smile, heart. The front end shows the glyph (BR-MSG-02, BR-TECH-12).';


--
-- Name: COLUMN message_reaction.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.message_reaction.created_at IS 'When the reaction was added.';


--
-- Name: municipality; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.municipality (
    id uuid DEFAULT uuidv7() NOT NULL,
    insee_code character(5) NOT NULL,
    name text NOT NULL,
    department_code character varying(3) NOT NULL,
    population integer NOT NULL,
    center public.geography(Point,4326) NOT NULL,
    parent_municipality_id uuid,
    CONSTRAINT ck_municipality_not_own_parent CHECK ((parent_municipality_id <> id))
);


--
-- Name: TABLE municipality; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.municipality IS 'Metropolitan French municipalities and Paris, Lyon and Marseille arrondissements (BR-ACC-13, BR-ACC-19).';


--
-- Name: COLUMN municipality.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN municipality.insee_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.insee_code IS 'Official INSEE municipality code (5 characters), unique.';


--
-- Name: COLUMN municipality.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.name IS 'Official municipality or arrondissement name.';


--
-- Name: COLUMN municipality.department_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.department_code IS 'Department code (for example 75 or 2A).';


--
-- Name: COLUMN municipality.population; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.population IS 'Population of the municipality, 0 when unknown.';


--
-- Name: COLUMN municipality.center; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.center IS 'Center point of the municipality (WGS 84 geography).';


--
-- Name: COLUMN municipality.parent_municipality_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.municipality.parent_municipality_id IS 'City an arrondissement belongs to (BR-ACC-19); NULL for ordinary municipalities.';


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    notification_type_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT ck_notification_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text))
);


--
-- Name: TABLE notification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification IS 'An in-app notification, kept 90 days (BR-NOT-01, BR-GDP-09).';


--
-- Name: COLUMN notification.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.id IS 'Primary key, UUID v7 (time-ordered, used for pagination).';


--
-- Name: COLUMN notification.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.user_id IS 'The recipient.';


--
-- Name: COLUMN notification.notification_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.notification_type_id IS 'The notification type (BR-NOT-01).';


--
-- Name: COLUMN notification.payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.payload IS 'JSON object of ids needed to display the notification (event, occurrence, user, conversation). Never emails, birth dates, tokens or message bodies.';


--
-- Name: COLUMN notification.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.created_at IS 'When the notification was created; purged after 90 days (BR-GDP-09).';


--
-- Name: COLUMN notification.read_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification.read_at IS 'When the user read it, NULL while unread.';


--
-- Name: notification_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preference (
    user_id uuid NOT NULL,
    notification_type_id uuid NOT NULL,
    push_enabled boolean NOT NULL,
    in_app_enabled boolean NOT NULL
);


--
-- Name: TABLE notification_preference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preference IS 'A user override of the defaults of one notification type, per channel. No row means the type defaults (BR-NOT-01, BR-ACC-15).';


--
-- Name: COLUMN notification_preference.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preference.user_id IS 'The user.';


--
-- Name: COLUMN notification_preference.notification_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preference.notification_type_id IS 'The notification type; a type in use cannot be deleted.';


--
-- Name: COLUMN notification_preference.push_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preference.push_enabled IS 'Whether the user wants push notifications of this type (BR-NOT-01).';


--
-- Name: COLUMN notification_preference.in_app_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preference.in_app_enabled IS 'Whether the user wants in-app notifications of this type (BR-NOT-01).';


--
-- Name: notification_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_type (
    id uuid DEFAULT uuidv7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    default_push boolean NOT NULL,
    default_in_app boolean NOT NULL
);


--
-- Name: TABLE notification_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_type IS 'Reference list of notification types, managed from the back office (BR-NOT-01, BR-TECH-12).';


--
-- Name: COLUMN notification_type.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_type.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN notification_type.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_type.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';


--
-- Name: COLUMN notification_type.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_type.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';


--
-- Name: COLUMN notification_type.default_push; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_type.default_push IS 'Push channel value for users without a preference row (BR-NOT-01).';


--
-- Name: COLUMN notification_type.default_in_app; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_type.default_in_app IS 'In-app channel value for users without a preference row (BR-NOT-01).';


--
-- Name: push_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscription (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth_secret text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: TABLE push_subscription; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_subscription IS 'A Web Push subscription, one per device (unique endpoint) (BR-NOT-01).';


--
-- Name: COLUMN push_subscription.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN push_subscription.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.user_id IS 'The user currently logged in on the device.';


--
-- Name: COLUMN push_subscription.endpoint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.endpoint IS 'Push service URL of the device, unique: a device has one subscription (BR-NOT-01).';


--
-- Name: COLUMN push_subscription.p256dh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.p256dh IS 'Public key of the browser, used to encrypt the payload (Web Push).';


--
-- Name: COLUMN push_subscription.auth_secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.auth_secret IS 'Authentication secret of the browser (Web Push). Never logged.';


--
-- Name: COLUMN push_subscription.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.user_agent IS 'Optional browser description, to name the device in the settings.';


--
-- Name: COLUMN push_subscription.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.created_at IS 'When the subscription was saved.';


--
-- Name: COLUMN push_subscription.last_used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_subscription.last_used_at IS 'When a push was last sent to it, NULL if never.';


--
-- Name: rating_grade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rating_grade (
    id uuid DEFAULT uuidv7() NOT NULL,
    rating_system_id uuid NOT NULL,
    code text NOT NULL,
    rank smallint NOT NULL
);


--
-- Name: TABLE rating_grade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rating_grade IS 'Ordered labels of a graded rating system, lowest rank first (BR-ACC-11).';


--
-- Name: COLUMN rating_grade.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_grade.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN rating_grade.rating_system_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_grade.rating_system_id IS 'Graded rating system this label belongs to.';


--
-- Name: COLUMN rating_grade.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_grade.code IS 'Label as published, for example 15/2 or NC; unique within the system.';


--
-- Name: COLUMN rating_grade.rank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_grade.rank IS 'Position of the label, 1 is the lowest; unique within the system.';


--
-- Name: rating_system; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rating_system (
    id uuid DEFAULT uuidv7() NOT NULL,
    sport_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    value_kind public.rating_value_kind NOT NULL,
    min_value numeric,
    max_value numeric,
    CONSTRAINT ck_rating_system_bounds_order CHECK (((min_value IS NULL) OR (max_value IS NULL) OR (min_value <= max_value)))
);


--
-- Name: TABLE rating_system; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rating_system IS 'Official rating scales of a sport, numeric (chess Elo) or graded (tennis ranking) (BR-ACC-11).';


--
-- Name: COLUMN rating_system.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN rating_system.sport_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.sport_id IS 'Sport this rating system belongs to.';


--
-- Name: COLUMN rating_system.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.code IS 'Stable English code, unique.';


--
-- Name: COLUMN rating_system.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.name IS 'English display name.';


--
-- Name: COLUMN rating_system.value_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.value_kind IS 'numeric (a number within bounds) or graded (a rating_grade row) (BR-ACC-11).';


--
-- Name: COLUMN rating_system.min_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.min_value IS 'Lowest allowed numeric value, NULL when unbounded.';


--
-- Name: COLUMN rating_system.max_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rating_system.max_value IS 'Highest allowed numeric value, NULL when unbounded.';


--
-- Name: refresh_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_token (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    user_agent text,
    issued_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_id uuid
);


--
-- Name: TABLE refresh_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.refresh_token IS 'Hashed refresh tokens, rotated on use and grouped by family to detect reuse (BR-ACC-07, BR-TECH-11).';


--
-- Name: COLUMN refresh_token.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN refresh_token.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.user_id IS 'Owner account.';


--
-- Name: COLUMN refresh_token.family_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.family_id IS 'Rotation family: all tokens issued by one login share it (BR-TECH-11).';


--
-- Name: COLUMN refresh_token.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.token_hash IS 'SHA-256 hash of the raw token, unique (BR-ACC-04).';


--
-- Name: COLUMN refresh_token.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.user_agent IS 'User agent of the device that received the token, for the sessions list.';


--
-- Name: COLUMN refresh_token.issued_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.issued_at IS 'Instant the token was issued.';


--
-- Name: COLUMN refresh_token.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.expires_at IS 'Instant after which the token is refused.';


--
-- Name: COLUMN refresh_token.revoked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.revoked_at IS 'Instant the token was revoked, NULL while valid (BR-ACC-07).';


--
-- Name: COLUMN refresh_token.replaced_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_token.replaced_by_id IS 'Token that replaced this one on rotation, NULL for the last token of a family.';


--
-- Name: registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration (
    id uuid DEFAULT uuidv7() NOT NULL,
    occurrence_id uuid NOT NULL,
    user_id uuid,
    anonymous_key uuid DEFAULT gen_random_uuid() NOT NULL,
    status public.registration_status NOT NULL,
    is_late_cancellation boolean DEFAULT false NOT NULL,
    attendance public.attendance_status,
    attendance_set_by_id uuid,
    attendance_set_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT ck_registration_attendance_requires_confirmed CHECK (((attendance IS NULL) OR (status = 'confirmed'::public.registration_status)))
);


--
-- Name: TABLE registration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.registration IS 'A user place on one occurrence. At most one active registration per user and occurrence (BR-REG-01, BR-REG-02).';


--
-- Name: COLUMN registration.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN registration.occurrence_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.occurrence_id IS 'The occurrence the place is for (BR-REG-01).';


--
-- Name: COLUMN registration.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.user_id IS 'The participant; NULL after erasure of the account (BR-GDP-04).';


--
-- Name: COLUMN registration.anonymous_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.anonymous_key IS 'Random key that identifies the registration in anonymous statistics.';


--
-- Name: COLUMN registration.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.status IS 'pending_approval, confirmed, waitlisted, declined, cancelled or removed (BR-REG-02, BR-REG-04).';


--
-- Name: COLUMN registration.is_late_cancellation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.is_late_cancellation IS 'True when cancelled less than 24 hours before the start, frozen at cancellation (BR-REG-06).';


--
-- Name: COLUMN registration.attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.attendance IS 'attended, no_show or excused, set by organizers; only for confirmed registrations (BR-ATT-01, BR-ATT-03).';


--
-- Name: COLUMN registration.attendance_set_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.attendance_set_by_id IS 'Organizer who set the attendance; NULL after erasure (BR-ATT-01).';


--
-- Name: COLUMN registration.attendance_set_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.attendance_set_at IS 'When the attendance was set (BR-ATT-01).';


--
-- Name: COLUMN registration.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.created_at IS 'When the registration was made; orders the waitlist (BR-REG-04).';


--
-- Name: COLUMN registration.confirmed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.confirmed_at IS 'When the place was confirmed, NULL while pending or waitlisted (BR-REG-04).';


--
-- Name: COLUMN registration.cancelled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration.cancelled_at IS 'When the registration was cancelled, removed or otherwise ended.';


--
-- Name: registration_guest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_guest (
    id uuid DEFAULT uuidv7() NOT NULL,
    registration_id uuid NOT NULL,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE registration_guest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.registration_guest IS 'A guest ("+1") brought by a registration. Counts toward capacity and global statistics only (BR-REG-05).';


--
-- Name: COLUMN registration_guest.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration_guest.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN registration_guest.registration_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration_guest.registration_id IS 'The registration that brings the guest (BR-REG-05).';


--
-- Name: COLUMN registration_guest.display_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration_guest.display_name IS 'Name of the guest, erased when the occurrence is completed (BR-REG-05).';


--
-- Name: COLUMN registration_guest.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.registration_guest.created_at IS 'When the guest was added.';


--
-- Name: report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report (
    id uuid DEFAULT uuidv7() NOT NULL,
    reporter_id uuid,
    report_reason_id uuid NOT NULL,
    target_user_id uuid,
    target_event_id uuid,
    target_message_id uuid,
    details text,
    status public.report_status DEFAULT 'open'::public.report_status NOT NULL,
    assigned_moderator_id uuid,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT ck_report_assigned_at CHECK (((status = 'open'::public.report_status) OR (assigned_at IS NOT NULL) OR (status = 'dismissed'::public.report_status))),
    CONSTRAINT ck_report_at_most_one_target CHECK ((num_nonnulls(target_user_id, target_event_id, target_message_id) <= 1)),
    CONSTRAINT ck_report_closed_at CHECK (((status = ANY (ARRAY['resolved'::public.report_status, 'dismissed'::public.report_status])) = (closed_at IS NOT NULL)))
);


--
-- Name: TABLE report; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report IS 'A complaint about one user, event or message, handled by a moderator (BR-MOD-01, BR-MOD-02).';


--
-- Name: COLUMN report.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN report.reporter_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.reporter_id IS 'Who filed it; NULL after erasure, the report is kept (BR-GDP-04).';


--
-- Name: COLUMN report.report_reason_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.report_reason_id IS 'The reason (BR-MOD-01).';


--
-- Name: COLUMN report.target_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.target_user_id IS 'Reported user; NULL for another target or after erasure (BR-MOD-01, BR-GDP-04).';


--
-- Name: COLUMN report.target_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.target_event_id IS 'Reported event; NULL for another target or after deletion (BR-MOD-01).';


--
-- Name: COLUMN report.target_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.target_message_id IS 'Reported message, kept from the purge while the report is open (BR-MSG-05); NULL for another target or after deletion.';


--
-- Name: COLUMN report.details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.details IS 'Optional free text from the reporter.';


--
-- Name: COLUMN report.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.status IS 'open, assigned, resolved or dismissed (BR-MOD-02).';


--
-- Name: COLUMN report.assigned_moderator_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.assigned_moderator_id IS 'Moderator in charge (BR-MOD-02); NULL while open or after erasure.';


--
-- Name: COLUMN report.resolution_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.resolution_note IS 'What the moderator decided, written when closing.';


--
-- Name: COLUMN report.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.created_at IS 'When the report was filed.';


--
-- Name: COLUMN report.assigned_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.assigned_at IS 'When a moderator was last assigned.';


--
-- Name: COLUMN report.closed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report.closed_at IS 'When the report was resolved or dismissed; NULL while open or assigned.';


--
-- Name: report_reason; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_reason (
    id uuid DEFAULT uuidv7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order smallint NOT NULL
);


--
-- Name: TABLE report_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report_reason IS 'Reference list of report reasons, managed from the back office (BR-MOD-01, BR-TECH-12).';


--
-- Name: COLUMN report_reason.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_reason.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN report_reason.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_reason.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';


--
-- Name: COLUMN report_reason.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_reason.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';


--
-- Name: COLUMN report_reason.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_reason.is_active IS 'Inactive reasons cannot be chosen any more; reports already filed keep them.';


--
-- Name: COLUMN report_reason.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_reason.sort_order IS 'Display order, lowest first.';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: skill_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_level (
    id uuid DEFAULT uuidv7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    rank smallint NOT NULL,
    CONSTRAINT ck_skill_level_rank_positive CHECK ((rank >= 1))
);


--
-- Name: TABLE skill_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skill_level IS 'Shared self-declared skill scale: beginner, intermediate, advanced, expert (BR-ACC-10).';


--
-- Name: COLUMN skill_level.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN skill_level.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level.code IS 'Stable English code, unique (BR-TECH-12).';


--
-- Name: COLUMN skill_level.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level.name IS 'English display name.';


--
-- Name: COLUMN skill_level.rank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_level.rank IS 'Position on the scale, 1 is the lowest; unique.';


--
-- Name: sport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sport (
    id uuid DEFAULT uuidv7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_team_sport boolean NOT NULL,
    environment public.sport_environment NOT NULL,
    default_duration_minutes integer NOT NULL,
    default_min_participants integer,
    default_max_participants integer,
    icon text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_sport_default_duration_positive CHECK ((default_duration_minutes > 0)),
    CONSTRAINT ck_sport_default_max_participants CHECK (((default_max_participants IS NULL) OR (default_max_participants >= 1))),
    CONSTRAINT ck_sport_default_min_participants CHECK (((default_min_participants IS NULL) OR (default_min_participants >= 1))),
    CONSTRAINT ck_sport_default_participants_order CHECK (((default_min_participants IS NULL) OR (default_max_participants IS NULL) OR (default_min_participants <= default_max_participants)))
);


--
-- Name: TABLE sport; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sport IS 'Sports managed from the back office (BR-ACC-17).';


--
-- Name: COLUMN sport.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN sport.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.code IS 'Stable English code used by the code, unique (BR-TECH-12).';


--
-- Name: COLUMN sport.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.name IS 'English display name; the front end translates the code (BR-TECH-12).';


--
-- Name: COLUMN sport.is_team_sport; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.is_team_sport IS 'True for team sports, false for individual sports.';


--
-- Name: COLUMN sport.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.environment IS 'Where the sport is practised: indoor, outdoor or both.';


--
-- Name: COLUMN sport.default_duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.default_duration_minutes IS 'Default duration of a session in minutes, positive (BR-ACC-17).';


--
-- Name: COLUMN sport.default_min_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.default_min_participants IS 'Default minimum number of participants, NULL when not applicable (BR-ACC-17).';


--
-- Name: COLUMN sport.default_max_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.default_max_participants IS 'Default maximum number of participants, NULL when not applicable (BR-ACC-17).';


--
-- Name: COLUMN sport.icon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.icon IS 'Optional icon identifier.';


--
-- Name: COLUMN sport.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.is_active IS 'False hides the sport from new choices; existing data is kept (BR-ACC-17).';


--
-- Name: COLUMN sport.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sport.created_at IS 'Creation instant.';


--
-- Name: user_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_account (
    id uuid DEFAULT uuidv7() NOT NULL,
    username public.citext NOT NULL,
    email_ciphertext bytea NOT NULL,
    email_hash bytea NOT NULL,
    email_verified_at timestamp with time zone,
    first_name text NOT NULL,
    birth_date_ciphertext bytea NOT NULL,
    gender public.gender,
    municipality_id uuid NOT NULL,
    avatar_path text,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    inactivity_warned_at timestamp with time zone,
    deletion_requested_at timestamp with time zone
);


--
-- Name: TABLE user_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_account IS 'A TeamDrop member account. Email and birth date are encrypted (BR-ACC-04).';


--
-- Name: COLUMN user_account.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN user_account.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.username IS 'Public username, unique and case-insensitive (BR-ACC-02).';


--
-- Name: COLUMN user_account.email_ciphertext; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.email_ciphertext IS 'Normalized email encrypted with pgcrypto (BR-ACC-04).';


--
-- Name: COLUMN user_account.email_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.email_hash IS 'HMAC-SHA256 blind index of the normalized email, unique, used for lookups (BR-ACC-04).';


--
-- Name: COLUMN user_account.email_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.email_verified_at IS 'Instant the email was verified, NULL when not verified (BR-ACC-07).';


--
-- Name: COLUMN user_account.first_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.first_name IS 'First name shown on the profile (BR-ACC-01).';


--
-- Name: COLUMN user_account.birth_date_ciphertext; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.birth_date_ciphertext IS 'Birth date encrypted with pgcrypto; the minimum age is checked on creation (BR-ACC-03, BR-ACC-04).';


--
-- Name: COLUMN user_account.gender; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.gender IS 'Optional, informative only (BR-ACC-09).';


--
-- Name: COLUMN user_account.municipality_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.municipality_id IS 'Declared municipality or arrondissement (BR-ACC-13, BR-ACC-19).';


--
-- Name: COLUMN user_account.avatar_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.avatar_path IS 'Path of the profile photo on the server disk, NULL when none (BR-ACC-16).';


--
-- Name: COLUMN user_account.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.role IS 'Single role of the account: user, moderator or admin (BR-ACC-08).';


--
-- Name: COLUMN user_account.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.created_at IS 'Account creation instant.';


--
-- Name: COLUMN user_account.last_active_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.last_active_at IS 'Last activity instant, used for inactivity rules (BR-GDP-08).';


--
-- Name: COLUMN user_account.inactivity_warned_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.inactivity_warned_at IS 'Instant the inactivity warning was sent, NULL when not warned (BR-GDP-08).';


--
-- Name: COLUMN user_account.deletion_requested_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_account.deletion_requested_at IS 'Instant the deletion was requested; erasure runs after a 30-day grace period (BR-GDP-03).';


--
-- Name: user_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_availability (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    CONSTRAINT ck_user_availability_day_of_week CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT ck_user_availability_time_order CHECK ((start_time < end_time))
);


--
-- Name: TABLE user_availability; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_availability IS 'Recurring weekly availability slots in local time; slots of one user never overlap (BR-ACC-12).';


--
-- Name: COLUMN user_availability.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_availability.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN user_availability.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_availability.user_id IS 'Owner account.';


--
-- Name: COLUMN user_availability.day_of_week; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_availability.day_of_week IS 'ISO day of the week, 1 = Monday to 7 = Sunday (BR-ACC-12).';


--
-- Name: COLUMN user_availability.start_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_availability.start_time IS 'Local start time of the slot (Europe/Paris, BR-TECH-05).';


--
-- Name: COLUMN user_availability.end_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_availability.end_time IS 'Local end time of the slot, strictly after start_time (BR-ACC-12).';


--
-- Name: user_block; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_block (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_user_block_not_self CHECK ((blocker_id <> blocked_id))
);


--
-- Name: TABLE user_block; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_block IS 'A block set by one account on another. Blocking is total and mutual (BR-SOC-02).';


--
-- Name: COLUMN user_block.blocker_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_block.blocker_id IS 'The user who blocked (BR-SOC-02).';


--
-- Name: COLUMN user_block.blocked_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_block.blocked_id IS 'The user who is blocked (BR-SOC-02).';


--
-- Name: COLUMN user_block.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_block.created_at IS 'When the block was set.';


--
-- Name: user_rating; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_rating (
    user_id uuid NOT NULL,
    rating_system_id uuid NOT NULL,
    numeric_value numeric,
    rating_grade_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_user_rating_one_value CHECK ((num_nonnulls(numeric_value, rating_grade_id) = 1))
);


--
-- Name: TABLE user_rating; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_rating IS 'Official rating of a user in one rating system, numeric or graded, never both (BR-ACC-11).';


--
-- Name: COLUMN user_rating.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_rating.user_id IS 'Rated account.';


--
-- Name: COLUMN user_rating.rating_system_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_rating.rating_system_id IS 'Rating system of the value.';


--
-- Name: COLUMN user_rating.numeric_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_rating.numeric_value IS 'Numeric value for a numeric system, NULL for a graded system (BR-ACC-11).';


--
-- Name: COLUMN user_rating.rating_grade_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_rating.rating_grade_id IS 'Grade for a graded system, NULL for a numeric system (BR-ACC-11).';


--
-- Name: COLUMN user_rating.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_rating.updated_at IS 'Last update instant (maintained by trigger).';


--
-- Name: user_sanction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sanction (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    kind public.sanction_kind NOT NULL,
    reason text NOT NULL,
    report_id uuid,
    issued_by_id uuid,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_user_sanction_ends_at CHECK ((((kind = 'temporary_ban'::public.sanction_kind) = (ends_at IS NOT NULL)) AND ((ends_at IS NULL) OR (ends_at > starts_at)))),
    CONSTRAINT ck_user_sanction_reason_not_blank CHECK ((reason ~ '[^[:space:]]'::text))
);


--
-- Name: TABLE user_sanction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_sanction IS 'A sanction: warning, temporary ban, permanent ban or content removal (BR-MOD-03).';


--
-- Name: COLUMN user_sanction.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN user_sanction.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.user_id IS 'The sanctioned user.';


--
-- Name: COLUMN user_sanction.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.kind IS 'warning, temporary_ban, permanent_ban or content_removal (BR-MOD-03).';


--
-- Name: COLUMN user_sanction.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.reason IS 'Reason given by the moderator.';


--
-- Name: COLUMN user_sanction.report_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.report_id IS 'The report that led to it, if any.';


--
-- Name: COLUMN user_sanction.issued_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.issued_by_id IS 'Moderator who issued it; NULL after erasure.';


--
-- Name: COLUMN user_sanction.starts_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.starts_at IS 'When it takes effect.';


--
-- Name: COLUMN user_sanction.ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.ends_at IS 'End of a temporary ban (length chosen by the moderator, BR-MOD-03); NULL for every other kind.';


--
-- Name: COLUMN user_sanction.revoked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.revoked_at IS 'When a moderator lifted it early; NULL otherwise.';


--
-- Name: COLUMN user_sanction.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sanction.created_at IS 'When it was recorded.';


--
-- Name: user_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_setting (
    user_id uuid NOT NULL,
    profile_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    stats_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    badges_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    reliability_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    circles_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    history_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    follows_visibility public.visibility_level DEFAULT 'members'::public.visibility_level NOT NULL,
    is_private_account boolean DEFAULT false NOT NULL,
    hide_from_rankings boolean DEFAULT false NOT NULL,
    circle_invite_policy public.invite_policy DEFAULT 'everyone'::public.invite_policy NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_setting; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_setting IS 'Privacy and interaction settings of one account (BR-ACC-14, BR-ACC-15).';


--
-- Name: COLUMN user_setting.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.user_id IS 'Owner account, also the primary key (one settings row per account).';


--
-- Name: COLUMN user_setting.profile_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.profile_visibility IS 'Who can see the profile section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.stats_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.stats_visibility IS 'Who can see the statistics section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.badges_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.badges_visibility IS 'Who can see the badges section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.reliability_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.reliability_visibility IS 'Who can see the reliability section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.circles_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.circles_visibility IS 'Who can see the circles section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.history_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.history_visibility IS 'Who can see the event history section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.follows_visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.follows_visibility IS 'Who can see the follows section (BR-ACC-14).';


--
-- Name: COLUMN user_setting.is_private_account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.is_private_account IS 'When true, follow requests need approval (BR-ACC-14).';


--
-- Name: COLUMN user_setting.hide_from_rankings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.hide_from_rankings IS 'When true, the user is left out of city rankings (BR-ACC-15).';


--
-- Name: COLUMN user_setting.circle_invite_policy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.circle_invite_policy IS 'Who can invite the user to circles (BR-ACC-15).';


--
-- Name: COLUMN user_setting.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_setting.updated_at IS 'Last update instant (maintained by trigger).';


--
-- Name: user_sport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sport (
    user_id uuid NOT NULL,
    sport_id uuid NOT NULL,
    skill_level_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_sport; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_sport IS 'Sports declared by a user with a self-declared level, one level per sport (BR-ACC-10).';


--
-- Name: COLUMN user_sport.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sport.user_id IS 'Declaring account.';


--
-- Name: COLUMN user_sport.sport_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sport.sport_id IS 'Declared sport.';


--
-- Name: COLUMN user_sport.skill_level_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sport.skill_level_id IS 'Self-declared level on the shared scale (BR-ACC-10).';


--
-- Name: COLUMN user_sport.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sport.created_at IS 'Instant the sport was declared.';


--
-- Name: venue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue (
    id uuid DEFAULT uuidv7() NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    municipality_id uuid NOT NULL,
    location public.geography(Point,4326) NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    created_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE venue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.venue IS 'A saved, reusable place for events. Public by default, can be private (BR-EVT-08).';


--
-- Name: COLUMN venue.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.id IS 'Primary key, UUID v7.';


--
-- Name: COLUMN venue.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.name IS 'Name of the venue, searchable with trigram matching (BR-TECH-10).';


--
-- Name: COLUMN venue.address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.address IS 'Text address of the venue (BR-EVT-08).';


--
-- Name: COLUMN venue.municipality_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.municipality_id IS 'Municipality or arrondissement of the venue (BR-ACC-19).';


--
-- Name: COLUMN venue.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.location IS 'GPS point of the venue (WGS 84 geography, BR-EVT-08).';


--
-- Name: COLUMN venue.is_private; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.is_private IS 'When true, only the creator sees the venue in searches (BR-EVT-08).';


--
-- Name: COLUMN venue.created_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.created_by_id IS 'Creator of the venue; NULL after erasure of the creator (BR-GDP-04).';


--
-- Name: COLUMN venue.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.venue.created_at IS 'When the venue was created.';


--
-- Name: user_availability ex_user_availability_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT ex_user_availability_no_overlap EXCLUDE USING gist (user_id WITH =, day_of_week WITH =, tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) WITH &&);


--
-- Name: account_token pk_account_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_token
    ADD CONSTRAINT pk_account_token PRIMARY KEY (id);


--
-- Name: attendance_dispute pk_attendance_dispute; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_dispute
    ADD CONSTRAINT pk_attendance_dispute PRIMARY KEY (id);


--
-- Name: audit_log pk_audit_log; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT pk_audit_log PRIMARY KEY (id);


--
-- Name: auth_identity pk_auth_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identity
    ADD CONSTRAINT pk_auth_identity PRIMARY KEY (id);


--
-- Name: banned_identity pk_banned_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_identity
    ADD CONSTRAINT pk_banned_identity PRIMARY KEY (id);


--
-- Name: cheer pk_cheer; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT pk_cheer PRIMARY KEY (id);


--
-- Name: cheer_type pk_cheer_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer_type
    ADD CONSTRAINT pk_cheer_type PRIMARY KEY (id);


--
-- Name: circle pk_circle; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle
    ADD CONSTRAINT pk_circle PRIMARY KEY (id);


--
-- Name: circle_invitation pk_circle_invitation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_invitation
    ADD CONSTRAINT pk_circle_invitation PRIMARY KEY (id);


--
-- Name: circle_member pk_circle_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_member
    ADD CONSTRAINT pk_circle_member PRIMARY KEY (circle_id, user_id);


--
-- Name: community pk_community; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community
    ADD CONSTRAINT pk_community PRIMARY KEY (id);


--
-- Name: community_join_request pk_community_join_request; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_join_request
    ADD CONSTRAINT pk_community_join_request PRIMARY KEY (id);


--
-- Name: community_member pk_community_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_member
    ADD CONSTRAINT pk_community_member PRIMARY KEY (community_id, user_id);


--
-- Name: conversation pk_conversation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT pk_conversation PRIMARY KEY (id);


--
-- Name: conversation_member pk_conversation_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT pk_conversation_member PRIMARY KEY (conversation_id, user_id);


--
-- Name: event pk_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT pk_event PRIMARY KEY (id);


--
-- Name: event_circle pk_event_circle; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_circle
    ADD CONSTRAINT pk_event_circle PRIMARY KEY (event_id, circle_id);


--
-- Name: event_co_organizer pk_event_co_organizer; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_co_organizer
    ADD CONSTRAINT pk_event_co_organizer PRIMARY KEY (event_id, user_id);


--
-- Name: event_occurrence pk_event_occurrence; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT pk_event_occurrence PRIMARY KEY (id);


--
-- Name: follow pk_follow; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT pk_follow PRIMARY KEY (follower_id, followed_id);


--
-- Name: message pk_message; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT pk_message PRIMARY KEY (id);


--
-- Name: message_reaction pk_message_reaction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reaction
    ADD CONSTRAINT pk_message_reaction PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: municipality pk_municipality; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.municipality
    ADD CONSTRAINT pk_municipality PRIMARY KEY (id);


--
-- Name: notification pk_notification; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT pk_notification PRIMARY KEY (id);


--
-- Name: notification_preference pk_notification_preference; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preference
    ADD CONSTRAINT pk_notification_preference PRIMARY KEY (user_id, notification_type_id);


--
-- Name: notification_type pk_notification_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_type
    ADD CONSTRAINT pk_notification_type PRIMARY KEY (id);


--
-- Name: push_subscription pk_push_subscription; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT pk_push_subscription PRIMARY KEY (id);


--
-- Name: rating_grade pk_rating_grade; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_grade
    ADD CONSTRAINT pk_rating_grade PRIMARY KEY (id);


--
-- Name: rating_system pk_rating_system; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_system
    ADD CONSTRAINT pk_rating_system PRIMARY KEY (id);


--
-- Name: refresh_token pk_refresh_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_token
    ADD CONSTRAINT pk_refresh_token PRIMARY KEY (id);


--
-- Name: registration pk_registration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration
    ADD CONSTRAINT pk_registration PRIMARY KEY (id);


--
-- Name: registration_guest pk_registration_guest; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_guest
    ADD CONSTRAINT pk_registration_guest PRIMARY KEY (id);


--
-- Name: report pk_report; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT pk_report PRIMARY KEY (id);


--
-- Name: report_reason pk_report_reason; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_reason
    ADD CONSTRAINT pk_report_reason PRIMARY KEY (id);


--
-- Name: skill_level pk_skill_level; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT pk_skill_level PRIMARY KEY (id);


--
-- Name: sport pk_sport; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport
    ADD CONSTRAINT pk_sport PRIMARY KEY (id);


--
-- Name: user_account pk_user_account; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT pk_user_account PRIMARY KEY (id);


--
-- Name: user_availability pk_user_availability; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT pk_user_availability PRIMARY KEY (id);


--
-- Name: user_block pk_user_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_block
    ADD CONSTRAINT pk_user_block PRIMARY KEY (blocker_id, blocked_id);


--
-- Name: user_rating pk_user_rating; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rating
    ADD CONSTRAINT pk_user_rating PRIMARY KEY (user_id, rating_system_id);


--
-- Name: user_sanction pk_user_sanction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sanction
    ADD CONSTRAINT pk_user_sanction PRIMARY KEY (id);


--
-- Name: user_setting pk_user_setting; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_setting
    ADD CONSTRAINT pk_user_setting PRIMARY KEY (user_id);


--
-- Name: user_sport pk_user_sport; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sport
    ADD CONSTRAINT pk_user_sport PRIMARY KEY (user_id, sport_id);


--
-- Name: venue pk_venue; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue
    ADD CONSTRAINT pk_venue PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: account_token uq_account_token_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_token
    ADD CONSTRAINT uq_account_token_token_hash UNIQUE (token_hash);


--
-- Name: attendance_dispute uq_attendance_dispute_registration_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_dispute
    ADD CONSTRAINT uq_attendance_dispute_registration_id UNIQUE (registration_id);


--
-- Name: auth_identity uq_auth_identity_provider_subject; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identity
    ADD CONSTRAINT uq_auth_identity_provider_subject UNIQUE (provider, provider_subject);


--
-- Name: auth_identity uq_auth_identity_user_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identity
    ADD CONSTRAINT uq_auth_identity_user_provider UNIQUE (user_id, provider);


--
-- Name: banned_identity uq_banned_identity_kind_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_identity
    ADD CONSTRAINT uq_banned_identity_kind_hash UNIQUE (identity_kind, identity_hash);


--
-- Name: cheer uq_cheer_giver_recipient_occurrence; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT uq_cheer_giver_recipient_occurrence UNIQUE (giver_id, recipient_id, occurrence_id);


--
-- Name: cheer_type uq_cheer_type_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer_type
    ADD CONSTRAINT uq_cheer_type_code UNIQUE (code);


--
-- Name: conversation uq_conversation_circle_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT uq_conversation_circle_id UNIQUE (circle_id);


--
-- Name: conversation uq_conversation_community_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT uq_conversation_community_id UNIQUE (community_id);


--
-- Name: conversation uq_conversation_occurrence_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT uq_conversation_occurrence_id UNIQUE (occurrence_id);


--
-- Name: event_occurrence uq_event_occurrence_event_original; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT uq_event_occurrence_event_original UNIQUE (event_id, original_starts_at);


--
-- Name: message uq_message_sender_client_message_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT uq_message_sender_client_message_id UNIQUE (sender_id, client_message_id);


--
-- Name: municipality uq_municipality_insee_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.municipality
    ADD CONSTRAINT uq_municipality_insee_code UNIQUE (insee_code);


--
-- Name: notification_type uq_notification_type_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_type
    ADD CONSTRAINT uq_notification_type_code UNIQUE (code);


--
-- Name: push_subscription uq_push_subscription_endpoint; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT uq_push_subscription_endpoint UNIQUE (endpoint);


--
-- Name: rating_grade uq_rating_grade_system_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_grade
    ADD CONSTRAINT uq_rating_grade_system_code UNIQUE (rating_system_id, code);


--
-- Name: rating_grade uq_rating_grade_system_rank; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_grade
    ADD CONSTRAINT uq_rating_grade_system_rank UNIQUE (rating_system_id, rank);


--
-- Name: rating_system uq_rating_system_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_system
    ADD CONSTRAINT uq_rating_system_code UNIQUE (code);


--
-- Name: refresh_token uq_refresh_token_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_token
    ADD CONSTRAINT uq_refresh_token_token_hash UNIQUE (token_hash);


--
-- Name: report_reason uq_report_reason_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_reason
    ADD CONSTRAINT uq_report_reason_code UNIQUE (code);


--
-- Name: skill_level uq_skill_level_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT uq_skill_level_code UNIQUE (code);


--
-- Name: skill_level uq_skill_level_rank; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_level
    ADD CONSTRAINT uq_skill_level_rank UNIQUE (rank);


--
-- Name: sport uq_sport_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport
    ADD CONSTRAINT uq_sport_code UNIQUE (code);


--
-- Name: user_account uq_user_account_email_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT uq_user_account_email_hash UNIQUE (email_hash);


--
-- Name: user_account uq_user_account_username; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT uq_user_account_username UNIQUE (username);


--
-- Name: ix_account_token_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_account_token_user_id ON public.account_token USING btree (user_id);


--
-- Name: ix_attendance_dispute_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_dispute_open ON public.attendance_dispute USING btree (created_at) WHERE (status = 'open'::public.dispute_status);


--
-- Name: ix_attendance_dispute_resolved_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attendance_dispute_resolved_by_id ON public.attendance_dispute USING btree (resolved_by_id);


--
-- Name: ix_audit_log_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_log_actor_id ON public.audit_log USING btree (actor_id);


--
-- Name: ix_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_log_created_at ON public.audit_log USING btree (created_at);


--
-- Name: ix_audit_log_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_log_report_id ON public.audit_log USING btree (report_id);


--
-- Name: ix_audit_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_log_target ON public.audit_log USING btree (target_table, target_id);


--
-- Name: ix_cheer_cheer_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cheer_cheer_type_id ON public.cheer USING btree (cheer_type_id);


--
-- Name: ix_cheer_occurrence_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cheer_occurrence_id ON public.cheer USING btree (occurrence_id);


--
-- Name: ix_cheer_recipient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cheer_recipient_id ON public.cheer USING btree (recipient_id);


--
-- Name: ix_circle_invitation_approved_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_circle_invitation_approved_by_id ON public.circle_invitation USING btree (approved_by_id);


--
-- Name: ix_circle_invitation_circle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_circle_invitation_circle_id ON public.circle_invitation USING btree (circle_id);


--
-- Name: INDEX ix_circle_invitation_circle_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.ix_circle_invitation_circle_id IS 'Foreign key index: invitations of a circle (cascade on circle deletion, BR-SOC-06).';


--
-- Name: ix_circle_invitation_invitee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_circle_invitation_invitee_id ON public.circle_invitation USING btree (invitee_id);


--
-- Name: ix_circle_invitation_inviter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_circle_invitation_inviter_id ON public.circle_invitation USING btree (inviter_id);


--
-- Name: ix_circle_member_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_circle_member_user_id ON public.circle_member USING btree (user_id);


--
-- Name: ix_community_join_request_community_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_community_join_request_community_id ON public.community_join_request USING btree (community_id);


--
-- Name: INDEX ix_community_join_request_community_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.ix_community_join_request_community_id IS 'Foreign key index: join requests of a community (cascade on community deletion, BR-SOC-09).';


--
-- Name: ix_community_join_request_decided_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_community_join_request_decided_by_id ON public.community_join_request USING btree (decided_by_id);


--
-- Name: ix_community_join_request_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_community_join_request_user_id ON public.community_join_request USING btree (user_id);


--
-- Name: ix_community_member_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_community_member_user_id ON public.community_member USING btree (user_id);


--
-- Name: ix_community_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_community_name_trgm ON public.community USING gin (public.immutable_unaccent(name) public.gin_trgm_ops);


--
-- Name: ix_conversation_member_last_read_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversation_member_last_read_message_id ON public.conversation_member USING btree (last_read_message_id);


--
-- Name: ix_conversation_member_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversation_member_user_id ON public.conversation_member USING btree (user_id);


--
-- Name: ix_event_circle_circle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_circle_circle_id ON public.event_circle USING btree (circle_id);


--
-- Name: ix_event_co_organizer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_co_organizer_user_id ON public.event_co_organizer USING btree (user_id);


--
-- Name: ix_event_community_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_community_id ON public.event USING btree (community_id);


--
-- Name: ix_event_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_location ON public.event USING gist (location);


--
-- Name: ix_event_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_municipality_id ON public.event USING btree (municipality_id);


--
-- Name: ix_event_occurrence_cancelled_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_occurrence_cancelled_by_id ON public.event_occurrence USING btree (cancelled_by_id);


--
-- Name: ix_event_occurrence_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_occurrence_location ON public.event_occurrence USING gist (location);


--
-- Name: ix_event_occurrence_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_occurrence_municipality_id ON public.event_occurrence USING btree (municipality_id);


--
-- Name: ix_event_occurrence_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_occurrence_starts_at ON public.event_occurrence USING btree (starts_at);


--
-- Name: ix_event_occurrence_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_occurrence_venue_id ON public.event_occurrence USING btree (venue_id);


--
-- Name: ix_event_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_owner_id ON public.event USING btree (owner_id);


--
-- Name: ix_event_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_published ON public.event USING btree (sport_id) WHERE (status = 'published'::public.event_status);


--
-- Name: ix_event_skill_level_max_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_skill_level_max_id ON public.event USING btree (skill_level_max_id);


--
-- Name: ix_event_skill_level_min_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_skill_level_min_id ON public.event USING btree (skill_level_min_id);


--
-- Name: ix_event_split_from_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_split_from_event_id ON public.event USING btree (split_from_event_id);


--
-- Name: ix_event_sport_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_sport_id ON public.event USING btree (sport_id);


--
-- Name: ix_event_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_title_trgm ON public.event USING gin (public.immutable_unaccent(title) public.gin_trgm_ops);


--
-- Name: ix_event_venue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_event_venue_id ON public.event USING btree (venue_id);


--
-- Name: ix_follow_followed_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_follow_followed_id ON public.follow USING btree (followed_id);


--
-- Name: ix_message_conversation_id_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_message_conversation_id_id ON public.message USING btree (conversation_id, id);


--
-- Name: ix_message_reaction_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_message_reaction_user_id ON public.message_reaction USING btree (user_id);


--
-- Name: ix_message_reply_to_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_message_reply_to_message_id ON public.message USING btree (reply_to_message_id);


--
-- Name: ix_message_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_message_sender_id ON public.message USING btree (sender_id);


--
-- Name: ix_municipality_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_municipality_center ON public.municipality USING gist (center);


--
-- Name: ix_municipality_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_municipality_name_trgm ON public.municipality USING gin (public.immutable_unaccent(name) public.gin_trgm_ops);


--
-- Name: ix_municipality_parent_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_municipality_parent_municipality_id ON public.municipality USING btree (parent_municipality_id);


--
-- Name: ix_notification_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_created_at ON public.notification USING btree (created_at);


--
-- Name: ix_notification_notification_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_notification_type_id ON public.notification USING btree (notification_type_id);


--
-- Name: ix_notification_preference_notification_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_preference_notification_type_id ON public.notification_preference USING btree (notification_type_id);


--
-- Name: ix_notification_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_unread ON public.notification USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: ix_notification_user_id_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_user_id_id ON public.notification USING btree (user_id, id);


--
-- Name: ix_push_subscription_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_push_subscription_user_id ON public.push_subscription USING btree (user_id);


--
-- Name: ix_rating_system_sport_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rating_system_sport_id ON public.rating_system USING btree (sport_id);


--
-- Name: ix_refresh_token_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_token_family_id ON public.refresh_token USING btree (family_id);


--
-- Name: ix_refresh_token_replaced_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_token_replaced_by_id ON public.refresh_token USING btree (replaced_by_id);


--
-- Name: ix_refresh_token_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_token_user_id ON public.refresh_token USING btree (user_id);


--
-- Name: ix_registration_attendance_set_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_registration_attendance_set_by_id ON public.registration USING btree (attendance_set_by_id);


--
-- Name: ix_registration_guest_registration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_registration_guest_registration_id ON public.registration_guest USING btree (registration_id);


--
-- Name: ix_registration_occurrence_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_registration_occurrence_status_created ON public.registration USING btree (occurrence_id, status, created_at, id);


--
-- Name: ix_registration_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_registration_user_id ON public.registration USING btree (user_id);


--
-- Name: ix_report_assigned_moderator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_assigned_moderator_id ON public.report USING btree (assigned_moderator_id);


--
-- Name: ix_report_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_queue ON public.report USING btree (created_at) WHERE (status = ANY (ARRAY['open'::public.report_status, 'assigned'::public.report_status]));


--
-- Name: ix_report_report_reason_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_report_reason_id ON public.report USING btree (report_reason_id);


--
-- Name: ix_report_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_reporter_id ON public.report USING btree (reporter_id);


--
-- Name: ix_report_target_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_target_event_id ON public.report USING btree (target_event_id);


--
-- Name: ix_report_target_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_target_message_id ON public.report USING btree (target_message_id);


--
-- Name: ix_report_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_report_target_user_id ON public.report USING btree (target_user_id);


--
-- Name: ix_user_account_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_account_municipality_id ON public.user_account USING btree (municipality_id);


--
-- Name: ix_user_account_username_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_account_username_trgm ON public.user_account USING gin (public.immutable_unaccent((username)::text) public.gin_trgm_ops);


--
-- Name: ix_user_availability_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_availability_user_id ON public.user_availability USING btree (user_id);


--
-- Name: ix_user_block_blocked_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_block_blocked_id ON public.user_block USING btree (blocked_id);


--
-- Name: ix_user_rating_rating_grade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_rating_rating_grade_id ON public.user_rating USING btree (rating_grade_id);


--
-- Name: ix_user_rating_rating_system_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_rating_rating_system_id ON public.user_rating USING btree (rating_system_id);


--
-- Name: ix_user_sanction_issued_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sanction_issued_by_id ON public.user_sanction USING btree (issued_by_id);


--
-- Name: ix_user_sanction_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sanction_report_id ON public.user_sanction USING btree (report_id);


--
-- Name: ix_user_sanction_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sanction_user_id ON public.user_sanction USING btree (user_id);


--
-- Name: ix_user_sport_skill_level_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sport_skill_level_id ON public.user_sport USING btree (skill_level_id);


--
-- Name: ix_user_sport_sport_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sport_sport_id ON public.user_sport USING btree (sport_id);


--
-- Name: ix_venue_created_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_venue_created_by_id ON public.venue USING btree (created_by_id);


--
-- Name: ix_venue_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_venue_location ON public.venue USING gist (location);


--
-- Name: ix_venue_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_venue_municipality_id ON public.venue USING btree (municipality_id);


--
-- Name: ix_venue_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_venue_name_trgm ON public.venue USING gin (public.immutable_unaccent(name) public.gin_trgm_ops);


--
-- Name: uq_circle_invitation_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_circle_invitation_pending ON public.circle_invitation USING btree (circle_id, invitee_id) WHERE (status = ANY (ARRAY['awaiting_admin'::public.circle_invitation_status, 'awaiting_invitee'::public.circle_invitation_status]));


--
-- Name: uq_circle_member_one_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_circle_member_one_owner ON public.circle_member USING btree (circle_id) WHERE (role = 'owner'::public.circle_role);


--
-- Name: uq_community_join_request_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_community_join_request_pending ON public.community_join_request USING btree (community_id, user_id) WHERE (status = 'pending'::public.join_request_status);


--
-- Name: uq_community_member_one_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_community_member_one_owner ON public.community_member USING btree (community_id) WHERE (role = 'owner'::public.community_role);


--
-- Name: uq_registration_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_registration_active ON public.registration USING btree (occurrence_id, user_id) WHERE ((status = ANY (ARRAY['pending_approval'::public.registration_status, 'confirmed'::public.registration_status, 'waitlisted'::public.registration_status])) AND (user_id IS NOT NULL));


--
-- Name: circle trg_circle_create_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_circle_create_conversation AFTER INSERT ON public.circle FOR EACH ROW EXECUTE FUNCTION public.create_circle_conversation();


--
-- Name: community trg_community_create_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_community_create_conversation AFTER INSERT ON public.community FOR EACH ROW EXECUTE FUNCTION public.create_community_conversation();


--
-- Name: event_occurrence trg_event_occurrence_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_occurrence_set_updated_at BEFORE UPDATE ON public.event_occurrence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: event trg_event_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_set_updated_at BEFORE UPDATE ON public.event FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_rating trg_user_rating_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_rating_set_updated_at BEFORE UPDATE ON public.user_rating FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_setting trg_user_setting_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_setting_set_updated_at BEFORE UPDATE ON public.user_setting FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: account_token fk_account_token_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_token
    ADD CONSTRAINT fk_account_token_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: attendance_dispute fk_attendance_dispute_registration_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_dispute
    ADD CONSTRAINT fk_attendance_dispute_registration_id FOREIGN KEY (registration_id) REFERENCES public.registration(id) ON DELETE CASCADE;


--
-- Name: attendance_dispute fk_attendance_dispute_resolved_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_dispute
    ADD CONSTRAINT fk_attendance_dispute_resolved_by_id FOREIGN KEY (resolved_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: audit_log fk_audit_log_actor_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT fk_audit_log_actor_id FOREIGN KEY (actor_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: audit_log fk_audit_log_report_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT fk_audit_log_report_id FOREIGN KEY (report_id) REFERENCES public.report(id) ON DELETE SET NULL;


--
-- Name: auth_identity fk_auth_identity_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identity
    ADD CONSTRAINT fk_auth_identity_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: cheer fk_cheer_cheer_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT fk_cheer_cheer_type_id FOREIGN KEY (cheer_type_id) REFERENCES public.cheer_type(id) ON DELETE RESTRICT;


--
-- Name: cheer fk_cheer_giver_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT fk_cheer_giver_id FOREIGN KEY (giver_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: cheer fk_cheer_occurrence_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT fk_cheer_occurrence_id FOREIGN KEY (occurrence_id) REFERENCES public.event_occurrence(id) ON DELETE CASCADE;


--
-- Name: cheer fk_cheer_recipient_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheer
    ADD CONSTRAINT fk_cheer_recipient_id FOREIGN KEY (recipient_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: circle_invitation fk_circle_invitation_approved_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_invitation
    ADD CONSTRAINT fk_circle_invitation_approved_by_id FOREIGN KEY (approved_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: circle_invitation fk_circle_invitation_circle_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_invitation
    ADD CONSTRAINT fk_circle_invitation_circle_id FOREIGN KEY (circle_id) REFERENCES public.circle(id) ON DELETE CASCADE;


--
-- Name: circle_invitation fk_circle_invitation_invitee_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_invitation
    ADD CONSTRAINT fk_circle_invitation_invitee_id FOREIGN KEY (invitee_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: circle_invitation fk_circle_invitation_inviter_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_invitation
    ADD CONSTRAINT fk_circle_invitation_inviter_id FOREIGN KEY (inviter_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: circle_member fk_circle_member_circle_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_member
    ADD CONSTRAINT fk_circle_member_circle_id FOREIGN KEY (circle_id) REFERENCES public.circle(id) ON DELETE CASCADE;


--
-- Name: circle_member fk_circle_member_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_member
    ADD CONSTRAINT fk_circle_member_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: community_join_request fk_community_join_request_community_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_join_request
    ADD CONSTRAINT fk_community_join_request_community_id FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: community_join_request fk_community_join_request_decided_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_join_request
    ADD CONSTRAINT fk_community_join_request_decided_by_id FOREIGN KEY (decided_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: community_join_request fk_community_join_request_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_join_request
    ADD CONSTRAINT fk_community_join_request_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: community_member fk_community_member_community_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_member
    ADD CONSTRAINT fk_community_member_community_id FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: community_member fk_community_member_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_member
    ADD CONSTRAINT fk_community_member_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: conversation fk_conversation_circle_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT fk_conversation_circle_id FOREIGN KEY (circle_id) REFERENCES public.circle(id) ON DELETE CASCADE;


--
-- Name: conversation fk_conversation_community_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT fk_conversation_community_id FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE CASCADE;


--
-- Name: conversation_member fk_conversation_member_conversation_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT fk_conversation_member_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE CASCADE;


--
-- Name: conversation_member fk_conversation_member_last_read_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT fk_conversation_member_last_read_message_id FOREIGN KEY (last_read_message_id) REFERENCES public.message(id) ON DELETE SET NULL;


--
-- Name: conversation_member fk_conversation_member_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT fk_conversation_member_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: conversation fk_conversation_occurrence_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT fk_conversation_occurrence_id FOREIGN KEY (occurrence_id) REFERENCES public.event_occurrence(id) ON DELETE CASCADE;


--
-- Name: event_circle fk_event_circle_circle_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_circle
    ADD CONSTRAINT fk_event_circle_circle_id FOREIGN KEY (circle_id) REFERENCES public.circle(id) ON DELETE CASCADE;


--
-- Name: event_circle fk_event_circle_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_circle
    ADD CONSTRAINT fk_event_circle_event_id FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;


--
-- Name: event_co_organizer fk_event_co_organizer_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_co_organizer
    ADD CONSTRAINT fk_event_co_organizer_event_id FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;


--
-- Name: event_co_organizer fk_event_co_organizer_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_co_organizer
    ADD CONSTRAINT fk_event_co_organizer_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: event fk_event_community_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_community_id FOREIGN KEY (community_id) REFERENCES public.community(id) ON DELETE SET NULL;


--
-- Name: event fk_event_municipality_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_municipality_id FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE RESTRICT;


--
-- Name: event_occurrence fk_event_occurrence_cancelled_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT fk_event_occurrence_cancelled_by_id FOREIGN KEY (cancelled_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: event_occurrence fk_event_occurrence_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT fk_event_occurrence_event_id FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;


--
-- Name: event_occurrence fk_event_occurrence_municipality_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT fk_event_occurrence_municipality_id FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE RESTRICT;


--
-- Name: event_occurrence fk_event_occurrence_venue_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_occurrence
    ADD CONSTRAINT fk_event_occurrence_venue_id FOREIGN KEY (venue_id) REFERENCES public.venue(id) ON DELETE SET NULL;


--
-- Name: event fk_event_owner_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_owner_id FOREIGN KEY (owner_id) REFERENCES public.user_account(id) ON DELETE RESTRICT;


--
-- Name: event fk_event_skill_level_max_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_skill_level_max_id FOREIGN KEY (skill_level_max_id) REFERENCES public.skill_level(id) ON DELETE RESTRICT;


--
-- Name: event fk_event_skill_level_min_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_skill_level_min_id FOREIGN KEY (skill_level_min_id) REFERENCES public.skill_level(id) ON DELETE RESTRICT;


--
-- Name: event fk_event_split_from_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_split_from_event_id FOREIGN KEY (split_from_event_id) REFERENCES public.event(id) ON DELETE SET NULL;


--
-- Name: event fk_event_sport_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_sport_id FOREIGN KEY (sport_id) REFERENCES public.sport(id) ON DELETE RESTRICT;


--
-- Name: event fk_event_venue_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT fk_event_venue_id FOREIGN KEY (venue_id) REFERENCES public.venue(id) ON DELETE SET NULL;


--
-- Name: follow fk_follow_followed_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT fk_follow_followed_id FOREIGN KEY (followed_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: follow fk_follow_follower_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow
    ADD CONSTRAINT fk_follow_follower_id FOREIGN KEY (follower_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: message fk_message_conversation_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT fk_message_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE CASCADE;


--
-- Name: message_reaction fk_message_reaction_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reaction
    ADD CONSTRAINT fk_message_reaction_message_id FOREIGN KEY (message_id) REFERENCES public.message(id) ON DELETE CASCADE;


--
-- Name: message_reaction fk_message_reaction_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reaction
    ADD CONSTRAINT fk_message_reaction_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: message fk_message_reply_to_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT fk_message_reply_to_message_id FOREIGN KEY (reply_to_message_id) REFERENCES public.message(id) ON DELETE SET NULL;


--
-- Name: message fk_message_sender_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT fk_message_sender_id FOREIGN KEY (sender_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: municipality fk_municipality_parent_municipality_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.municipality
    ADD CONSTRAINT fk_municipality_parent_municipality_id FOREIGN KEY (parent_municipality_id) REFERENCES public.municipality(id) ON DELETE RESTRICT;


--
-- Name: notification fk_notification_notification_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT fk_notification_notification_type_id FOREIGN KEY (notification_type_id) REFERENCES public.notification_type(id) ON DELETE RESTRICT;


--
-- Name: notification_preference fk_notification_preference_notification_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preference
    ADD CONSTRAINT fk_notification_preference_notification_type_id FOREIGN KEY (notification_type_id) REFERENCES public.notification_type(id) ON DELETE RESTRICT;


--
-- Name: notification_preference fk_notification_preference_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preference
    ADD CONSTRAINT fk_notification_preference_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: notification fk_notification_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT fk_notification_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: push_subscription fk_push_subscription_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscription
    ADD CONSTRAINT fk_push_subscription_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: rating_grade fk_rating_grade_rating_system_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_grade
    ADD CONSTRAINT fk_rating_grade_rating_system_id FOREIGN KEY (rating_system_id) REFERENCES public.rating_system(id) ON DELETE CASCADE;


--
-- Name: rating_system fk_rating_system_sport_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_system
    ADD CONSTRAINT fk_rating_system_sport_id FOREIGN KEY (sport_id) REFERENCES public.sport(id) ON DELETE RESTRICT;


--
-- Name: refresh_token fk_refresh_token_replaced_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_token
    ADD CONSTRAINT fk_refresh_token_replaced_by_id FOREIGN KEY (replaced_by_id) REFERENCES public.refresh_token(id) ON DELETE SET NULL;


--
-- Name: refresh_token fk_refresh_token_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_token
    ADD CONSTRAINT fk_refresh_token_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: registration fk_registration_attendance_set_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration
    ADD CONSTRAINT fk_registration_attendance_set_by_id FOREIGN KEY (attendance_set_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: registration_guest fk_registration_guest_registration_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_guest
    ADD CONSTRAINT fk_registration_guest_registration_id FOREIGN KEY (registration_id) REFERENCES public.registration(id) ON DELETE CASCADE;


--
-- Name: registration fk_registration_occurrence_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration
    ADD CONSTRAINT fk_registration_occurrence_id FOREIGN KEY (occurrence_id) REFERENCES public.event_occurrence(id) ON DELETE CASCADE;


--
-- Name: registration fk_registration_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration
    ADD CONSTRAINT fk_registration_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: report fk_report_assigned_moderator_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_assigned_moderator_id FOREIGN KEY (assigned_moderator_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: report fk_report_report_reason_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_report_reason_id FOREIGN KEY (report_reason_id) REFERENCES public.report_reason(id) ON DELETE RESTRICT;


--
-- Name: report fk_report_reporter_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_reporter_id FOREIGN KEY (reporter_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: report fk_report_target_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_target_event_id FOREIGN KEY (target_event_id) REFERENCES public.event(id) ON DELETE SET NULL;


--
-- Name: report fk_report_target_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_target_message_id FOREIGN KEY (target_message_id) REFERENCES public.message(id) ON DELETE SET NULL;


--
-- Name: report fk_report_target_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT fk_report_target_user_id FOREIGN KEY (target_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: user_account fk_user_account_municipality_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT fk_user_account_municipality_id FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE RESTRICT;


--
-- Name: user_availability fk_user_availability_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT fk_user_availability_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_block fk_user_block_blocked_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_block
    ADD CONSTRAINT fk_user_block_blocked_id FOREIGN KEY (blocked_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_block fk_user_block_blocker_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_block
    ADD CONSTRAINT fk_user_block_blocker_id FOREIGN KEY (blocker_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_rating fk_user_rating_rating_grade_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rating
    ADD CONSTRAINT fk_user_rating_rating_grade_id FOREIGN KEY (rating_grade_id) REFERENCES public.rating_grade(id) ON DELETE RESTRICT;


--
-- Name: user_rating fk_user_rating_rating_system_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rating
    ADD CONSTRAINT fk_user_rating_rating_system_id FOREIGN KEY (rating_system_id) REFERENCES public.rating_system(id) ON DELETE RESTRICT;


--
-- Name: user_rating fk_user_rating_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rating
    ADD CONSTRAINT fk_user_rating_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_sanction fk_user_sanction_issued_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sanction
    ADD CONSTRAINT fk_user_sanction_issued_by_id FOREIGN KEY (issued_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: user_sanction fk_user_sanction_report_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sanction
    ADD CONSTRAINT fk_user_sanction_report_id FOREIGN KEY (report_id) REFERENCES public.report(id) ON DELETE SET NULL;


--
-- Name: user_sanction fk_user_sanction_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sanction
    ADD CONSTRAINT fk_user_sanction_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_setting fk_user_setting_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_setting
    ADD CONSTRAINT fk_user_setting_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_sport fk_user_sport_skill_level_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sport
    ADD CONSTRAINT fk_user_sport_skill_level_id FOREIGN KEY (skill_level_id) REFERENCES public.skill_level(id) ON DELETE RESTRICT;


--
-- Name: user_sport fk_user_sport_sport_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sport
    ADD CONSTRAINT fk_user_sport_sport_id FOREIGN KEY (sport_id) REFERENCES public.sport(id) ON DELETE RESTRICT;


--
-- Name: user_sport fk_user_sport_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sport
    ADD CONSTRAINT fk_user_sport_user_id FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: venue fk_venue_created_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue
    ADD CONSTRAINT fk_venue_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: venue fk_venue_municipality_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue
    ADD CONSTRAINT fk_venue_municipality_id FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20261102160458'),
    ('20261102160504'),
    ('20261102160510'),
    ('20261102163429'),
    ('20261102163433'),
    ('20261102170413'),
    ('20261102211402'),
    ('20261102211403'),
    ('20261102220118'),
    ('20261104210000'),
    ('20261104210100'),
    ('20261104230000'),
    ('20261104230100');
