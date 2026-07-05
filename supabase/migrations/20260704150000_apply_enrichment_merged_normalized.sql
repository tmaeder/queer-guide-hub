-- apply_enrichment gains p_merged_normalized (default NULL): when the enrich
-- stage also merged fields into normalized_data (description/tags backfill),
-- the write now happens inside the same RPC/statement instead of a separate
-- UPDATE from the edge function — halving staging writes on the hourly news
-- path (follow-up documented in #1923).
--
-- DROP+CREATE instead of CREATE OR REPLACE: adding a defaulted parameter via
-- REPLACE would create a second overload and make 8-argument PostgREST calls
-- ambiguous (PGRST203). Old callers keep working through the default.
-- Applied 2026-07-04 via MCP (repair --status applied) — CI will skip.

DROP FUNCTION public.apply_enrichment(uuid, uuid, text, jsonb, text, text, text, integer);

CREATE FUNCTION public.apply_enrichment(
  p_staging_id uuid,
  p_pipeline_run_id uuid,
  p_stage text,
  p_new_enriched jsonb,
  p_actor text DEFAULT 'pipeline-enrich'::text,
  p_status text DEFAULT 'success'::text,
  p_error_message text DEFAULT NULL::text,
  p_duration_ms integer DEFAULT NULL::integer,
  p_merged_normalized jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before jsonb;
  v_changed text[];
  v_audit_id uuid;
BEGIN
  SELECT enriched_data INTO v_before FROM ingestion_staging WHERE id = p_staging_id FOR UPDATE;

  WITH new_keys AS (SELECT key FROM jsonb_each(coalesce(p_new_enriched, '{}'::jsonb))),
       old_keys AS (SELECT key FROM jsonb_each(coalesce(v_before, '{}'::jsonb))),
       added AS (SELECT key FROM new_keys EXCEPT SELECT key FROM old_keys),
       removed AS (SELECT key FROM old_keys EXCEPT SELECT key FROM new_keys),
       changed AS (
         SELECT n.key FROM new_keys n JOIN old_keys o USING (key)
          WHERE coalesce(p_new_enriched,'{}'::jsonb) -> n.key
                IS DISTINCT FROM coalesce(v_before,'{}'::jsonb) -> n.key
       )
  SELECT array_agg(key) INTO v_changed
    FROM (SELECT key FROM added UNION SELECT key FROM removed UNION SELECT key FROM changed) d;

  INSERT INTO enrichment_audit(
    staging_id, pipeline_run_id, stage, status,
    changed_fields, before_data, after_data, error_message, duration_ms, actor
  ) VALUES (
    p_staging_id, p_pipeline_run_id, p_stage, p_status,
    coalesce(v_changed, '{}'::text[]), v_before, p_new_enriched,
    p_error_message, p_duration_ms, p_actor
  ) RETURNING id INTO v_audit_id;

  -- Merge write is independent of status: adopters may salvage partial data
  -- (e.g. a fetched image) even when the primary enrichment failed — matches
  -- the previous edge-function behavior of an unconditional UPDATE.
  IF p_merged_normalized IS NOT NULL THEN
    UPDATE ingestion_staging
       SET normalized_data = p_merged_normalized, updated_at = now()
     WHERE id = p_staging_id;
  END IF;

  IF p_status = 'success' THEN
    UPDATE ingestion_staging
       SET enriched_data = coalesce(enriched_data, '{}'::jsonb) || p_new_enriched,
           enrichment_status = 'enriched', updated_at = now()
     WHERE id = p_staging_id;
  ELSIF p_status = 'failed' THEN
    UPDATE ingestion_staging
       SET enrichment_status = 'failed',
           error_message = coalesce(p_error_message, error_message),
           updated_at = now()
     WHERE id = p_staging_id;
  END IF;

  RETURN v_audit_id;
END;
$function$;
