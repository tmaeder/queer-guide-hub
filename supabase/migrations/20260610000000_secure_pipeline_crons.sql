-- Security hardening (2026-06-10)
-- Companion to the edge-function gating that adds requireInternalOrAdmin to all
-- pipeline-*/source-* functions. Two cron jobs invoked those functions directly
-- with the PUBLIC anon key as the bearer token, which the new gate rejects.
-- Migrate them to the service-role key (sourced from Vault), matching the
-- marketplace-link-checker / venue-url-checker pattern. Schedules unchanged.

-- pipeline-dlq-consumer: every minute
SELECT cron.alter_job(
  job_id  => 65,
  command => $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/pipeline-dlq-consumer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{"limit":50}'::jsonb
    );
  $cmd$
);

-- pipeline-geo-validate: daily 05:00
SELECT cron.alter_job(
  job_id  => 132,
  command => $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/pipeline-geo-validate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{"batch_size":30,"only_new":true}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);

-- NOTE: the public feedback-screenshots bucket (anon INSERT) is intentionally
-- left open. The feedback widget supports anonymous submitters, who attach
-- screenshots via this bucket; requiring auth would silently drop their
-- screenshots. Abuse is bounded by the bucket's MIME whitelist (JPEG/PNG/WEBP)
-- and 5 MB size cap. Accepted as low risk.
