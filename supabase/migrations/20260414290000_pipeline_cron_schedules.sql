-- Schedule venue + event pipeline stages via pg_cron.
-- Runs every 5 min with per-stage offsets to avoid stampede.
-- Venues use the direct SQL RPC for commit (no edge-function roundtrip).
-- Events go through the pipeline-commit edge function (user's events path).

DO $$
DECLARE
  v_url  TEXT := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1';
  v_auth TEXT := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  v_headers_text TEXT;
BEGIN
  v_headers_text := jsonb_build_object('Content-Type','application/json','Authorization',v_auth)::text;

  PERFORM cron.unschedule(jobid) FROM cron.job
  WHERE jobname IN (
    'pipeline-venue-validate','pipeline-venue-dedup','pipeline-venue-commit',
    'pipeline-event-validate','pipeline-event-dedup','pipeline-event-commit'
  );

  PERFORM cron.schedule('pipeline-venue-validate', '*/5 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
           body:='{"entityType":"venue","batch_size":100}'::jsonb);
  $f$, v_url || '/pipeline-validate', v_headers_text));

  PERFORM cron.schedule('pipeline-venue-dedup', '1-59/5 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
           body:='{"batch_size":100}'::jsonb);
  $f$, v_url || '/pipeline-deduplicate', v_headers_text));

  PERFORM cron.schedule('pipeline-venue-commit', '2-59/5 * * * *', $f$
    SELECT count(*) FROM public.commit_venue_staging_batch(200);
  $f$);

  PERFORM cron.schedule('pipeline-event-validate', '*/5 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
           body:='{"entityType":"event","batch_size":100}'::jsonb);
  $f$, v_url || '/pipeline-validate', v_headers_text));

  PERFORM cron.schedule('pipeline-event-dedup', '1-59/5 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
           body:='{"batch_size":100}'::jsonb);
  $f$, v_url || '/pipeline-deduplicate', v_headers_text));

  PERFORM cron.schedule('pipeline-event-commit', '3-59/5 * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
           body:='{"targetTable":"events","batch_size":100}'::jsonb);
  $f$, v_url || '/pipeline-commit', v_headers_text));
END $$;
