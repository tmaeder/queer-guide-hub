-- Revert 20260427160000_revoke_anon_public_select.sql.
--
-- That migration assumed "the SPA does not query public tables as anon".
-- That assumption was wrong: src/hooks/useOptimizedPlaces.tsx and many
-- other hooks/pages call supabase.from('countries' | 'events' | 'venues' |
-- 'cities' | 'news_articles' | ...) directly using the anon key, which
-- PostgREST then rejected with 401 before RLS could run.
--
-- User-visible symptom (feedback 0407d1b5-e3b6-48cf-b10d-dc12f93132c7):
--   /country/china (and every other public detail / list page) shows
--   "Country not found" because the countries fetch returns 401.
--
-- Restore the prior grants. The Advisor lint 0026 hardening can be
-- re-attempted later as an explicit allowlist after auditing every anon
-- supabase.from() call site.

BEGIN;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

COMMIT;
