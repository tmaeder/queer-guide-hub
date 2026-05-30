-- Continuous refresh loop: invoke personality-refresh every 30 min.
-- Uses pg_net net.http_post — same pattern as 20260414290000_pipeline_cron_schedules.sql.
-- Batch of 25/run × 48 runs/day ≈ 1,200 records/day → full ~12.5k eligible corpus
-- cycled ~every 10 days, then re-prioritised by staleness (priority DESC in the view).
--
-- v_auth uses the project anon bearer (same token the existing pipeline crons use).
-- personality-refresh runs getServiceClient() internally and is deployed with
-- verify_jwt=false, so the bearer only needs to satisfy the gateway.

DO $$
DECLARE
  v_url     TEXT := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1';
  v_auth    TEXT := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  v_headers TEXT;
BEGIN
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization',v_auth)::text;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-refresh';
  PERFORM cron.schedule('personality-refresh', '*/30 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:='{"batch_size":25}'::jsonb);
  $f$, v_url || '/personality-refresh', v_headers));
END $$;
