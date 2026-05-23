-- Phase γ continued: Purge old completed workflow_runs.
-- 67k completed runs spanning 2 months crowd the table. Keep last 30 days;
-- always retain failed + dead_letter for diagnostics. Daily 04:00 UTC.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'workflow_runs_purge',
  'Purge old workflow runs',
  'Delete workflow_runs.status=completed older than 30 days. Failed and dead_letter rows always retained for diagnostics.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"status","op":"eq","value":"completed"},{"field":"started_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
  '{"type":"delete","table":"workflow_runs"}'::jsonb,
  '0 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled,
    trigger = EXCLUDED.trigger,
    conditions = EXCLUDED.conditions,
    action = EXCLUDED.action,
    schedule = EXCLUDED.schedule;

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
BEGIN
  SELECT id INTO v_automation_id
  FROM public.admin_automations
  WHERE slug = 'workflow_runs_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES
    (v_automation_id, 'workflow_runs_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_examined
  FROM public.workflow_runs
  WHERE status = 'completed'
    AND started_at < v_threshold;

  WITH del AS (
    DELETE FROM public.workflow_runs
    WHERE status = 'completed'
      AND started_at < v_threshold
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM del;

  UPDATE public.admin_automation_runs
  SET finished_at = now(),
      items_examined = v_examined,
      items_changed = v_changed,
      summary = jsonb_build_object(
        'deleted', v_changed,
        'threshold_days', 30,
        'rule', 'status=completed AND started_at<now()-30d -> delete'
      )
  WHERE id = v_run_id;

  UPDATE public.admin_automations
  SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('deleted', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM
  WHERE id = v_run_id;
  UPDATE public.admin_automations
  SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

ALTER FUNCTION public.run_workflow_runs_purge() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_workflow_runs_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_workflow_runs_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_workflow_runs_purge() TO authenticated;

-- Extend dispatch RPCs to cover the new automation.
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
  ELSIF p_slug = 'workflow_runs_purge' THEN
    v_result := public.run_workflow_runs_purge();
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
    SELECT count(*) INTO v_examined FROM public.events
      WHERE status='active' AND end_date IS NOT NULL
        AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
      WHERE review_status='pending_review' AND disposition='pending'
        AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
      WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSE
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at,
     status, items_examined, items_changed, summary)
  VALUES
    (v_automation_id, p_slug, v_started_at, now(),
     'dry_run', v_examined, 0,
     jsonb_build_object('mode','dry_run','would_change',v_examined));

  RETURN jsonb_build_object('would_change', v_examined);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workflow_runs_purge') THEN
    PERFORM cron.unschedule('workflow_runs_purge');
  END IF;
END $$;

SELECT cron.schedule(
  'workflow_runs_purge',
  '0 4 * * *',
  'SELECT public.run_workflow_runs_purge();'
);
