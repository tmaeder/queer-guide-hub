-- The enqueue_content_enrichment_on_insert trigger enqueues geo-link-content /
-- populate-embeddings messages with triggered_by='db_trigger', which the
-- workflow_runs_triggered_by_check constraint rejected. Every new-content
-- enrichment run failed its workflow_runs insert (400) and dead-lettered
-- after retries — embeddings + geo-linking for new content silently never ran
-- (16k dead-letter messages since 2026-05-10).
ALTER TABLE public.workflow_runs
  DROP CONSTRAINT workflow_runs_triggered_by_check;

ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_triggered_by_check
  CHECK (triggered_by IN ('cron','webhook','admin','api','system','db_trigger'));
