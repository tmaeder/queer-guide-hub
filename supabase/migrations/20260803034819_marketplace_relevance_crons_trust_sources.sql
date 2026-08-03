-- Teach the two recurring relevance drains about source-trust merchants.
--
-- marketplace-relevance only skips the LLM for sources named in `trust_sources`;
-- that list was only ever passed on manual invocations, so the ~6,900 staged
-- queerlit rows would have queued behind the shared per-UTC-day LLM cap instead of
-- stamping for free — and every LLM call spent on a dedicated queer bookshop's
-- catalog is a call not spent on a source that actually needs judging.
--
-- Both jobs keep their existing schedule (4x/hour) and daily_cap (4000, raised
-- since the original 20260703130000 migration) — this changes ONE body key.
-- cron.schedule upserts by jobname, so it is safe to re-run and does not depend on
-- a jobid that differs per environment.
--
-- The three bookstores are the editorial filter themselves; see
-- 20260713195608 for why classification_result must still be present at commit.

SELECT cron.schedule(
  'mp-drain-relevance-fresh',
  '10,25,40,55 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"newest","daily_cap":4000,"batch_size":40,"trust_sources":["queerlit","gaystheword","queerbooks"]}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);

SELECT cron.schedule(
  'mp-drain-relevance-backlog',
  '0,15,30,45 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"oldest","daily_cap":4000,"batch_size":40,"trust_sources":["queerlit","gaystheword","queerbooks"]}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);;
