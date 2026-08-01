-- Retire `wf-enrich-wolfram-countries`: a cron that has NEVER succeeded.
--
-- It fires `enqueue_workflow('enrich-wolfram-countries', ...)`, but that
-- workflow_definitions row does not exist, so every run dies at:
--
--   ERROR: Workflow "enrich-wolfram-countries" not found or disabled
--   CONTEXT: PL/pgSQL function enqueue_workflow(text,jsonb,text) line 12
--
-- Verified on prod 2026-08-01: 1 run, 0 succeeded, and it is the ONLY cron in
-- cron.job_run_details with zero successful runs. `workflow_definitions` holds
-- no row matching '%wolfram%'.
--
-- How it got orphaned:
--   * 20260420170000 deprecated enrich-wolfram-{cities,countries,tags} in
--     favour of the unified enrich_entity path; the rows were later dropped
--     entirely by the P0-P5 pipeline consolidation.
--   * The Country Completeness Engine (2026-06-07) then registered this cron
--     against the already-dead workflow name — and did so with raw SQL, not a
--     migration (the string `wf-enrich-wolfram-countries` appears nowhere in
--     supabase/migrations/), which is exactly why the consolidation sweep
--     never saw it.
--
-- Why retire rather than repair: enrich-wolfram needs a paid WOLFRAM_APP_ID
-- that was never set, so it could not have worked even with the workflow row
-- present. It was superseded by `pipeline-enrich-country-stats`, which pulls
-- the same GDP / GDP-per-capita / life-expectancy / literacy fields from the
-- FREE key-less World Bank API and is already live on the healthy daily cron
-- `wf-enrich-country-stats` (45 3 * * *) — 8 runs, 8 succeeded.
--
-- human_development_index stays a known residual gap, documented in
-- pipeline-enrich-country-stats: there is no reliable free per-country HDI
-- endpoint. That gap is unaffected by this change — the Wolfram cron was not
-- filling it either.
--
-- Idempotent: only unschedules if present.

select cron.unschedule('wf-enrich-wolfram-countries')
where exists (
  select 1 from cron.job where jobname = 'wf-enrich-wolfram-countries'
);
