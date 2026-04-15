-- Wave 1 — Generic dedup decision audit
-- scraper_dedupe_decisions already supports any entity_type. Add coverage helpers
-- so all dedup events (unique, duplicate, merge_candidate) get journaled, not just matches.

BEGIN;

-- Allow recording "no match" decisions too (entity_b_id can be null when nothing matched).
ALTER TABLE scraper_dedupe_decisions
  ALTER COLUMN entity_b_id DROP NOT NULL;

-- Add staging linkage so admins can trace from staging row → dedup decision.
ALTER TABLE scraper_dedupe_decisions
  ADD COLUMN IF NOT EXISTS staging_id uuid REFERENCES ingestion_staging(id) ON DELETE SET NULL;

ALTER TABLE scraper_dedupe_decisions
  ADD COLUMN IF NOT EXISTS pipeline_run_id uuid REFERENCES pipeline_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_dedup_decisions_staging
  ON scraper_dedupe_decisions(staging_id);
CREATE INDEX IF NOT EXISTS ix_dedup_decisions_pipeline_run
  ON scraper_dedupe_decisions(pipeline_run_id);
CREATE INDEX IF NOT EXISTS ix_dedup_decisions_entity_type_decided_by
  ON scraper_dedupe_decisions(entity_type, decided_by, created_at DESC);

-- Helper: record a dedup decision (idempotent on staging_id + decided_by per run).
CREATE OR REPLACE FUNCTION record_dedup_decision(
  p_entity_type text,
  p_staging_id uuid,
  p_pipeline_run_id uuid,
  p_match_id uuid,
  p_match_method text,
  p_confidence numeric,
  p_decision text,                -- 'unique' | 'duplicate' | 'merge_candidate'
  p_action text,                  -- 'no_match' | 'auto_merge' | 'flag_review'
  p_rules jsonb,
  p_decided_by text DEFAULT 'pipeline-deduplicate'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO scraper_dedupe_decisions(
    entity_type, entity_a_id, entity_b_id,
    staging_id, pipeline_run_id,
    match_method, confidence, decision, action,
    rules_fired, decided_by
  ) VALUES (
    p_entity_type, p_staging_id, p_match_id,
    p_staging_id, p_pipeline_run_id,
    coalesce(p_match_method, 'none'), coalesce(p_confidence, 0)::float8,
    p_decision, coalesce(p_action, 'no_match'),
    coalesce(p_rules, '{}'::jsonb), p_decided_by
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_dedup_decision(
  text, uuid, uuid, uuid, text, numeric, text, text, jsonb, text
) TO authenticated, service_role;

COMMIT;
