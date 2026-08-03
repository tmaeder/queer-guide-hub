-- DRIFT REPAIR. This migration was applied directly to production on
-- 2026-08-03T11:09:28Z via the MCP `apply_migration` tool, which stamps a version
-- from its own call timestamp and does not create a repo file. That left one
-- applied version with no file, which fails scripts/check-migration-drift.mjs —
-- the `migration-versions` REQUIRED check — on every subsequent PR.
--
-- Recovered verbatim from supabase_migrations.schema_migrations.statements per
-- CLAUDE.md ("recover the SQL into a file at its exact version; never a blind
-- db pull"). It is already recorded as applied, so `db push` will skip it; this
-- file exists to make the repo agree with the remote.
--
-- Note the version is 20260803110928 (the apply timestamp), NOT a 202608101xxxxx
-- version — the numbering is out of order relative to the 20260810* series it
-- belongs to. That ordering is a consequence of the stamping, and renaming it
-- would re-open the drift, so it stays exactly as applied.
--
-- Original body follows unchanged.
--
-- ---------------------------------------------------------------------------
-- SECURITY: revoke the anon/authenticated write set that Supabase's stock
-- ALTER DEFAULT PRIVILEGES armed on public.news_quality_scorecard.
--
-- 20260810130000 recreated the view (adding the code_residue column) and a fresh
-- relation picks up `GRANT ALL ON TABLES TO anon, authenticated` from the schema's
-- default privileges. The view has no security_invoker, so it runs as its owner and
-- would bypass news_articles' RLS. It is a pure aggregate, so it is not
-- auto-updatable and the write set was never actually reachable -- but this is
-- exactly the shape scripts/check-definer-view-grants.mjs exists to reject (see
-- 20260806180000), and any later non-aggregate revision of the view would make it
-- live. Revoke unconditionally; REVOKE is idempotent.
--
-- anon never held SELECT here (the panel is admin-only) and does not gain it.

revoke insert, update, delete, truncate, references, trigger
  on public.news_quality_scorecard from anon, authenticated;

grant select on public.news_quality_scorecard to authenticated;
