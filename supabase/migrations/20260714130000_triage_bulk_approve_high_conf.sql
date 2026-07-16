-- Set-based bulk approve for the staging review queue. The UI's "Approve ≥90%"
-- button previously looped triage_action over the CURRENT PAGE only (perPage
-- 50), so a 300-row queue needed six clicks. This RPC approves every eligible
-- staging row in one statement and doubles as the count source for the button
-- label via p_dry_run.
--
-- Eligibility mirrors the queue selector (pending_review + pending) plus two
-- guards: confidence at/above threshold, and never a row the quality-enhance
-- LLM verdict rejected (those sit pending only briefly until the hourly
-- staging_review_sweep rejects them — a blanket approve must not race that).

CREATE OR REPLACE FUNCTION public.triage_bulk_approve_high_conf(
  p_min_confidence numeric DEFAULT 0.9,
  p_content_types text[] DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_dry_run THEN
    SELECT count(*) INTO v_count
    FROM ingestion_staging
    WHERE review_status = 'pending_review'
      AND disposition = 'pending'
      AND ai_confidence_score >= p_min_confidence
      AND coalesce(enriched_data->>'quality_status', '') <> 'rejected'
      AND (p_content_types IS NULL OR target_table = ANY(p_content_types));
    RETURN jsonb_build_object('eligible', v_count);
  END IF;

  UPDATE ingestion_staging
  SET review_status = 'approved',
      reviewed_by = p_user_id,
      reviewed_at = now(),
      review_notes = coalesce(review_notes, 'bulk: high-confidence approve (>= ' || p_min_confidence || ')')
  WHERE review_status = 'pending_review'
    AND disposition = 'pending'
    AND ai_confidence_score >= p_min_confidence
    AND coalesce(enriched_data->>'quality_status', '') <> 'rejected'
    AND (p_content_types IS NULL OR target_table = ANY(p_content_types));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('approved', v_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.triage_bulk_approve_high_conf(numeric, text[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_bulk_approve_high_conf(numeric, text[], uuid, boolean) TO authenticated;
