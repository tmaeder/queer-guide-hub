-- Hourly staging review sweep: re-gates ingestion_staging rows stuck in
-- pending_review. pipeline-review-gate's sweep mode consumes the LLM verdict
-- pipeline-quality-enhance stamped after the row was queued (auto_publish →
-- approve, quality_status='rejected' → reject) and applies the confidence-only
-- fallback for rows whose scorer never ran, so the /admin/review?tab=staging
-- queue holds only items that genuinely need a human. The edge function
-- self-gates via requireInternalOrAdmin (verify_jwt=false).

DO $$ BEGIN
  PERFORM cron.unschedule('staging_review_sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staging_review_sweep');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'staging_review_sweep',
  '20 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-review-gate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"sweep": true}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $cron$
);

INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'staging_review_sweep',
  'Staging review sweep',
  'Hourly (:20), re-gates ingestion_staging rows stuck in pending_review: applies the quality-enhance LLM verdict (auto-publish/reject) and confidence-only fallback so only genuine human calls stay in the /admin/review staging queue.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "pipeline-review-gate", "type": "edge", "body": {"sweep": true}}'::jsonb,
  '20 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      managed_by  = EXCLUDED.managed_by,
      trigger     = EXCLUDED.trigger,
      action      = EXCLUDED.action,
      schedule    = EXCLUDED.schedule,
      updated_at  = now();
