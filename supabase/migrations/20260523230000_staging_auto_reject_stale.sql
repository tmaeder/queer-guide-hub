-- Phase γ D9.x: Auto-reject stale staging rows.
-- 88% of pending_review staging rows are >60d old. They never get human
-- action and crowd the queue. This automation flips them to rejected
-- with a clear review_notes audit trail. Daily cron at 03:45 UTC.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'staging_auto_reject_stale',
  'Auto-reject stale staging',
  'Staging rows pending review for more than 60 days flip to review_status=rejected, disposition=rejected, with an audit note. Removes 88% of stale queue depth.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"review_status","op":"eq","value":"pending_review"},{"field":"disposition","op":"eq","value":"pending"},{"field":"created_at","op":"lt","value":"now() - interval ''60 days''"}]'::jsonb,
  '{"type":"set_status","table":"ingestion_staging","review_status":"rejected","disposition":"rejected","note":"Auto-rejected: stale (no human action within 60 days)"}'::jsonb,
  '45 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled,
    trigger = EXCLUDED.trigger,
    conditions = EXCLUDED.conditions,
    action = EXCLUDED.action,
    schedule = EXCLUDED.schedule;

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
BEGIN
  SELECT id INTO v_automation_id
  FROM public.admin_automations
  WHERE slug = 'staging_auto_reject_stale';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES
    (v_automation_id, 'staging_auto_reject_stale', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_examined
  FROM public.ingestion_staging
  WHERE review_status = 'pending_review'
    AND disposition = 'pending'
    AND created_at < v_threshold;

  WITH upd AS (
    UPDATE public.ingestion_staging
    SET review_status = 'rejected',
        disposition = 'rejected',
        review_notes = COALESCE(review_notes || E'\n', '')
          || 'Auto-rejected: stale (no human action within 60 days)',
        reviewed_at = now()
    WHERE review_status = 'pending_review'
      AND disposition = 'pending'
      AND created_at < v_threshold
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
        'threshold_days', 60,
        'rule', 'pending_review + pending + age>60d -> rejected'
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

ALTER FUNCTION public.run_staging_auto_reject_stale() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_staging_auto_reject_stale() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_staging_auto_reject_stale() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_staging_auto_reject_stale() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staging_auto_reject_stale') THEN
    PERFORM cron.unschedule('staging_auto_reject_stale');
  END IF;
END $$;

SELECT cron.schedule(
  'staging_auto_reject_stale',
  '45 3 * * *',
  'SELECT public.run_staging_auto_reject_stale();'
);
