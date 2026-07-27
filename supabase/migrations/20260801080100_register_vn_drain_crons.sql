-- ============================================================================
-- Register the venue staging drain crons in admin_automations
-- ----------------------------------------------------------------------------
-- P2 (20260801040200) added vn-drain-validate/dedup/review/commit but did not
-- register them, so P1's registry-of-record invariant is violated:
-- pipeline_hygiene_stats().unregistered_cron_jobs lists all four and the
-- nightly pipeline-health CI check fails on them.
--
-- Registering them also brings them under the kill switch — disabling the row
-- now actually unschedules the job via sync_automations_to_cron().
-- ============================================================================

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
SELECT
  lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g')),
  j.jobname,
  'Venue staging drain stage (P2 ingestion unification). Hourly: moves venue rows '
    || 'staged by the converted import-* adapters through validate -> dedup -> review -> commit. '
    || 'Mirrors the ev-drain-*/mp-drain-* stage machines; venue rows staged outside a DAG run '
    || 'have no other drain path.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', j.jobname, 'command', j.command),
  j.schedule
FROM cron.job j
WHERE j.jobname LIKE 'vn-drain-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_automations a
    WHERE a.action->>'jobname' = j.jobname
       OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
  )
ON CONFLICT (slug) DO NOTHING;
