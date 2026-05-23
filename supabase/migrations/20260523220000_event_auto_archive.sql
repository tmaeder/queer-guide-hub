-- Phase γ D9.6: Auto-archive expired events.
-- Events with status='active' and end_date older than 7 days are flipped to
-- status='completed'. Runs daily at 03:30 UTC. Logs to admin_automation_runs.
-- 2026-05-23 backlog: 123 active events past their end_date.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'event_auto_archive',
  'Auto-archive past events',
  'Flip active events whose end_date is more than 7 days in the past to status=completed.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"status","op":"eq","value":"active"},{"field":"end_date","op":"lt","value":"now() - interval ''7 days''"}]'::jsonb,
  '{"type":"set_status","table":"events","value":"completed"}'::jsonb,
  '30 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled,
    trigger = EXCLUDED.trigger,
    conditions = EXCLUDED.conditions,
    action = EXCLUDED.action,
    schedule = EXCLUDED.schedule;

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
BEGIN
  SELECT id INTO v_automation_id
  FROM public.admin_automations
  WHERE slug = 'event_auto_archive';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES
    (v_automation_id, 'event_auto_archive', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_examined
  FROM public.events
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < now() - interval '7 days';

  WITH upd AS (
    UPDATE public.events
    SET status = 'completed',
        updated_at = now()
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date < now() - interval '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM upd;

  UPDATE public.admin_automation_runs
  SET finished_at = now(),
      items_examined = v_examined,
      items_changed = v_changed,
      summary = jsonb_build_object(
        'examined', v_examined,
        'changed', v_changed,
        'rule', 'status=active AND end_date < now() - 7 days → status=completed'
      )
  WHERE id = v_run_id;

  UPDATE public.admin_automations
  SET last_run_at = v_started_at,
      last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('examined', v_examined, 'changed', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(),
      status = 'error',
      error = SQLERRM
  WHERE id = v_run_id;
  UPDATE public.admin_automations
  SET last_run_at = v_started_at,
      last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

ALTER FUNCTION public.run_event_auto_archive() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_event_auto_archive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_event_auto_archive() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_event_auto_archive() TO authenticated;

-- Schedule daily at 03:30 UTC
SELECT cron.unschedule('event_auto_archive') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'event_auto_archive'
);

SELECT cron.schedule(
  'event_auto_archive',
  '30 3 * * *',
  $cron$ SELECT public.run_event_auto_archive(); $cron$
);
