-- review_queue retention: the generic review_queue table is a write-only
-- breadcrumb sink (pipeline-validate / review-gate / deduplicate / agentic-
-- enrich insert; NOTHING reads it back — actual review state lives on
-- ingestion_staging.review_status and the unified triage sources). It had
-- accumulated 318k stale pending rows / 114 MB before the 2026-07-21 cleanup.
-- This sweep keeps it from regrowing: nightly, delete rows that are resolved,
-- rows mirroring an ingestion_staging record that is no longer pending, and
-- anything older than 90 days.

CREATE OR REPLACE FUNCTION public.run_review_queue_retention(p_max_batches int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total   bigint := 0;
  v_deleted bigint;
  v_batch   int := 0;
BEGIN
  LOOP
    v_batch := v_batch + 1;
    EXIT WHEN v_batch > p_max_batches;

    DELETE FROM review_queue rq WHERE rq.id IN (
      SELECT id FROM review_queue r2
      WHERE r2.status <> 'pending'
         OR r2.created_at < now() - interval '90 days'
         OR (r2.entity_type = 'ingestion_staging' AND NOT EXISTS (
               SELECT 1 FROM ingestion_staging s
               WHERE s.id = r2.entity_id
                 AND s.review_status = 'pending_review'
                 AND s.disposition = 'pending'))
      LIMIT 20000
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    EXIT WHEN v_deleted < 20000;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_total, 'batches', v_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.run_review_queue_retention(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_review_queue_retention(int) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('review_queue_retention','Nightly review_queue retention sweep',
   'Deletes stale generic review_queue breadcrumbs: resolved rows, rows mirroring an ingestion_staging record that is no longer pending, and rows older than 90 days. The table is write-only (no consumer); real review state lives on ingestion_staging + the unified triage sources.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_review_queue_retention"}'::jsonb, '35 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='review_queue_retention') THEN
    PERFORM cron.unschedule('review_queue_retention');
  END IF;
  PERFORM cron.schedule('review_queue_retention', '35 3 * * *',
    'SELECT public.run_review_queue_retention();');
END $$;
