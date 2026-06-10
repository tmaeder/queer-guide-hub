-- Security hardening follow-up (2026-06-10)
-- The 2026-06-10 pass gated pipeline-*/source-* functions but missed
-- non-pipeline-prefixed verify_jwt=false functions. Those are now gated with
-- requireInternalOrAdmin (marketplace-fx-sync, feedback-embed,
-- feedback-story-titler, github-notifications-poller, push-dispatcher) or a
-- hybrid RLS/internal gate (trip-nudges full sweep). Their cron jobs still
-- invoked them with the PUBLIC anon key only, which the new gates reject.
-- Add the vault-sourced x-internal-secret header, matching the
-- venue-url-checker / marketplace-link-checker pattern (jobs 197/198).
-- Schedules and bodies unchanged.

-- feedback-embed-sweep: daily 03:41
SELECT cron.alter_job(
  job_id  => 80,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-embed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"limit": 1000}'::jsonb
  ) AS request_id;
  $cmd$
);

-- push-next-item: every 5 min
SELECT cron.alter_job(
  job_id  => 83,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"kind": "next_item"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cmd$
);

-- push-doc-expiry: daily 09:03
SELECT cron.alter_job(
  job_id  => 84,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"kind": "doc_expiry"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cmd$
);

-- feedback-story-titler-sweep: daily 03:27
SELECT cron.alter_job(
  job_id  => 85,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-story-titler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"limit": 30}'::jsonb
  ) AS request_id;
  $cmd$
);

-- trip-nudges-daily: daily 05:17
SELECT cron.alter_job(
  job_id  => 86,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/trip-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cmd$
);

-- github-notifications-poller-5min: every 5 min
SELECT cron.alter_job(
  job_id  => 98,
  command => $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/github-notifications-poller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cmd$
);
