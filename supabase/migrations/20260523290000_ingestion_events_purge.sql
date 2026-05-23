-- Phase γ continued: Purge old ingestion_events rows.
-- 817k row table — largest in public schema. Pipeline diagnostic events.
-- Delete stages (deduplicate, validate, normalize) older than 30 days.
-- Keep commit + review + review_gate for audit. Daily cron at 04:45 UTC.
--
-- Already applied to prod 2026-05-23. This file syncs the repo with prod.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'ingestion_events_purge',
  'Purge old ingestion events',
  'Delete ingestion_events rows stage IN (deduplicate, validate, normalize) older than 30 days. Commit/review/review_gate retained for audit.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"stage","op":"in","value":["deduplicate","validate","normalize"]},{"field":"created_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
  '{"type":"delete","table":"ingestion_events"}'::jsonb,
  '45 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description=EXCLUDED.description, enabled=EXCLUDED.enabled,
    trigger=EXCLUDED.trigger, conditions=EXCLUDED.conditions,
    action=EXCLUDED.action, schedule=EXCLUDED.schedule;

CREATE OR REPLACE FUNCTION public.run_ingestion_events_purge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint;
  v_examined int := 0; v_changed int := 0;
  v_started_at timestamptz := now();
  v_threshold timestamptz := now() - interval '30 days';
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'ingestion_events_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'ingestion_events_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.ingestion_events
  WHERE stage IN ('deduplicate','validate','normalize') AND created_at < v_threshold;

  DECLARE v_batch int;
  BEGIN
    LOOP
      WITH del AS (
        DELETE FROM public.ingestion_events
        WHERE id IN (
          SELECT id FROM public.ingestion_events
          WHERE stage IN ('deduplicate','validate','normalize') AND created_at < v_threshold
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
        'rule','stage IN (deduplicate,validate,normalize) AND age>30d -> delete (batched 10k)')
  WHERE id=v_run_id;

  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success'
  WHERE id=v_automation_id;

  RETURN jsonb_build_object('deleted', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

ALTER FUNCTION public.run_ingestion_events_purge() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_ingestion_events_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_ingestion_events_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_ingestion_events_purge() TO authenticated;

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
  ELSIF p_slug = 'news_dedup_audit_purge' THEN v_result := public.run_news_dedup_audit_purge();
  ELSIF p_slug = 'ingestion_events_purge' THEN v_result := public.run_ingestion_events_purge();
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
  ELSIF p_slug = 'news_dedup_audit_purge' THEN
    SELECT count(*) INTO v_examined FROM public.news_dedup_audit
    WHERE match_decision='unique' AND created_at < now() - interval '30 days';
  ELSIF p_slug = 'ingestion_events_purge' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_events
    WHERE stage IN ('deduplicate','validate','normalize') AND created_at < now() - interval '30 days';
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingestion_events_purge') THEN
    PERFORM cron.unschedule('ingestion_events_purge');
  END IF;
END $$;

SELECT cron.schedule(
  'ingestion_events_purge', '45 4 * * *',
  'SELECT public.run_ingestion_events_purge();'
);
