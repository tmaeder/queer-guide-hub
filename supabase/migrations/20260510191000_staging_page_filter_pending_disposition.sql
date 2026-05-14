-- Fix: get_staging_page returns items with all dispositions, causing count
-- mismatch with get_admin_counts which filters disposition='pending'.
-- Default the base WHERE to only show pending-disposition items (the ones
-- that actually need review). This matches get_admin_counts behavior.

CREATE OR REPLACE FUNCTION public.get_staging_page(
  p_target_table text DEFAULT NULL,
  p_review_status text DEFAULT NULL,
  p_dedup_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50,
  p_sort_field text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc'
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_offset INT; v_total INT; v_items JSON; v_query TEXT; v_count_query TEXT;
  v_where TEXT := 'WHERE s.disposition = ''pending''';
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  v_offset := (GREATEST(p_page,1)-1) * p_per_page;
  IF p_target_table IS NOT NULL THEN v_where := v_where || ' AND s.target_table = ' || quote_literal(p_target_table); END IF;
  IF p_review_status IS NOT NULL THEN v_where := v_where || ' AND s.review_status = ' || quote_literal(p_review_status); END IF;
  IF p_dedup_status IS NOT NULL THEN v_where := v_where || ' AND s.dedup_status = ' || quote_literal(p_dedup_status); END IF;
  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || ' AND (s.normalized_data::text ILIKE ' || quote_literal('%' || p_search || '%') || ')';
  END IF;
  v_count_query := 'SELECT count(*) FROM ingestion_staging s ' || v_where;
  EXECUTE v_count_query INTO v_total;
  IF p_sort_field NOT IN ('created_at','updated_at','dedup_match_score','ai_confidence_score','target_table') THEN
    p_sort_field := 'created_at';
  END IF;
  IF p_sort_dir NOT IN ('asc','desc') THEN p_sort_dir := 'desc'; END IF;
  v_query := format(
    'SELECT json_agg(row_to_json(t)) FROM (SELECT s.id, s.job_id, s.source_type, s.target_table, s.normalized_data, s.raw_data, s.ai_validation_status, s.ai_confidence_score, s.ai_validation_result, s.dedup_status, s.dedup_match_id, s.dedup_match_table, s.dedup_match_score, s.dedup_details, s.review_status, s.reviewed_by, s.reviewed_at, s.review_notes, s.disposition, s.error_message, s.created_at, s.updated_at FROM ingestion_staging s %s ORDER BY s.%I %s NULLS LAST LIMIT %s OFFSET %s) t',
    v_where, p_sort_field, p_sort_dir, p_per_page, v_offset);
  EXECUTE v_query INTO v_items;
  RETURN json_build_object('items', COALESCE(v_items,'[]'::json), 'total', v_total,
    'page', p_page, 'per_page', p_per_page, 'total_pages', CEIL(v_total::numeric / p_per_page));
END;
$$;
