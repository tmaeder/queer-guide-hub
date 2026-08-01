-- ============================================================================
-- geo_address_drain: give the request a timeout it can actually finish in
-- ----------------------------------------------------------------------------
-- The cron reported status='succeeded' and cron.job_run_details looked healthy,
-- but the job was doing NOTHING. net.http_post defaults to a 5000 ms timeout,
-- and a batch of 25 paced at 1100 ms between Photon calls needs ~28 s. pg_net
-- aborted every request; net._http_response recorded rows with a NULL
-- status_code (not an error code — just nothing), and the queue never moved.
--
-- Caught by accounting, not by the cron's own status: 21,170 rows seeded minus
-- 7,800 drained by the operator script left 13,370, and the queue held 13,361.
-- Every row that had drained was the script's. A cron whose run_details say
-- "succeeded" can still be a no-op — check that the WORK happened.
--
-- 55 s covers a 25-row batch with headroom while staying under the edge
-- function's own wall clock. Keep batch_size * PHOTON_INTERVAL_MS comfortably
-- below this if either is ever raised.
-- ============================================================================

select cron.unschedule('geo_address_drain')
where exists (select 1 from cron.job where jobname = 'geo_address_drain');

select cron.schedule(
  'geo_address_drain',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'postal', 'batch_size', 25),
    timeout_milliseconds := 55000
  );
  $cmd$
);

-- Keep the registry's copy of the command in step with what is scheduled.
update public.admin_automations a
   set action = jsonb_set(a.action, '{command}',
                          to_jsonb((select command from cron.job where jobname = 'geo_address_drain')))
 where a.slug = 'geo_address_drain';
