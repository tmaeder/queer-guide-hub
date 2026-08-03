-- SECURITY (hygiene): revoke anon/authenticated write privileges on
-- public.news_quality_scorecard.
--
-- 20260810130000_news_code_residue_health.sql ran `CREATE OR REPLACE VIEW
-- public.news_quality_scorecard` to add the `code_residue` column. Supabase's
-- stock `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON TABLES TO
-- anon, authenticated` is still in force, so re-creating the view handed
-- INSERT/UPDATE/DELETE/TRUNCATE (plus REFERENCES/TRIGGER) straight back to both
-- API roles. The migration granted only SELECT and never revoked the rest, so
-- the CI gate added by 20260806180000 went red on the next PR.
--
-- This is the exact regression that migration predicted: "the ALTER DEFAULT
-- PRIVILEGES above is still in force, so EVERY new view created in `public` is
-- born with anon/authenticated write grants."
--
-- Scope, measured rather than assumed: unlike the four auto-updatable views in
-- 20260806180000, this one is NOT a write path. It is aggregate-only
-- (count/avg/max over news_articles with no GROUP BY), and Postgres reports
--
--   information_schema.views.is_updatable      = NO
--   information_schema.views.is_insertable_into = NO
--
-- so no INSERT/UPDATE/DELETE can be executed through it regardless of grants.
-- The grants were inert, not an exploitable RLS bypass. This migration is
-- therefore grant hygiene + un-blocking the gate, not an incident fix.
--
-- SELECT is deliberately preserved for `authenticated`: 20260810130000 granted
-- it so the news admin panel can poll the scorecard, and that is the view's only
-- purpose. `anon` holds no SELECT (verified against the live grants — its set is
-- exactly the six write/reference privileges below), so this revoke removes the
-- whole of anon's access without touching any read path. REVOKE is idempotent
-- and nothing writes through this view.

revoke insert, update, delete, truncate, references, trigger
  on public.news_quality_scorecard
  from anon, authenticated;
