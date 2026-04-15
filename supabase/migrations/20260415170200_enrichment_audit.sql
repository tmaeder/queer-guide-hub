-- Wave 2 — Enrichment audit trail
-- Logs every enrichment delta so partial LLM/RPC failures are visible
-- and can be rolled back without losing prior good enriched_data.

BEGIN;

CREATE TABLE IF NOT EXISTS enrichment_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_id      uuid NOT NULL REFERENCES ingestion_staging(id) ON DELETE CASCADE,
  pipeline_run_id uuid REFERENCES pipeline_runs(id) ON DELETE SET NULL,
  stage           text NOT NULL,                  -- 'enrich-news','enrich-venue', etc.
  status          text NOT NULL DEFAULT 'success',-- 'success' | 'partial' | 'failed'
  changed_fields  text[] NOT NULL DEFAULT '{}',
  before_data     jsonb,
  after_data      jsonb,
  error_message   text,
  duration_ms     integer,
  actor           text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_enrichment_audit_staging
  ON enrichment_audit(staging_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_enrichment_audit_run_status
  ON enrichment_audit(pipeline_run_id, status);
CREATE INDEX IF NOT EXISTS ix_enrichment_audit_stage_status
  ON enrichment_audit(stage, status, created_at DESC);

ALTER TABLE enrichment_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enrichment_audit_read ON enrichment_audit;
CREATE POLICY enrichment_audit_read ON enrichment_audit
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS enrichment_audit_write ON enrichment_audit;
CREATE POLICY enrichment_audit_write ON enrichment_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: apply enrichment atomically — writes audit + updates enriched_data
-- in a single statement. Caller passes the new enriched payload; we diff against
-- the existing one to compute changed_fields.
CREATE OR REPLACE FUNCTION apply_enrichment(
  p_staging_id     uuid,
  p_pipeline_run_id uuid,
  p_stage          text,
  p_new_enriched   jsonb,
  p_actor          text DEFAULT 'pipeline-enrich',
  p_status         text DEFAULT 'success',
  p_error_message  text DEFAULT NULL,
  p_duration_ms    integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_changed text[];
  v_audit_id uuid;
BEGIN
  SELECT enriched_data INTO v_before
    FROM ingestion_staging WHERE id = p_staging_id FOR UPDATE;

  -- Compute changed top-level keys (cheap, good enough for audit).
  SELECT array_agg(key) INTO v_changed
  FROM (
    SELECT key FROM jsonb_each(coalesce(p_new_enriched, '{}'::jsonb))
    EXCEPT
    SELECT key FROM jsonb_each(coalesce(v_before,         '{}'::jsonb))
    UNION
    SELECT k AS key FROM (
      SELECT k FROM jsonb_object_keys(coalesce(p_new_enriched, '{}'::jsonb)) k
      INTERSECT
      SELECT k FROM jsonb_object_keys(coalesce(v_before,         '{}'::jsonb)) k
    ) common
    WHERE coalesce(p_new_enriched, '{}'::jsonb) -> common.k
       IS DISTINCT FROM
          coalesce(v_before, '{}'::jsonb) -> common.k
  ) diff;

  INSERT INTO enrichment_audit(
    staging_id, pipeline_run_id, stage, status,
    changed_fields, before_data, after_data,
    error_message, duration_ms, actor
  ) VALUES (
    p_staging_id, p_pipeline_run_id, p_stage, p_status,
    coalesce(v_changed, '{}'::text[]), v_before, p_new_enriched,
    p_error_message, p_duration_ms, p_actor
  )
  RETURNING id INTO v_audit_id;

  -- Only write enriched_data when status='success'. On 'partial' or 'failed',
  -- keep prior enriched_data intact (no half-baked records leak downstream).
  IF p_status = 'success' THEN
    UPDATE ingestion_staging
       SET enriched_data    = coalesce(enriched_data, '{}'::jsonb) || p_new_enriched,
           enrichment_status = 'enriched',
           updated_at        = now()
     WHERE id = p_staging_id;
  ELSIF p_status = 'failed' THEN
    UPDATE ingestion_staging
       SET enrichment_status = 'failed',
           error_message     = coalesce(p_error_message, error_message),
           updated_at        = now()
     WHERE id = p_staging_id;
  END IF;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_enrichment(
  uuid, uuid, text, jsonb, text, text, text, integer
) TO authenticated, service_role;

COMMIT;
