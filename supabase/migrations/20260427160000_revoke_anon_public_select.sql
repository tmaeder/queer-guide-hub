-- Fix Supabase Advisor lint 0026 (pg_graphql_anon_table_exposed): 274 warnings.
-- Anon role had stock SELECT on every public table/view, exposing names,
-- columns, and relationships via /graphql/v1 introspection and PostgREST.
--
-- The SPA does not query public tables as anon (search via Meilisearch,
-- data fetches via service-role server-side). The only intentional anon
-- read path is two SECURITY DEFINER RPCs, which use EXECUTE grants and
-- are unaffected by table-level revoke.
--
-- Rollback:
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT ON TABLES TO anon;

BEGIN;

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;

-- Allowlist (re-grant anon SELECT on objects the SPA reads pre-auth).
-- Verify before applying by grepping web/src for `supabase.from(` calls
-- using the anon key. Expected empty.
-- GRANT SELECT ON public.<table_or_view> TO anon;

COMMIT;
