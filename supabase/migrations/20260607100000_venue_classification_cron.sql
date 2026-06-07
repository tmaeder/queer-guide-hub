-- Continuous LGBTQ+ relevance classification for newly-ingested rows.
--
-- Regression (audit 2026-06-07): 7,854 live venues had lgbti_relevance_score NULL despite
-- classified_at being set. Two root causes — (1) backfill-llm-enrich stamped classified_at
-- even when the LLM returned no parseable score, then the classified_at cursor skipped the
-- row forever (fixed in the function: deterministic 0.0 floor); (2) NO scheduled job ran the
-- classifier over new ingests, so anything committed after the one-shot backfill stayed NULL.
--
-- This adds the missing continuous driver: a daily cron that classifies rows with
-- classified_at IS NULL across the relevance-only targets. New-row volume is low, so one
-- small batch per target per day is sufficient; the function is idempotent and resumable.
-- Four separate edge invocations = at most 4 concurrent LLM calls (the safe shard ceiling;
-- 8 once tripped the shared CF Workers AI breaker).

select cron.unschedule('classify-new-content') where exists (
  select 1 from cron.job where jobname = 'classify-new-content'
);
select cron.schedule(
  'classify-new-content',
  '23 4 * * *',
  $$
    SELECT
      net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/backfill-llm-enrich',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET'), 'meilisearch-sync-webhook-2026')
        ),
        body := jsonb_build_object('target', t, 'batch_size', 40)
      )
    FROM unnest(ARRAY['venues','events','personalities','marketplace']) AS t
  $$
);
