-- Allow an authenticated reviewer to correct presentation fields on a pending
-- staging row before deciding it. Only changed top-level fields are accepted;
-- identity and provenance keys remain immutable.
CREATE OR REPLACE FUNCTION public.update_staging_review_fields(
  p_item_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_forbidden text[] := ARRAY[
    'id', 'entity_id', 'entity_type', 'entity_table', 'source_id', 'source_name',
    'source_type', 'created_at', 'updated_at', 'review_status', 'disposition',
    'reviewed_by', 'reviewed_at'
  ];
  v_key text;
  v_result jsonb;
BEGIN
  IF NOT public.has_any_role_jwt(
    ARRAY['admin'::public.app_role, 'moderator'::public.app_role]
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_changes IS NULL
    OR jsonb_typeof(p_changes) <> 'object'
    OR p_changes = '{}'::jsonb
  THEN
    RAISE EXCEPTION 'changes must be a non-empty object' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF lower(v_key) = ANY(v_forbidden) THEN
      RAISE EXCEPTION 'field cannot be edited here: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.ingestion_staging
  SET normalized_data = coalesce(normalized_data, '{}'::jsonb) || p_changes,
      updated_at = now()
  WHERE id = p_item_id
    AND review_status = 'pending_review'
  RETURNING normalized_data INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'staging item is not pending review' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_staging_review_fields(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staging_review_fields(uuid, jsonb)
  TO authenticated, service_role;
