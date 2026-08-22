-- ============================================================================
-- A human "approve" in the triage inbox did not unblock the row.
-- ----------------------------------------------------------------------------
-- Every approve path writes ingestion_staging.review_status = 'approved'.
-- Every downstream stage gates on a DIFFERENT column, ai_validation_status:
--
--   pipeline-deduplicate      .eq('ai_validation_status','approved')
--   pipeline-review-gate      .eq('ai_validation_status','approved')
--   marketplace-relevance     .eq('ai_validation_status','approved')
--   enrichment-driver         .eq('ai_validation_status','approved')
--   commit_*_staging_batch    AND ai_validation_status = 'approved'
--
-- and the ONLY writer of ai_validation_status='approved' is pipeline-validate.
-- So once validate returns 'needs_review' — for a venue W_NO_COORDS alone is
-- enough — the row is invisible to dedup, to the review gate and to commit
-- FOREVER. The human decision the whole queue exists to collect is recorded
-- and then discarded. Measured on prod 2026-08-22: 14 events stranded since
-- 2026-07-13 (40 days), plus 25 venues from the eventfrog import that were
-- unblocked by hand.
--
-- Note what is NOT wrong: commit already accepts the human verdict —
-- `review_status IN ('auto','approved')`. ai_validation_status is the only
-- door that is shut, which is why hand-flipping that one column drained the
-- 25 venues.
--
-- DECISION: ai_validation_status is the "cleared to proceed" column. An admin
-- approve is a strictly stronger signal than the validator's needs_review, so
-- approving PROMOTES it. The alternative — teaching four TS call sites and two
-- SQL functions to accept review_status as an override — is six places to get
-- right and one place to forget.
--
-- WHERE THE PROMOTION LIVES: a BEFORE UPDATE trigger, not the approve RPC.
-- triage_action is not the only writer of review_status='approved'; there are
-- at least four:
--   * triage_action('staging','approve')            — the unified inbox
--   * triage_bulk_approve_high_conf()               — the "Approve >=90%" button
--   * ingestion-review-api approve/merge/bulk_approve — the Import Hub
--   * approve_dedup_* / the baseline dedup-resolution RPCs
-- Patching one leaves three, and the next one written leaves four. One trigger
-- on the table covers all of them and every future writer.
--
-- ASYMMETRY, ON PURPOSE: the trigger promotes 'pending' and 'needs_review'
-- only. A validator HARD rejection ('rejected', an E_* error) is never
-- silently overridden — such a row also carries disposition='rejected' so it
-- cannot appear in the queue in the first place. The sentinel below is
-- deliberately WIDER than the trigger (IS DISTINCT FROM 'approved'), so if
-- that shape ever does appear it fails CI and a human looks at it, rather than
-- being auto-cleared.
-- ============================================================================

