-- Revert 20260427160000_revoke_anon_public_select.sql.
--
-- That migration's premise was wrong: it claimed "the SPA does not query
-- public tables as anon", but the SPA actually fetches dozens of tables
-- directly via the anon Supabase client (countries, cities, events, venues,
-- news_articles, personalities, queer_villages, marketplace_listings,
-- unified_tags, ...). After the revoke, every public-page REST call
-- started returning 401 Unauthorized — including /country/:slug, the
-- venue/event/news listings, search facets, etc.
--
-- Row-level visibility is already governed by RLS policies on each table;
-- the table-level GRANT is what PostgREST checks before RLS even runs.
-- Tightening the pg_graphql introspection surface is a separate concern
-- and must not be solved by yanking the grant the SPA depends on.
--
-- Restore the prior baseline. The Advisor lint 0026 will need a different
-- mitigation (e.g., disable /graphql/v1 for anon, or move the SPA's anon
-- reads to SECURITY DEFINER RPCs first, then revoke).

BEGIN;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

COMMIT;
