-- ============================================================================
-- Content-processing simplification P0.4 — staging backlog drain + tighter gate
-- ----------------------------------------------------------------------------
-- ingestion_staging held ~60k rows stuck in pending_review (rss-news,
-- csv-upload, ticketmaster …), some months old. Nobody reviews a 60k queue.
--
-- run_staging_backlog_drain(p_batch): supervised, batched, repeat-callable.
--   APPROVE  confidence >= 0.9 and not LLM-rejected (the same bar as the
--            inbox "Approve >= 90%" button / triage_bulk_approve_high_conf),
--            EXCEPT personalities (promotion gate: person rows never bulk-
--            publish — outing risk; they stay for human review or go stale).
--   REJECT   rows older than 30 days still pending (stale — auto-reject,
--            mirrors run_staging_auto_reject_stale but at 30d not 60d).
--   KEEP     recent mid-confidence rows: the genuine human queue.
-- Approved rows flow to entities via the existing hourly commit drains
-- (100-500/batch) — no trigger storm.
--
-- run_staging_auto_reject_stale() (nightly cron) is tightened 60d → 30d and
-- batched (LIMIT 5000/run) so the queue cannot regrow unbounded; the
-- pipeline-health CI check now fails above 5000 pending.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_staging_backlog_drain(p_batch int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch int := least(greatest(coalesce(p_batch, 500), 1), 1000);
  v_approved int := 0;
  v_rejected int := 0;
BEGIN
  -- 1. High-confidence approve (excluding personalities).
  WITH pick AS (
    SELECT id FROM ingestion_staging
    WHERE review_status = 'pending_review'
      AND disposition = 'pending'
      AND ai_confidence_score >= 0.9
      AND coalesce(enriched_data->>'quality_status', '') <> 'rejected'
      AND coalesce(target_table, '') <> 'personalities'
    ORDER BY created_at
    LIMIT v_batch
  ), upd AS (
    UPDATE ingestion_staging s
    SET review_status = 'approved',
        reviewed_at = now(),
        review_notes = coalesce(s.review_notes || E'\n', '')
          || 'backlog-drain: high-confidence auto-approve (>= 0.9)'
    FROM pick WHERE s.id = pick.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_approved FROM upd;

  -- 2. Stale reject (> 30 days, still pending).
  WITH pick AS (
    SELECT id FROM ingestion_staging
    WHERE review_status = 'pending_review'
      AND disposition = 'pending'
      AND created_at < now() - interval '30 days'
    ORDER BY created_at
    LIMIT v_batch
  ), upd AS (
    UPDATE ingestion_staging s
    SET review_status = 'rejected',
        disposition = 'rejected',
        reviewed_at = now(),
        review_notes = coalesce(s.review_notes || E'\n', '')
          || 'backlog-drain: auto-rejected, stale (no human action within 30 days)'
    FROM pick WHERE s.id = pick.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_rejected FROM upd;

  RETURN jsonb_build_object(
    'approved', v_approved,
    'rejected', v_rejected,
    'remaining_pending', (
      SELECT count(*) FROM ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.run_staging_backlog_drain(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_staging_backlog_drain(int) TO service_role;

COMMENT ON FUNCTION public.run_staging_backlog_drain(int) IS
  'Batched staging-backlog drain: auto-approve confidence>=0.9 (never personalities), auto-reject pending rows older than 30d. Call repeatedly until remaining_pending stabilizes.';

-- Tighten the nightly stale-reject: 60d → 30d, batched at 5000/run.
-- Structure mirrors the canonical 20260523260000 version (enabled check,
-- run bookkeeping, error path); only threshold + batching + summary change.
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
  v_threshold timestamptz := now() - interval '30 days';
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

  WITH pick AS (
    SELECT id FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending'
      AND created_at < v_threshold
    ORDER BY created_at
    LIMIT 5000
  ), upd AS (
    UPDATE public.ingestion_staging s
    SET review_status='rejected', disposition='rejected',
        review_notes = COALESCE(s.review_notes || E'\n','') ||
          'Auto-rejected: stale (no human action within 30 days)',
        reviewed_at=now()
    FROM pick WHERE s.id = pick.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_changed FROM upd;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined, items_changed = v_changed,
      summary = jsonb_build_object('examined', v_examined, 'changed', v_changed,
        'threshold_days', 30, 'batch_cap', 5000,
        'rule', 'pending_review + pending + age>30d -> rejected (max 5000/run)')
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
