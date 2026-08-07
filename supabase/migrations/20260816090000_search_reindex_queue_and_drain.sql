-- ============================================================================
-- Search reindex queue + drain — Phase 1a of the pipeline overhaul
-- ----------------------------------------------------------------------------
-- Today every row-write on 11 entity tables runs a synchronous FOR-EACH-ROW
-- reindex (search_documents_sync → DELETE doc + search_documents_index_*),
-- whose doc DELETE also cascades into search_embeddings and re-inserts the
-- vector — one HNSW delete + insert per entity write. Measured: a 300-row
-- events UPDATE spends 13.8 of 14.6 s inside this trigger, which is why every
-- backfill and sweep in the codebase caps batches at 60–300 rows.
--
-- This migration adds the decoupled path (queue + drain); the companion
-- 20260816090100 swaps the trigger body to enqueue-only. Split in two so the
-- drain provably exists before anything starts enqueueing.
--
-- Design notes (each one is load-bearing):
--   * The queue is APPEND-ONLY with an identity PK and deliberately NO unique
--     constraint on (entity_type, entity_id). An ON CONFLICT upsert queue was
--     considered and rejected: the drain holds row locks for its whole
--     transaction, so a writer's upsert on a locked key would block for the
--     drain's full duration — re-coupling writers to reindex latency, the
--     exact thing this exists to remove. Plain INSERTs never contend.
--     Duplicates are collapsed at drain time (SELECT DISTINCT).
--   * Claim = DELETE .. USING (oldest ids). If the drain transaction dies
--     (timeout, crash) the claim rolls back and rows are retried next tick.
--   * A row written DURING a drain gets a new id above the claimed range and
--     survives to the next tick — no lost updates.
--   * Per-entity BEGIN/EXCEPTION: one poisoned entity re-enqueues itself at
--     the TAIL (new id) and cannot head-block the queue.
--   * pg_try_advisory_xact_lock guard: overlapping cron ticks no-op instead
--     of stacking up behind each other's row locks.
--   * The reindex CASE below mirrors the LIVE search_documents_sync body
--     (pg_proc.prosrc read 2026-08-07), not the repo copy. 'landmark' has no
--     branch there by design (geo_landmark_profiles has its own inline sync);
--     for landmark the queue path is delete-only — identical to today.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_reindex_queue (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.search_reindex_queue IS
  'Pending search_documents reindexes, written by search_documents_sync() triggers, drained every minute by search_reindex_drain(). Append-only by design — no unique key — so entity writers can never block on drain row locks. Duplicates collapse at drain time.';

ALTER TABLE public.search_reindex_queue ENABLE ROW LEVEL SECURITY;
-- Internal-only: no policies. Default privileges in this project arm anon /
-- authenticated on new tables, so revoke explicitly.
REVOKE ALL ON public.search_reindex_queue FROM anon, authenticated;
GRANT SELECT ON public.search_reindex_queue TO service_role;  -- health probes

CREATE OR REPLACE FUNCTION public.search_reindex_drain(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r         record;
  v_claimed integer := 0;
  v_done    integer := 0;
  v_failed  integer := 0;
  v_gc      integer := 0;
BEGIN
  -- Overlap guard: if the previous tick is still running, skip instead of
  -- queueing up behind its locks. Lock releases automatically at txn end.
  IF NOT pg_try_advisory_xact_lock(hashtext('search_reindex_drain')) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_running');
  END IF;

  FOR r IN
    WITH pick AS (
      SELECT id FROM public.search_reindex_queue ORDER BY id LIMIT p_limit
    ), claimed AS (
      DELETE FROM public.search_reindex_queue q
      USING pick
      WHERE q.id = pick.id
      RETURNING q.entity_type, q.entity_id
    )
    SELECT DISTINCT entity_type, entity_id FROM claimed
  LOOP
    v_claimed := v_claimed + 1;
    BEGIN
      -- Phase-A1 semantics: byte-identical to the inline trigger (delete +
      -- full re-index). The upsert-only variant (no delete, no HNSW churn)
      -- is Phase A2, gated on an indexer ON CONFLICT SET-list audit.
      DELETE FROM public.search_documents
        WHERE entity_type = r.entity_type AND entity_id = r.entity_id;
      CASE r.entity_type
        WHEN 'venue'         THEN PERFORM public.search_documents_index_venues(r.entity_id);
        WHEN 'event'         THEN PERFORM public.search_documents_index_events(r.entity_id);
        WHEN 'city'          THEN PERFORM public.search_documents_index_cities(r.entity_id);
        WHEN 'country'       THEN PERFORM public.search_documents_index_countries(r.entity_id);
        WHEN 'news'          THEN PERFORM public.search_documents_index_news(r.entity_id);
        WHEN 'marketplace'   THEN PERFORM public.search_documents_index_marketplace(r.entity_id);
        WHEN 'personality'   THEN PERFORM public.search_documents_index_personalities(r.entity_id);
        WHEN 'tag'           THEN PERFORM public.search_documents_index_tags(r.entity_id);
        WHEN 'queer_village' THEN PERFORM public.search_documents_index_villages(r.entity_id);
        WHEN 'group'         THEN PERFORM public.search_documents_index_groups(r.entity_id);
        WHEN 'organization'  THEN PERFORM public.search_documents_index_organizations(r.entity_id);
        WHEN 'milestone'     THEN PERFORM public.search_documents_index_milestones(r.entity_id);
        WHEN 'guide'         THEN PERFORM public.search_documents_index_guides(r.entity_id);
        ELSE NULL;  -- 'landmark' and unknown types: delete-only, as live today
      END CASE;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      -- Re-enqueue at the tail; retried next tick without blocking the head.
      INSERT INTO public.search_reindex_queue (entity_type, entity_id)
      VALUES (r.entity_type, r.entity_id);
    END;
  END LOOP;

  -- Safety valve: rows this old mean the drain was broken for a week; better
  -- to drop them (a later full rebuild can recover) than grow unbounded on a
  -- disk-constrained DB.
  DELETE FROM public.search_reindex_queue WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_gc = ROW_COUNT;

  RETURN jsonb_build_object(
    'claimed', v_claimed, 'reindexed', v_done, 'failed', v_failed, 'gc', v_gc,
    'remaining', (SELECT count(*) FROM public.search_reindex_queue)
  );
END $$;

COMMENT ON FUNCTION public.search_reindex_drain(integer) IS
  'Every minute: claims up to p_limit oldest search_reindex_queue rows (DELETE .. USING), reindexes each distinct entity via search_documents_index_*. Failures re-enqueue at the tail. Advisory-xact-lock guarded against overlapping ticks. Phase A1 = delete+reindex (identical semantics to the old inline trigger).';

REVOKE EXECUTE ON FUNCTION public.search_reindex_drain(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_reindex_drain(integer) TO service_role;

-- Registry-of-record first, then pg_cron (a cron with no admin_automations row
-- fails the pipeline-health gate, and the reconciler drives cron FROM the
-- registry — retiring later means disabling this row, never just unscheduling).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'search_reindex_drain',
  'Drain search reindex queue',
  'Every minute: applies queued search_documents reindexes (decoupled from entity writes by the 2026-08 pipeline overhaul; replaces the synchronous per-row trigger reindex). Kill switch = disable this row; entity writes then enqueue harmlessly until re-enabled or the trigger body is reverted to search_documents_sync_inline_legacy.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'search_reindex_drain',
    'jobname', 'search_reindex_drain',
    'command', 'SET statement_timeout = ''110s''; SELECT public.search_reindex_drain(1000);'
  ),
  '* * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

DO $$
BEGIN
  PERFORM cron.unschedule('search_reindex_drain');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'search_reindex_drain',
  '* * * * *',
  'SET statement_timeout = ''110s''; SELECT public.search_reindex_drain(1000);'
);
