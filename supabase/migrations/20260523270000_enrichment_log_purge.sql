-- Phase γ continued: Purge old enrichment_log rows.
-- 818k row table. Keep 'failed' for diagnostics; delete 'skipped' and 'done'
-- older than 30 days. Newest write was 2026-05-09 — table is mostly historical.
-- Daily cron at 04:15 UTC.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'enrichment_log_purge',
  'Purge old enrichment logs',
  'Delete enrichment_log rows status IN (skipped, done) older than 30 days. Failed rows retained for diagnostics.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"status","op":"in","value":["skipped","done"]},{"field":"created_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
  '{"type":"delete","table":"enrichment_log"}'::jsonb,
  '15 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description=EXCLUDED.description, enabled=EXCLUDED.enabled,
    trigger=EXCLUDED.trigger, conditions=EXCLUDED.conditions,
    action=EXCLUDED.action, schedule=EXCLUDED.schedule;

CREATE OR REPLACE FUNCTION public.run_enrichment_log_purge()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  FROM public.admin_automations WHERE slug = 'enrichment_log_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'enrichment_log_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused')
    WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused'
    WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.enrichment_log
  WHERE status IN ('skipped','done') AND created_at < v_threshold;

  -- Batch deletion to avoid long transactions.
  DECLARE
    v_batch int;
  BEGIN
    LOOP
      WITH del AS (
        DELETE FROM public.enrichment_log
        WHERE id IN (
          SELECT id FROM public.enrichment_log
          WHERE status IN ('skipped','done') AND created_at < v_threshold
          LIMIT 10000
        )
        RETURNING 1
      )
      SELECT count(*) INTO v_batch FROM del;
      v_changed := v_changed + v_batch;
      EXIT WHEN v_batch = 0;
    END LOOP;
  END;

  UPDATE public.admin_automation_runs
  SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
      summary=jsonb_build_object('deleted',v_changed,'threshold_days',30,
        'rule','status IN (skipped,done) AND age>30d -> delete (batched 10k)')
  WHERE id=v_run_id;

  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success'
  WHERE id=v_automation_id;

  RETURN jsonb_build_object('deleted', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error'
  WHERE id=v_automation_id;
  RAISE;
END;
$$;

ALTER FUNCTION public.run_enrichment_log_purge() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_enrichment_log_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_enrichment_log_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_enrichment_log_purge() TO authenticated;

-- Extend dispatch RPCs.
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE status='active' AND end_date IS NOT NULL AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending'
      AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSIF p_slug = 'enrichment_log_purge' THEN
    SELECT count(*) INTO v_examined FROM public.enrichment_log
    WHERE status IN ('skipped','done') AND created_at < now() - interval '30 days';
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at,
     status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(),
          'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enrichment_log_purge') THEN
    PERFORM cron.unschedule('enrichment_log_purge');
  END IF;
END $$;

SELECT cron.schedule(
  'enrichment_log_purge', '15 4 * * *',
  'SELECT public.run_enrichment_log_purge();'
);
