-- Consolidation sprint Q2-2026, Batch 1: drop leftover scratch tables.
-- Frees ~35 MB and closes advisor items:
--   ERROR rls_disabled_in_public on _geonames_stage
--   INFO  rls_enabled_no_policy on _cleanup_personalities_2026_04_26
--   INFO  no_primary_key on both
-- Ref: docs/consolidation-2026-Q2-addendum-db-advisors.md
-- Already applied to prod via Supabase MCP on 2026-05-01.

DROP TABLE IF EXISTS public._cleanup_personalities_2026_04_26;
DROP TABLE IF EXISTS public._geonames_stage;
