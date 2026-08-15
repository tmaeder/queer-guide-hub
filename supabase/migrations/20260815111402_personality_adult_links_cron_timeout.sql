-- ============================================================================
-- personality_adult_links — give the nightly job a realistic timeout
--
-- A 40-row batch is up to 120 sequential HTTP probes (3 platforms x 40 rows,
-- each with a politeness delay), which cannot finish inside the 55s the job
-- was registered with. The function keeps running and its writes still land
-- when pg_net gives up, but the run reads as a failure — so raise the ceiling
-- to the 150s the manual driver already uses.
--
-- Version note: applied live via MCP `apply_migration`, which stamps the
-- version from its own call timestamp. The filename matches that stamp so
-- `db push` matches by version and skips it, and so the drift monitor sees a
-- repo file for every remote version. Idempotent: it only rewrites the
-- registry row and reschedules the job.
-- ============================================================================

do $$
declare v_cmd text;
begin
  v_cmd := $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-link-adult-profiles',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')),
    body := jsonb_build_object('batch_size', 40),
    timeout_milliseconds := 150000);
  $cmd$;

  -- Registry is the source of record; pg_cron is reconciled against it.
  update public.admin_automations
     set action = jsonb_build_object('type','cron','jobname','personality_adult_links','command', v_cmd)
   where slug = 'personality_adult_links';

  perform cron.unschedule('personality_adult_links')
   where exists (select 1 from cron.job where jobname = 'personality_adult_links');

  perform cron.schedule('personality_adult_links', '35 2 * * *', v_cmd);
end $$;
