-- ============================================================================
-- Dead workflow rows + duplicate DAG row — overhaul Wave B item B3 (measured)
-- ----------------------------------------------------------------------------
-- Liveness measured live 2026-08-08 (workflow_runs 30d + cron.job command
-- references + repo grep for callers):
--   marketplace-reingest   — disabled, 0 runs ever, no cron/repo refs → DELETE
--   news-quality-backfill  — enabled, 0 runs ever, no cron/repo refs → disable
--   send-bulk-email        — enabled, 0 runs ever, no cron/repo refs → disable
--   (disabled rows get deleted after a 30-day soak per the Wave B playbook;
--    workflow_definitions has no reconciler re-arm semantics, this is just
--    the same conservative two-step used everywhere else)
-- All other 16 rows ran within the last 30 days or are cron-referenced — kept.
--
-- pipeline_definitions carried a literal-quoted duplicate name
-- '"marketplace-drain"' (id 43e28a00…, 0 runs ever) next to the real
-- marketplace-drain (8 runs) — a Builder save artifact. Deleted by id.
-- ============================================================================

DELETE FROM public.workflow_definitions
 WHERE name = 'marketplace-reingest' AND is_enabled = false;

UPDATE public.workflow_definitions
   SET is_enabled = false,
       description = coalesce(description, '') || ' [DISABLED 2026-08-08: zero runs ever, no cron/repo references; delete after 30-day soak — see docs/plans/2026-08-pipeline-overhaul-wave-b.md]'
 WHERE name IN ('news-quality-backfill', 'send-bulk-email');

DELETE FROM public.pipeline_definitions
 WHERE id = '43e28a00-2506-4857-b9e7-84d7970dcdc4'
   AND name = '"marketplace-drain"'
   AND NOT EXISTS (SELECT 1 FROM public.pipeline_runs pr WHERE pr.pipeline_id = '43e28a00-2506-4857-b9e7-84d7970dcdc4');
