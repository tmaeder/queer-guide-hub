-- One-shot drain for the bare-street coordinate repair.
-- Audit + rationale: docs/audits/2026-08-22-venue-forward-geocode.md
--
-- Repairs a stored coordinate ONLY when the corrected query lands >=25 km away
-- AND the new answer is corroborated by a second, independent signal (the row's
-- own postcode, or its own city name). The 1-25 km band is flagged for review
-- and never auto-written: measured on prod, that band mixes a genuinely wrong
-- town (Dunkin'/Haffner's, 4.9 km, Chelmsford vs Westford), a street MIDPOINT
-- vs a precise stored pin (Massamara, 1.4 km) and a wrong BUSINESS on the right
-- road (Zamboanga Electric -> "Toyota Zamboanga City", 4.8 km). Rewriting the
-- second makes a good pin worse; rewriting the third moves a venue to an
-- unrelated company.
--
-- Why a cron rather than a loop of net.http_post calls: the repair selector is
-- resumable BY STAMP (enrichment_status.geocode.verified_at), so two concurrent
-- invocations select the SAME unstamped rows — duplicating work and doubling the
-- load on public Nominatim, whose policy is 1 req/s. pg_cron at */1 with a run
-- that finishes inside the function's 45s soft deadline is serialized in
-- practice.
--
-- Self-terminating: once every row carries verified_at the pool is empty and a
-- run costs one count query. RETIREMENT IS STILL REQUIRED — disable the registry
-- row FIRST, then unschedule. Never DELETE the row, or branch (a) of
-- sync_automations_to_cron reports the job as unregistered forever.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
VALUES (
  'venue_geocode_repair',
  'venue_geocode_repair',
  'One-shot: re-geocodes bare-street venues with the corrected query and repairs a stored coordinate only when it is >=25km away AND the new answer is corroborated by the row''s own postcode or city. 1-25km is flagged for review, never auto-written. Retire once remaining=0.',
  'system',
  true,
  jsonb_build_object('type','schedule'),
  '* * * * *',
  jsonb_build_object(
    'type','cron',
    'jobname','venue_geocode_repair',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'forward_repair', 'batch_size', 50, 'dry_run', false),
    timeout_milliseconds := 90000
  );
  $cmd$
  )
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = true;

SELECT cron.schedule('venue_geocode_repair', '* * * * *', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'forward_repair', 'batch_size', 50, 'dry_run', false),
    timeout_milliseconds := 90000
  );
$cmd$);
