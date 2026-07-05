-- ============================================================================
-- Add pipeline-quality-score to the events staging drain
-- ----------------------------------------------------------------------------
-- The events drain (20260704090000) ran validate -> dedup -> review -> commit
-- but omitted quality-score. review-gate computes
--   combinedScore = ai_confidence*0.6 + quality_score/100*0.4
-- and floors auto-approval at minConfidence (0.7). With no quality_score the
-- term is 0, so combinedScore caps at 0.6 and EVERY event row is routed to the
-- human review queue (pending_review) instead of committing — the exact stall
-- seen on the gaycities backfill.
--
-- This inserts an ev-drain-quality tick between dedup(:22) and review(:37) so
-- rows carry a real quality_score before review-gate scores them. Same two-header
-- auth pattern as the sibling ticks.
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule('ev-drain-quality')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ev-drain-quality');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('ev-drain-quality', '29 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-quality-score',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"event","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
