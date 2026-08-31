-- Revoke TRUNCATE / TRIGGER / REFERENCES / MAINTAIN from anon and authenticated.
--
-- FOUND: `anon` held TRUNCATE on 464 public objects — venues, events, countries, cities,
-- trips, messages, user_roles, search_documents, profiles_audit_log among them.
-- `authenticated` held it on 485.
--
-- WHY THAT IS NOT MERELY UNTIDY: **RLS DOES NOT GATE TRUNCATE.** Row-level security
-- filters rows for SELECT/INSERT/UPDATE/DELETE; TRUNCATE is a table-level operation and
-- Postgres authorises it on the privilege alone. So for these four privileges the RLS
-- policies that protect everything else on this platform are simply not in the path. The
-- usual reassurance ("RLS is on, anon is contained") is FALSE here, and that is the whole
-- finding.
--
-- WHY IT WAS NOT ALREADY AN INCIDENT, measured rather than assumed:
--   * PostgREST exposes no TRUNCATE verb, so the grant is not reachable over the REST API.
--   * Of 543 anon-EXECUTE routines in public, exactly one mentions 'truncate' —
--     `definer_view_api_write_grants` — and it is a READ-ONLY grant-audit function.
-- So this was latent, not live. It is one careless SECURITY DEFINER function away from
-- being a full-data-loss vector, and "nothing currently exposes it" is not a control.
--
-- THE ROOT CAUSE IS A STANDING DEFAULT, NOT THE BASELINE FILE. `pg_default_acl` carries
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public ... TO anon  ->  anon=awdDxtm/postgres
-- so EVERY new table in public inherits INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN automatically. Revoking on today's 569 objects without also changing
-- the default would regrow silently on the next `create table`. Both halves are here.
--
-- VERIFIED IN A ROLLED-BACK TRANSACTION ON PROD BEFORE APPLYING, because the sibling
-- guard `scripts/check-anon-function-grants.mjs` documents that for FUNCTIONS this exact
-- approach is a NO-OP: a new function carries Postgres's built-in `=X/postgres` PUBLIC
-- grant, which is not a pg_default_acl row and therefore cannot be subtracted by ALTER
-- DEFAULT PRIVILEGES. Tables have no such built-in grant, so the same statement DOES work
-- here — but that is a difference worth proving, not assuming. Probe result:
--     BEFORE: anon=awdDxtm/postgres      (a newly created table)
--     AFTER : anon=awd/postgres
--
-- SCOPE IS DELIBERATELY NARROW. INSERT / UPDATE / DELETE / SELECT are NOT touched: those
-- are reachable through PostgREST, they ARE gated by RLS, and this project legitimately
-- accepts anonymous writes on a few tables (feedback, contact submissions). Revoking them
-- is a product decision about the anon write surface, not a security cleanup, and mixing
-- the two would make this migration unreviewable. Measured after applying: anon still
-- holds INSERT on 458 objects, UPDATE/DELETE on 459, SELECT on 116 — all unchanged.
--
-- service_role keeps everything: it is the backend identity and bypasses RLS by design.

-- 1. Existing objects. A loop over pg_class rather than `ON ALL TABLES IN SCHEMA`,
--    because that form does not cover MATERIALIZED VIEWS (4 of which carried anon
--    TRUNCATE), and every object in public is postgres-owned so the revoke can succeed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.oid::regclass::text AS obj
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON %s FROM anon, authenticated', r.obj);
  END LOOP;
END $$;

-- 2. Future objects. Without this the next `create table` re-grants all four.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon, authenticated;

-- 3. Assert, do not hope.
DO $$
DECLARE v_left int; v_anon_insert int; v_defacl text;
BEGIN
  SELECT count(*) INTO v_left
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
     AND (has_table_privilege('anon','' || c.oid::regclass, 'TRUNCATE')
       OR has_table_privilege('authenticated','' || c.oid::regclass, 'TRUNCATE')
       OR has_table_privilege('anon','' || c.oid::regclass, 'TRIGGER')
       OR has_table_privilege('authenticated','' || c.oid::regclass, 'TRIGGER'));
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'still % objects with anon/authenticated TRUNCATE or TRIGGER', v_left;
  END IF;

  -- The RLS-gated write surface must be UNCHANGED. If this collapsed, the revoke was
  -- too wide and anonymous feedback/contact submissions would start failing.
  SELECT count(*) INTO v_anon_insert
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND has_table_privilege('anon','' || c.oid::regclass, 'INSERT');
  IF v_anon_insert < 400 THEN
    RAISE EXCEPTION 'anon INSERT collapsed to % tables — revoke was too wide', v_anon_insert;
  END IF;

  SELECT d.defaclacl::text INTO v_defacl
    FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname='public' AND d.defaclobjtype='r' AND d.defaclrole = 'postgres'::regrole;
  IF v_defacl LIKE '%anon=awdDxtm%' THEN
    RAISE EXCEPTION 'default privileges still grant anon the full set: %', v_defacl;
  END IF;
END $$;
