-- Rotate the shared X-Webhook-Secret senders off the leaked literal
-- 'meilisearch-sync-webhook-2026' (it sits in git history) onto the Vault
-- secret named 'WEBHOOK_SECRET'. The receivers (backfill-venue-cities,
-- personality-extract-from-bio, backfill-llm-enrich) went fail-closed in
-- PR #1919 and compare against the WEBHOOK_SECRET *edge env*.
--
-- ROLLOUT ORDER (runbook — do NOT merge this before step 1):
--   1. Dashboard → Vault: create secret WEBHOOK_SECRET = <new strong value>
--   2. supabase secrets set WEBHOOK_SECRET=<same value>   (edge env)
--   3. Merge this migration (CI applies it) — senders switch to Vault.
-- Between 2 and 3 the four senders below get 401s; all are fire-and-forget
-- (PERFORM net.http_post) or idempotent daily backfills, so a short window
-- is harmless and heals on the next fire.
--
-- Senders converted here:
--   - trigger fn public.notify_event_geocode  (events → backfill-venue-cities)
--   - trigger fn public.notify_venue_geocode  (venues → backfill-venue-cities)
--   - cron 'personality-extract-from-bio'     (daily 04:15)
--   - cron 'classify-new-content'             (daily 04:23; drops its literal
--     COALESCE fallback — a missing Vault secret now fails loud instead of
--     silently downgrading to the leaked value)

CREATE OR REPLACE FUNCTION public.notify_event_geocode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.city_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.latitude IS NULL AND NEW.longitude IS NULL AND NEW.venue_id IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('event_id', NEW.id::text)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_venue_geocode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.latitude IS NULL AND NEW.longitude IS NULL AND (NEW.address IS NULL OR NEW.address = '') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('venue_id', NEW.id::text)
  );

  RETURN NEW;
END;
$function$;

-- Cron: personality-extract-from-bio → Vault-sourced header
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'personality-extract-from-bio';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command := $cmd$SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/personality-extract-from-bio',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET')
      ),
      body := '{"batch_size":20}'::jsonb
    );$cmd$);
  END IF;
END $$;

-- Cron: classify-new-content → drop the literal COALESCE fallback
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'classify-new-content';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command := $cmd$
    SELECT
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-llm-enrich',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
          'x-webhook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET')
        ),
        body := jsonb_build_object('target', t, 'batch_size', 40)
      )
    FROM unnest(ARRAY['venues','events','personalities','marketplace']) AS t
  $cmd$);
  END IF;
END $$;
