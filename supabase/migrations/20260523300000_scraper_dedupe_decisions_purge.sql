-- Phase γ continued: Purge old scraper_dedupe_decisions rows.
-- 97k row table. After 30 days the dedup outcome is captured in the venue
-- itself; only 'duplicate' and 'merge_candidate' decisions remain useful
-- for review forensics. Daily cron at 05:00 UTC.
--
-- Already applied to prod 2026-05-23. This file syncs the repo with prod.

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'scraper_dedupe_purge',
  'Purge old scraper dedupe decisions',
  'Delete scraper_dedupe_decisions decision IN (merge, unique, skip, merged) older than 30 days. duplicate and merge_candidate retained.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"decision","op":"in","value":["merge","unique","skip","merged"]},{"field":"created_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
  '{"type":"delete","table":"scraper_dedupe_decisions"}'::jsonb,
  '0 5 * * *'
)
ON CONFLICT (slug) DO UPDATE
SET description=EXCLUDED.description, enabled=EXCLUDED.enabled,
    trigger=EXCLUDED.trigger, conditions=EXCLUDED.conditions,
    action=EXCLUDED.action, schedule=EXCLUDED.schedule;

CREATE OR REPLACE FUNCTION public.run_scraper_dedupe_purge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint;
  v_examined int := 0; v_changed int := 0;
  v_started_at timestamptz := now();
  v_threshold timestamptz := now() - interval '30 days';
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'scraper_dedupe_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'scraper_dedupe_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.scraper_dedupe_decisions
  WHERE decision IN ('merge','unique','skip','merged') AND created_at < v_threshold;

  DECLARE v_batch int;
  BEGIN
    LOOP
      WITH del AS (
        DELETE FROM public.scraper_dedupe_decisions
        WHERE id IN (
          SELECT id FROM public.scraper_dedupe_decisions
          WHERE decision IN ('merge','unique','skip','merged') AND created_at < v_threshold
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
        'rule','decision IN (merge,unique,skip,merged) AND age>30d -> delete (batched 10k)')
  WHERE id=v_run_id;

  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success'
  WHERE id=v_automation_id;

  RETURN jsonb_build_object('deleted', v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

ALTER FUNCTION public.run_scraper_dedupe_purge() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_scraper_dedupe_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_scraper_dedupe_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_scraper_dedupe_purge() TO authenticated;

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
  ELSIF p_slug = 'scraper_dedupe_purge' THEN v_result := public.run_scraper_dedupe_purge();
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
  ELSIF p_slug = 'scraper_dedupe_purge' THEN
    SELECT count(*) INTO v_examined FROM public.scraper_dedupe_decisions
    WHERE decision IN ('merge','unique','skip','merged') AND created_at < now() - interval '30 days';
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scraper_dedupe_purge') THEN
    PERFORM cron.unschedule('scraper_dedupe_purge');
  END IF;
END $$;

SELECT cron.schedule(
  'scraper_dedupe_purge', '0 5 * * *',
  'SELECT public.run_scraper_dedupe_purge();'
);
