-- Phase γ: Admin-callable dispatch + dry-run for system automations.
-- Admins can trigger a registered system automation by slug, or preview
-- how many rows it would change without mutating anything.

CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  IF p_slug = 'event_auto_archive' THEN
    v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    v_result := public.run_staging_auto_reject_stale();
  ELSE
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_examined int := 0;
  v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined
    FROM public.events
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined
    FROM public.ingestion_staging
    WHERE review_status = 'pending_review'
      AND disposition = 'pending'
      AND created_at < now() - interval '60 days';
  ELSE
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at,
     status, items_examined, items_changed, summary)
  VALUES
    (v_automation_id, p_slug, v_started_at, now(),
     'dry_run', v_examined, 0,
     jsonb_build_object('mode', 'dry_run', 'would_change', v_examined));

  RETURN jsonb_build_object('would_change', v_examined);
END;
$$;

ALTER FUNCTION public.admin_automation_run(text) OWNER TO postgres;
ALTER FUNCTION public.admin_automation_dry_run(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_run(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_automation_dry_run(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_automation_run(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_run(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_dry_run(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_dry_run(text) TO authenticated;
