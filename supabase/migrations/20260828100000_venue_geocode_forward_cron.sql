-- Schedule the FORWARD geocode pass (address → coordinates).
--
-- backfill-venue-cities has three modes. Only 'postal' was ever scheduled
-- (geo_address_drain, */5). 'forward' — the one that turns a street address
-- into coordinates — had no cron and no admin_automations row anywhere, so it
-- was reachable only by a manual admin call and in practice never ran.
--
-- That was survivable while the pass only looked at venues with NO city link,
-- a small and mostly abandoned population. It stopped being survivable with
-- 20260827100000: the centroid repair deliberately NULLs coordinates so the
-- forward pass can resolve them from the address, and the first batch of 200
-- produced 54 rows classified geocodable. Without a scheduler those rows trade
-- a wrong coordinate for no coordinate and never recover — a worse outcome than
-- the centroid they replaced, and precisely the regression the repair's own
-- filter fix was written to avoid.
--
-- Verified before writing this: `SELECT ... FROM cron.job WHERE command ILIKE
-- '%backfill-venue-cities%'` returned exactly one row (mode 'postal'), and
-- admin_automations had zero rows matching forward/geocode.
--
-- Cadence: every 15 minutes at batch 25 = 100 venues/hour, so the ~2,100 rows
-- the full repair will produce drain in about a day. The function sleeps
-- SLEEP_MS=1100 between calls against public Nominatim (their 1 req/s policy),
-- making a batch of 25 about 28s — inside the 55s timeout used below, with
-- headroom. A larger batch would risk the timeout, and the function caps
-- batch_size at 50 anyway.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
VALUES (
  'venue_geocode_forward',
  'venue_geocode_forward',
  'Forward-geocodes venues that have a usable address but no coordinates (address → lat/lng via Nominatim). Consumes what the centroid repair nulls.',
  'system',
  true,
  jsonb_build_object('type','schedule'),
  '*/15 * * * *',
  jsonb_build_object(
    'type','cron',
    'jobname','venue_geocode_forward',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'forward', 'batch_size', 25),
    timeout_milliseconds := 55000
  );
  $cmd$
  )
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = true;

-- Registry row first, then the job — admin_automations is the registry of
-- record and sync_automations_to_cron() reconciles pg_cron against it.
SELECT cron.schedule('venue_geocode_forward', '*/15 * * * *', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'forward', 'batch_size', 25),
    timeout_milliseconds := 55000
  );
  $cmd$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_geocode_forward');
