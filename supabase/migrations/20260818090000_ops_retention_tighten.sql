-- ============================================================================
-- Ops bookkeeping retention — overhaul Phase 8 (disk)
-- ----------------------------------------------------------------------------
-- Live 2026-08-07: workflow_runs 2,823 MB for 84k rows (~33 KB/row — the
-- input_payload/output_result jsonb), ingestion_staging 1,688 MB for 330k
-- rows of which events are 96% rejected and news 74% rejected. On a
-- disk-constrained DB the pipeline's bookkeeping outweighs the content ~5:1.
--
-- 1. workflow_runs: completed retention 30d → 7d; failed rows finally get a
--    purge (30d); the fat jsonb columns are stripped from terminal rows after
--    48h (counts/status/error_message stay — that is what the admin UI lists;
--    the payloads only matter while debugging a fresh failure).
-- 2. ingestion_staging: rejected rows older than 90d are deleted, batched.
--    Trade-off (accepted deliberately): deleting a rejected row frees its
--    idempotency/payload_hash slot, so an identical item COULD re-stage and be
--    re-rejected. At ≥90d that loop is cold — and the P3a source prefilter
--    now stops the biggest rejected-row producer (Ticketmaster) at the door.
-- Space returns gradually via autovacuum; no VACUUM FULL (lock) is attempted.
-- ============================================================================

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
  v_failed_purged int := 0;
  v_stripped int := 0;
  v_started_at timestamptz := now();
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
  WHERE status='completed' AND started_at < now() - interval '7 days';

  -- completed: 7 days
  WITH del AS (
    DELETE FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM del;

  -- failed/dead: 30 days (previously never purged — they accumulated forever)
  WITH del AS (
    DELETE FROM public.workflow_runs
    WHERE status IN ('failed','dead','cancelled') AND started_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO v_failed_purged FROM del;

  -- strip fat jsonb from terminal rows older than 48h (the ~33 KB/row payload)
  WITH upd AS (
    UPDATE public.workflow_runs
    SET input_payload = NULL, output_result = NULL, error_details = NULL
    WHERE status IN ('completed','failed','dead','cancelled')
      AND coalesce(completed_at, started_at, created_at) < now() - interval '48 hours'
      AND (input_payload IS NOT NULL OR output_result IS NOT NULL OR error_details IS NOT NULL)
    RETURNING id
  )
  SELECT count(*) INTO v_stripped FROM upd;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined,
      items_changed = v_changed + v_failed_purged,
      summary = jsonb_build_object('deleted_completed', v_changed,
        'deleted_failed', v_failed_purged, 'payloads_stripped', v_stripped,
        'rule', 'completed>7d delete; failed/dead/cancelled>30d delete; terminal>48h strip jsonb')
  WHERE id = v_run_id;

  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('deleted_completed', v_changed,
    'deleted_failed', v_failed_purged, 'payloads_stripped', v_stripped);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

-- Rejected-staging purge: own automation (slug + cron), batched deletes.
CREATE OR REPLACE FUNCTION public.run_staging_rejected_purge(p_batch integer DEFAULT 20000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
  v_total int := 0; v_batch_n int;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'staging_rejected_purge';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'staging_rejected_purge', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
    SET finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
    WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
    WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  LOOP
    WITH del AS (
      DELETE FROM public.ingestion_staging
      WHERE id IN (
        SELECT id FROM public.ingestion_staging
        WHERE disposition = 'rejected'
          AND created_at < now() - interval '90 days'
        LIMIT least(p_batch, 20000)
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_batch_n FROM del;
    v_total := v_total + v_batch_n;
    EXIT WHEN v_batch_n = 0 OR v_total >= 100000;  -- bound one run's work
  END LOOP;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_changed = v_total,
      summary = jsonb_build_object('deleted', v_total, 'threshold_days', 90,
        'rule', 'disposition=rejected AND age>90d -> delete (batched, ≤100k/run)')
  WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('deleted', v_total);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_staging_rejected_purge(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_staging_rejected_purge(integer) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'staging_rejected_purge',
  'Purge old rejected staging rows',
  'Nightly 04:35: deletes ingestion_staging rows rejected more than 90 days ago (batched ≤100k/run). Frees the 96%-rejected events / 74%-rejected news graveyard (~1.7 GB table). Accepted trade-off: an identical item could re-stage and be re-rejected once — cold after 90d, and the P3a source prefilter stops the largest producer.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','rpc','fn','run_staging_rejected_purge',
    'jobname','staging_rejected_purge',
    'command','SET statement_timeout = ''300s''; SELECT public.run_staging_rejected_purge();'),
  '35 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule, action = EXCLUDED.action, enabled = EXCLUDED.enabled;

DO $$
BEGIN
  PERFORM cron.unschedule('staging_rejected_purge');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'staging_rejected_purge',
  '35 4 * * *',
  'SET statement_timeout = ''300s''; SELECT public.run_staging_rejected_purge();'
);
