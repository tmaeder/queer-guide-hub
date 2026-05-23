-- Phase γ: runners check admin_automations.enabled before mutating.
-- Lets admins pause an automation from the UI without unscheduling pg_cron.
-- A paused run still writes a 'success / 0 changed' audit row with note='paused'.

CREATE OR REPLACE FUNCTION public.run_event_auto_archive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id bigint;
  v_examined int := 0;
  v_changed int := 0;
  v_started_at timestamptz := now();
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'event_auto_archive';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'event_auto_archive', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at = now(),
        summary = jsonb_build_object('skipped', true, 'reason', 'paused')
    WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
    WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.events
  WHERE status='active' AND end_date IS NOT NULL
    AND end_date < now() - interval '7 days';

  WITH upd AS (
    UPDATE public.events SET status='completed', updated_at=now()
    WHERE status='active' AND end_date IS NOT NULL
      AND end_date < now() - interval '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM upd;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined, items_changed = v_changed,
      summary = jsonb_build_object('examined', v_examined, 'changed', v_changed,
        'rule', 'status=active AND end_date < now() - 7 days -> status=completed')
  WHERE id = v_run_id;

  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('examined', v_examined, 'changed', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_staging_auto_reject_stale()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id bigint;
  v_examined int := 0;
  v_changed int := 0;
  v_started_at timestamptz := now();
  v_threshold timestamptz := now() - interval '60 days';
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'staging_auto_reject_stale';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'staging_auto_reject_stale', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at = now(),
        summary = jsonb_build_object('skipped', true, 'reason', 'paused')
    WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
    WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.ingestion_staging
  WHERE review_status='pending_review' AND disposition='pending'
    AND created_at < v_threshold;

  WITH upd AS (
    UPDATE public.ingestion_staging
    SET review_status='rejected', disposition='rejected',
        review_notes = COALESCE(review_notes || E'\n','') ||
          'Auto-rejected: stale (no human action within 60 days)',
        reviewed_at=now()
    WHERE review_status='pending_review' AND disposition='pending'
      AND created_at < v_threshold
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM upd;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined, items_changed = v_changed,
      summary = jsonb_build_object('examined', v_examined, 'changed', v_changed,
        'threshold_days', 60,
        'rule', 'pending_review + pending + age>60d -> rejected')
  WHERE id = v_run_id;

  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('examined', v_examined, 'changed', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_workflow_runs_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id bigint;
  v_examined int := 0;
  v_changed int := 0;
  v_started_at timestamptz := now();
  v_threshold timestamptz := now() - interval '30 days';
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'workflow_runs_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'workflow_runs_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at = now(),
        summary = jsonb_build_object('skipped', true, 'reason', 'paused')
    WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
    WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.workflow_runs
  WHERE status='completed' AND started_at < v_threshold;

  WITH del AS (
    DELETE FROM public.workflow_runs
    WHERE status='completed' AND started_at < v_threshold
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM del;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined, items_changed = v_changed,
      summary = jsonb_build_object('deleted', v_changed, 'threshold_days', 30,
        'rule', 'status=completed AND started_at<now()-30d -> delete')
  WHERE id = v_run_id;

  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('deleted', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

-- Admin-only toggle RPC
CREATE OR REPLACE FUNCTION public.admin_automation_set_enabled(p_slug text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  UPDATE public.admin_automations
  SET enabled = p_enabled
  WHERE slug = p_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  RETURN jsonb_build_object('slug', p_slug, 'enabled', p_enabled);
END;
$$;

ALTER FUNCTION public.admin_automation_set_enabled(text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_set_enabled(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_automation_set_enabled(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_set_enabled(text, boolean) TO authenticated;
