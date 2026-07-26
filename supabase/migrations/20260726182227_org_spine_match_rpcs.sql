-- [Drift recovery shim 2026-07-26] This version was applied live via MCP
-- apply_migration by a concurrent agent session (Business Spine Unification).
-- The executed SQL is recorded in supabase_migrations.schema_migrations
-- .statements for this version, and that session's own repo migrations
-- (referenced there as 20260801100100-20260801100300) carry the canonical
-- content for fresh/branch databases. This shim exists so db push's
-- file<->history matching stops skipping — remote-only versions block ALL
-- merged migrations from applying (deploy-supabase-functions drift guard).
SELECT 1;
