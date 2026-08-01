-- History-reconciliation file. NOT new work.
--
-- The revokes described here were applied to production on 2026-08-01 via MCP
-- apply_migration, which stamps its OWN version from the call timestamp rather than
-- the filename you intend. Remote `schema_migrations` therefore recorded them as
-- 20260801122200, while #2450 committed them as 20260806180000. A remote version with
-- no repo file makes `supabase db push` skip SILENTLY — which is exactly what failed
-- the deploy-supabase-functions run on cc91a77.
--
-- This file exists so the repo mirrors remote history and db push stops skipping.
-- It carries the same statements as 20260806180000 (which is kept, and re-asserts them
-- harmlessly — REVOKE is idempotent). Do not "tidy up" by deleting either one.
--
-- Rationale for the revokes themselves lives in
-- 20260806180000_revoke_api_write_on_security_definer_views.sql.

revoke insert, update, delete, truncate on
  public.tag_broader,
  public.tag_narrower,
  public.tag_facets,
  public.triage_src_dedup_review,
  public.triage_src_org_link_review,
  public.admin_media_unified,
  public.v_silo_concept_crosswalk
from anon, authenticated;

revoke all on
  public.triage_src_dedup_review,
  public.triage_src_org_link_review
from anon, authenticated;
