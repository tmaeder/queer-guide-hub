-- Security hardening follow-up (2026-06-10)
-- enrich-logos and enrich-venue are gated (requireInternalOrAdmin) but their
-- cron jobs still sent only the public anon key, so every nightly run 401'd.
-- Add the vault-sourced x-internal-secret header. Schedules and bodies unchanged.

-- enrich-logos-venues: daily 03:30
SELECT cron.alter_job(
  job_id  => 55,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"content_type": "venues", "batch": true, "batch_limit": 200}'::jsonb
  ) AS request_id;
  $cmd$
);

-- enrich-logos-events: daily 03:35
SELECT cron.alter_job(
  job_id  => 56,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"content_type": "events", "batch": true, "batch_limit": 200}'::jsonb
  ) AS request_id;
  $cmd$
);

-- hotel-reenrich-stale: daily 04:23
SELECT cron.alter_job(
  job_id  => 67,
  command => $cmd$
    WITH stale AS (
      SELECT id FROM public.venues
      WHERE accommodation_type IS NOT NULL
        AND duplicate_of_id IS NULL
        AND (last_refreshed_at IS NULL OR last_refreshed_at < now() - interval '90 days')
      ORDER BY last_refreshed_at NULLS FIRST
      LIMIT 50
    )
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-venue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
      ),
      body := jsonb_build_object('venue_ids', (SELECT array_agg(id) FROM stale), 'reason', 'scheduled_reenrich')
    )
    WHERE EXISTS (SELECT 1 FROM stale);
  $cmd$
);
