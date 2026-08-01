-- ============================================================================
-- Queer villages: make the enrichment sweep finish this quarter
-- ----------------------------------------------------------------------------
-- `village_agentic_enrich` ran weekly (`40 5 * * 0`) with `batch_limit = 8`.
-- Measured on 2026-08-07: 7 batches since 2026-06-19, 46 enrichment signals,
-- ~7 villages per run against 190 live villages — a ~27-week full sweep. The
-- content gap it exists to close has barely moved:
--
--   editorial_hook   missing 190/190
--   boundaries       missing 190/190   (no implemented source — see below)
--   website          missing 190/190   (no implemented source — see below)
--   notable_landmarks        187/190
--   description              187/190
--   queer_history            125/190
--
-- Nothing was paused or failing; the job simply could not keep up with itself.
-- Daily × 10 is ~70/week, so a full pass takes under three weeks instead of
-- seven months.
--
-- WHY 10 AND NOT THE FUNCTION'S CEILING OF 20:
-- `agenticEnrichVillages` loops villages SEQUENTIALLY, and each iteration does a
-- Wikipedia fetch plus an LLM call before it writes. At ~5-8s per village, 20
-- would sit at 100-170s and run into the edge-function wall-clock budget, which
-- fails the batch with no partial credit. 10 lands around 50-90s. `batch_limit`
-- is clamped by `Math.min(20, …)` in the function, so this is well inside it.
--
-- The pg_net timeout goes 30s → 60s for the same reason: at 30s the request was
-- abandoned before the run finished, so `net._http_response` never recorded an
-- outcome and the job looked silent even when it worked. pg_net timing out does
-- not stop the function — it only costs us the observability.
--
-- STILL NOT COVERED, DELIBERATELY: `boundaries` (GeoJSON) and `website` are
-- 190/190 empty and this job cannot fill either. `run_village_coverage_radar`
-- routes boundaries to `wikidata` and website to `manual`, and neither source is
-- implemented. They need an OSM/Wikidata relation fetch that does not exist yet;
-- do not read a shrinking gap count as those two being handled.
-- ============================================================================

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'village_agentic_enrich';

  if v_jobid is null then
    raise notice 'village_agentic_enrich cron job not found — skipping';
    return;
  end if;

  perform cron.alter_job(
    job_id  := v_jobid,
    schedule := '40 5 * * *',
    command  := $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-enrich-village',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode','agentic','batch_limit',10),
    timeout_milliseconds := 60000
  ) as request_id;
  $cmd$
  );
end $$;

-- Keep the admin surface honest — /admin/automations reads this row, not cron.job.
update public.admin_automations
   set schedule = '40 5 * * *'
 where slug = 'village_agentic_enrich'
   and schedule is distinct from '40 5 * * *';