-- ── 1. Promotion ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.staging_human_approval_clears_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The WHEN clause on the trigger is the whole gate; by the time we are here
  -- the row is a pending/needs_review row a human just approved.
  NEW.ai_validation_status := 'approved';

  -- The validator's own verdict (errors/warnings/quality) stays untouched in
  -- the same jsonb — this only records that a human outranked it, and who.
  NEW.ai_validation_result := jsonb_set(
    COALESCE(NEW.ai_validation_result, '{}'::jsonb),
    '{human_override}',
    jsonb_build_object(
      'from',   OLD.ai_validation_status,
      'by',     NEW.reviewed_by,
      'at',     now(),
      'reason', 'human approve outranks the validator verdict'
    ),
    true
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.staging_human_approval_clears_validation() IS
  'Promotes ingestion_staging.ai_validation_status to approved when a human approves the row. Without it the approval is recorded and every downstream stage still skips the row, because they all gate on ai_validation_status and only pipeline-validate writes it. Never promotes a validator rejection.';

DROP TRIGGER IF EXISTS trg_staging_human_approval_clears_validation ON public.ingestion_staging;
CREATE TRIGGER trg_staging_human_approval_clears_validation
BEFORE UPDATE OF review_status ON public.ingestion_staging
FOR EACH ROW
WHEN (
  NEW.review_status = 'approved'
  AND OLD.review_status IS DISTINCT FROM 'approved'
  AND NEW.ai_validation_status IN ('pending', 'needs_review')
)
EXECUTE FUNCTION public.staging_human_approval_clears_validation();

-- The contract, written where anyone reading the columns will find it.
COMMENT ON COLUMN public.ingestion_staging.ai_validation_status IS
  'THE gate: dedup, review-gate, marketplace-relevance, the enrichment driver and every commit_*_staging_batch require ''approved'' here. Written by pipeline-validate, and promoted by trg_staging_human_approval_clears_validation when a human approves — a human approve that only moved review_status left the row invisible to every stage forever (fixed 2026-08-22).';

COMMENT ON COLUMN public.ingestion_staging.review_status IS
  'Who decided, not whether the row may proceed: auto | pending_review | approved | rejected. Setting it to ''approved'' also promotes ai_validation_status via trg_staging_human_approval_clears_validation. Note pipeline-deduplicate overwrites this back to ''auto''/''pending_review'' when it runs, which is why it cannot be the gate on its own.';

-- ── 2. Sentinel ─────────────────────────────────────────────────────────────
-- Body verbatim from 20260816100000 plus stranded_human_approved. The shape
-- (pending + human-approved + not validator-approved) is stuck BY DEFINITION:
-- no stage will ever look at it again. check-pipeline-health.mjs fails the
-- build on any non-zero count — no baseline allowance, because after the
-- trigger above the state is unreachable and the repair below empties it.

CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cron_total', (SELECT count(*) FROM cron.job WHERE active),
    'legacy_cron_jobs', COALESCE((
      SELECT jsonb_agg(jobname) FROM cron.job
      WHERE jobname IN (
        'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
        'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
      )
      OR jobname LIKE 'translate-i18n-%'
      OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
    ), '[]'::jsonb),
    'i18n_percombo_cron_count', (
      SELECT count(*) FROM cron.job
      WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
        AND jobname NOT IN ('i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    ),
    'unregistered_cron_jobs', COALESCE((
      SELECT jsonb_agg(j.jobname) FROM cron.job j
      WHERE j.active
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_automations a
          WHERE a.action->>'jobname' = j.jobname
             OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    ), '[]'::jsonb),
    -- 2026-08 overhaul P2: rows stuck mid-pipeline. This is the generalized
    -- form of the leak that spawned the per-stage drain crons (rows staged
    -- outside a pipeline run never draining). Keyed by target_table (the
    -- router key; entity_type spellings are inconsistent in old rows).
    'stale_pending_by_entity', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND created_at < now() - interval '48 hours'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    -- 2026-08-22: a human approved it and nothing downstream can see it. This
    -- is a subset of stale_pending_by_entity that its thresholds could never
    -- surface — 14 rows hid under a 3,500-row warn floor for 40 days — and it
    -- is worse than ordinary starvation, because a person was asked, answered,
    -- and the answer was dropped.
    'stranded_human_approved', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND review_status = 'approved'
          AND ai_validation_status IS DISTINCT FROM 'approved'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    'search_reindex_queue_depth', (
      SELECT count(*) FROM public.search_reindex_queue
    )
  );
$$;

-- ── 3. Repair the rows already stranded ─────────────────────────────────────
-- The trigger fires on a TRANSITION, so it cannot reach rows that are already
-- sitting at review_status='approved'. This is the one-shot.
--
-- EVERY stranded row is published, past-dated events included (user decision,
-- 2026-08-22). An earlier draft dispositioned events by their own date on the
-- reasoning that a row approved 40 days ago was approved as an *upcoming*
-- event. That was rejected, and the corpus is why: `events` deliberately holds
-- ~36.5k past events (the Wayback import), so a past date is not a defect here
-- and "already happened" is not grounds to discard a human approval. The 14
-- live rows are all gaycities pride/festival imports flagged
-- W_PRIDE_TIME_WINDOW + W_PRIDE_NOT_SATURDAY + W_NO_GEO, and 5 of them had
-- ended by the time this was written.
--
-- Undated rows are promoted too rather than pre-rejected: commit RAISEs
-- event_missing_start_date and the batch handler records that on the row, so
-- the commit path dispositions them with a real reason instead of this
-- migration guessing.

DO $$
DECLARE
  v_cleared int := 0;
BEGIN
  WITH cleared AS (
    UPDATE public.ingestion_staging s
       SET ai_validation_status = 'approved',
           ai_validation_result = jsonb_set(
             COALESCE(s.ai_validation_result, '{}'::jsonb),
             '{human_override}',
             jsonb_build_object(
               'from',   s.ai_validation_status,
               'by',     s.reviewed_by,
               'at',     now(),
               'reason', 'stranded-repair: approval recorded before the promotion trigger existed'
             ),
             true
           ),
           updated_at = now()
     WHERE s.disposition = 'pending'
       AND s.review_status = 'approved'
       AND s.ai_validation_status IN ('pending', 'needs_review')
    -- RETURNING sees the NEW row, so the pre-repair value is read back out of
    -- the stamp rather than from s.ai_validation_status (OLD in RETURNING is
    -- PG18; this runs on 17).
    RETURNING s.id,
              s.target_table,
              s.ai_validation_result->'human_override'->>'from' AS was_status
  )
  -- The promotion moves no status column, so trg_staging_review_audit does not
  -- fire for it and it needs its own record.
  INSERT INTO public.ingestion_events (staging_id, stage, old_status, new_status, actor, payload)
  SELECT c.id, 'validate', c.was_status, 'approved', 'migration:20260915190000',
         jsonb_build_object('repair', 'stranded_human_approved', 'target_table', c.target_table)
  FROM cleared c;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RAISE NOTICE 'stranded_human_approved repair: % row(s) cleared to proceed', v_cleared;
END $$;
