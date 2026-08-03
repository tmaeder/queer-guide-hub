-- ============================================================================
-- Register city_factual_sparql in admin_automations (P1 registry-of-record)
-- ----------------------------------------------------------------------------
-- pipeline_hygiene_stats().unregistered_cron_jobs has reported
-- ["city_factual_sparql"] since 2026-08-02, and scripts/check-pipeline-health.mjs
-- exit(1)s on a non-empty list — so the nightly pipeline-health workflow has
-- been red every day since, with every pipeline itself healthy.
--
-- Cause is ordering, not intent — the same shape as
-- 20260801080100_register_vn_drain_crons.sql and 20260801100000_register_straggler_crons.sql:
-- 20260801172507_city_backfill_cron_params.sql introduced city_factual_sparql
-- as a NEW job, and it ran AFTER the P1 sweep in 20260801030000 that
-- auto-registered every then-active job. Its siblings (city_factual_backfill,
-- city_agentic_enrich, city_corroboration) existed at sweep time and are
-- registered; the sparql job simply arrived one migration too late.
--
-- The job is live and doing real work — cron.job_run_details shows `succeeded`
-- on every fire (2026-08-02 and 2026-08-03 at 03:40) — so it is registered, not
-- unscheduled. It is the WDQS phase of city-factual-backfill (airports via P931
-- + universities), deliberately split out of the per-city loop because those
-- queries need their own circuit breaker and a longer timeout.
--
-- enabled=true is load-bearing: sync_automations_to_cron() unschedules any job
-- whose registry row is disabled, so registering it as false would kill a
-- working job on the next nightly reconcile.
-- ============================================================================

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
SELECT
  'city_factual_sparql',
  j.jobname,
  'City factual backfill — WDQS phase (Wikidata SPARQL). Daily 03:40, 25 min after '
    || 'the main city_factual_backfill link phase: fills airport codes/names (P931 '
    || '"place served by", sitelink-count tiebreak) and universities for cities the '
    || 'link phase has already resolved to a QID. Split out of the per-city loop '
    || 'because WDQS needs its own circuit breaker (wikidata.sparql) and a 240s '
    || 'timeout — transitive P131*/P279* queries were measured at HTTP 500 after 60s.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', j.jobname, 'command', j.command),
  j.schedule
FROM cron.job j
WHERE j.jobname = 'city_factual_sparql'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_automations a
    WHERE a.action->>'jobname' = j.jobname
       OR a.slug = 'city_factual_sparql'
  );

-- ----------------------------------------------------------------------------
-- Same migration, second omission: 20260801172507 also REWROTE the commands of
-- city_factual_backfill (batch_limit 120 -> 40) and city_agentic_enrich (added
-- skip_gated) directly in pg_cron without refreshing the copies stored in their
-- registry rows. sync_automations_to_cron() branch (d) re-creates a missing job
-- from action->>'command', so an operator using the /admin/automation kill
-- switch and then re-enabling would resurrect city_factual_backfill at
-- batch_limit 120 — the value that was measured to blow the ~120s edge gateway
-- budget, which is exactly why it was cut to 40.
--
-- Copy live command -> registry (pg_cron is the only writer of the command;
-- schedule stays registry-owned, so it is deliberately NOT touched here).
-- ----------------------------------------------------------------------------
UPDATE public.admin_automations a
SET action = a.action || jsonb_build_object('command', j.command),
    updated_at = now()
FROM cron.job j
WHERE j.jobname = a.action->>'jobname'
  AND a.action->>'command' IS NOT NULL
  AND a.action->>'command' IS DISTINCT FROM j.command
  AND a.slug IN ('city_factual_backfill', 'city_agentic_enrich');
