-- =============================================================================
-- Hourly pg_cron job that triggers `sync-supabase-advisors` edge function.
-- Surfaces Supabase Security + Performance advisor findings in the
-- /admin/feedback → API Errors kanban.
-- =============================================================================
-- Required one-time setup:
--   1. Create a Personal Access Token at
--      https://supabase.com/dashboard/account/tokens (needs project:read)
--   2. Set function secret `SUPABASE_MANAGEMENT_ACCESS_TOKEN` to that PAT via
--      Project Settings → Edge Functions → Secrets
--   3. Deploy the edge function: `supabase functions deploy sync-supabase-advisors`
--
-- The cron job below is idempotent: it fires but the function returns 500
-- until the PAT is set; once set, rows start appearing. Auto-resolves
-- findings that disappear between runs.
-- =============================================================================

-- Drop any previous schedule to keep re-runs idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('sync-supabase-advisors-hourly')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-supabase-advisors-hourly'
  );
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

-- Schedule hourly at :17 past to avoid thundering herd with other cron jobs.
-- URL + anon key are hardcoded to match the pattern used by every other
-- cron → edge function job in this project (see enrich-entity-consumer,
-- enrich-logos-*). verify_jwt=true on the function validates the anon JWT;
-- the function's own service-role key comes from its env, not the request.
SELECT cron.schedule(
  'sync-supabase-advisors-hourly',
  '17 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-supabase-advisors',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);
