-- Fix venue-ingestion-unified: was marked is_template=true but is active canonical pipeline
UPDATE pipeline_definitions
SET is_template = false
WHERE name = 'venue-ingestion-unified';

-- Remove legacy per-stage crons that bypass the DAG pipeline-executor.
-- These directly call pipeline-normalize/deduplicate/commit functions outside DAG context,
-- causing potential double-processing when the DAG commit node also runs.
-- The pipeline-executor DAG handles the full lifecycle for each content type.
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  -- Venue per-stage (bypassed by venue-ingestion-unified DAG)
  'pipeline-venue-normalize',
  'pipeline-venue-validate',
  'pipeline-venue-dedup',
  'pipeline-venue-commit',
  -- Event per-stage (bypassed by events-ingestion-bulletproof DAG)
  'pipeline-event-normalize',
  'pipeline-event-validate',
  'pipeline-event-dedup',
  'pipeline-event-commit',
  -- News per-stage (bypassed by news-ingestion DAG)
  'pipeline-news-validate',
  'pipeline-news-dedup',
  'pipeline-news-commit',
  -- City/Country dedup (bypassed by city-ingestion/country-ingestion DAGs)
  'pipeline-city-dedup',
  'pipeline-city-commit',
  'pipeline-country-dedup'
);
