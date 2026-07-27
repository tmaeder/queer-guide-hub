-- ============================================================================
-- Register the cron jobs that slipped past the P1 registry-of-record sweep.
--
-- pipeline_hygiene_stats() currently reports four unregistered jobs:
--   vn-drain-validate, vn-drain-dedup, vn-drain-review, vn-drain-commit
-- and scripts/check-pipeline-health.mjs `process.exit(1)`s on a non-empty
-- unregistered_cron_jobs list — so the pipeline-health workflow is failing.
--
-- Cause is ordering, not intent: the venue staging drains were scheduled by
-- 20260801040200_venue_staging_drain_cron.sql, which runs AFTER the P1 sweep
-- in 20260801030000 that auto-registered every then-active job. Their
-- ev-drain-* / mp-drain-* counterparts were registered by that sweep and are
-- clean, so the venue drains are simply the same load-bearing staging-drain
-- pattern arriving one migration too late.
--
-- Re-run P1's auto-registration verbatim (same slug normalization, same
-- managed_by='system', same action shape keyed on action->>'jobname') so the
-- reconciler sync_automations_to_cron() can see them and the kill switch on
-- /admin/automation works for them like every other job. Idempotent, and
-- generic rather than hardcoding the four names so any future straggler in
-- this same window is caught too.
-- ============================================================================

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
SELECT
  lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g')),
  j.jobname,
  'Auto-registered from pg_cron (registry-of-record straggler sweep, 2026-07-27). Command: '
    || left(regexp_replace(j.command, '\s+', ' ', 'g'), 300),
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', j.jobname, 'command', j.command),
  j.schedule
FROM cron.job j
WHERE j.active
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_automations a
    WHERE a.action->>'jobname' = j.jobname
       OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
  )
ON CONFLICT (slug) DO NOTHING;
