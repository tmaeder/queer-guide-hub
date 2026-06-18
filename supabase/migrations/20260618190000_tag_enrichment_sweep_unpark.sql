-- ============================================================================
-- Unpark + accelerate tag-enrichment-sweep
-- ----------------------------------------------------------------------------
-- The sweep cron authenticated with X-Webhook-Secret sourced from the vault key
-- `tag_enrichment_webhook_secret`, which was never created. The header resolved
-- to NULL, the edge function fell through to requireInternalOrAdmin with no
-- credential, returned 401, and parked — so descriptions/categories/images for
-- ~2.1k tags were never filled (and i18n, which depends on descriptions, idled).
--
-- Fix: authenticate with the existing `internal_invoke_secret` via the
-- X-Internal-Secret header (the same path every working pipeline cron uses;
-- requireInternalOrAdmin accepts INTERNAL_INVOKE_SECRET). Also raise the batch
-- and run every 2 hours during the backlog drain. The selector only returns
-- active tags still missing a fillable dimension, so the cadence is
-- self-throttling: once the backlog clears it naturally examines far fewer rows.
-- ============================================================================
do $$
declare
  v_jobid bigint;
  v_secret_exists boolean;
begin
  select (decrypted_secret is not null) into v_secret_exists
  from vault.decrypted_secrets where name = 'internal_invoke_secret';

  if not coalesce(v_secret_exists, false) then
    raise notice 'internal_invoke_secret missing — leaving tag_enrichment_sweep cron unchanged';
    return;
  end if;

  select jobid into v_jobid from cron.job where jobname = 'tag_enrichment_sweep';
  if v_jobid is null then
    raise notice 'tag_enrichment_sweep cron not found';
    return;
  end if;

  perform cron.alter_job(
    job_id  := v_jobid,
    schedule := '0 */2 * * *',
    command := $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('batch_limit', 40, 'cat_limit', 50, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$
  );

  raise notice 'tag_enrichment_sweep cron unparked (internal-secret, every 2h, batch 40/cat 50)';
end $$;
