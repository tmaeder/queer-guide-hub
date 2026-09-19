-- 19 submissions stuck at 'processing' whose verdict provably existed and is gone.
--
-- These are the residue 99000101100000 left behind and reported hourly as
-- `unresolved`: status='processing' with no ingestion_staging row to read a
-- disposition from. Nothing could ever move them, so the reconciler has been
-- crying wolf on them every hour since it shipped.
--
-- ============================================================================
-- WHAT THE EVIDENCE ACTUALLY SAYS — AND THE FIRST READ OF IT WAS WRONG
-- ============================================================================
-- This residue was described as "no evidence of their disposition survives".
-- Half of that is false, and the pruner is what settles it:
--
--     prune_ingestion_staging(90, 15000) deletes ONLY
--       `disposition IS DISTINCT FROM 'pending' AND created_at < cutoff`
--
-- A 'pending' staging row is never pruned at any age. So a submission that was
-- staged (status='processing' has exactly ONE writer —
-- source-community-submissions, after a successful staging insert) and now has
-- NO staging row cannot have been left in flight: its row REACHED A TERMINAL
-- DISPOSITION and was then pruned. That is why staging rows from 2026-04-26
-- survive while these, submitted 2026-04-13 .. 2026-06-05, do not — the
-- survivors are still 'pending'.
--
-- So a verdict existed. WHICH verdict is unrecoverable: ingestion_events and
-- enrichment_audit cascade with the staging row, and the retention log records
-- counts, not ids.
--
-- EVERY OTHER PROVENANCE PATH WAS CHECKED AND IS EMPTY — event_sources,
-- venue_sources, events.enrichment_status, venues.enrichment_status,
-- ingestion_events payloads, guide_contributions: 0 rows mention any of the 19.
-- promoted_to_id is NULL on all 19. **No published record anywhere in this
-- database is attributable to any of them.**
--
-- ============================================================================
-- WHY 'rejected' AND NOT SOMETHING GENTLER
-- ============================================================================
-- 'rejected' is the house convention for a machine close, and it is not a
-- statement that a human refused the content. run_review_queue_close_unactionable
-- and run_dedup_close_distinct both write status='rejected' with a NULL reviewer
-- and an `auto-…:` note, for a reason that applies here verbatim: every producer
-- keys its idempotency on the other status values, so ANY new status is
-- re-offered as open on the next pass and the work repeats forever.
--
-- It is also true with respect to everything the system can observe: nothing is
-- published under these submissions, and nothing links to them. What is NOT
-- claimed is that a human rejected them — hence reviewed_by stays NULL and the
-- note states exactly what is and is not known.
--
-- NOTHING IS DESTROYED. community_submissions.data still holds the full payload,
-- so any of these can be re-submitted and reprocessed; the note says so.
--
-- ============================================================================
-- A ONE-SHOT, NOT A RECURRING CLOSER
-- ============================================================================
-- Retention is 90 days and the reconciler runs hourly, so a staging row cannot
-- be pruned before the reconciler has read it. This class is closed by
-- construction and cannot regrow unless the reconciler is dead for 90 days — at
-- which point `unresolved` going non-zero is the signal, and a recurring closer
-- would instead be quietly papering over a three-month outage.
--
-- NOTIFICATIONS FIRE, deliberately. Unlike 99940101110000's row, all 19 carry a
-- submitted_by, so tg_submission_status_notify runs. Both submitters are the
-- operator's own admin accounts (kinkvagabond 13, artfulperv 6) and the
-- trigger's 30-minute batching folds the whole close into ONE inbox row per
-- user, carrying the note as its body. Suppressing that would mean stamping a
-- permanent notify_submitter=false on real rows to avoid two entries.

DO $close$
DECLARE
  v_closed     int;
  v_note       text :=
    'auto-unreconcilable: staged before the status reconciler existed; the ingestion_staging row reached a terminal disposition and was pruned by the 90-day retention job, so which verdict it reached is unrecoverable. No published record is attributable to this submission. The submitted content is retained — re-submit to reprocess.';
  v_left       int;
  v_wrong_open int;
BEGIN
  -- Keyed on the CONDITION, never on a frozen id list: a row that has since
  -- acquired a staging row, or that someone dispositioned by hand, matches
  -- nothing instead of being overwritten.
  WITH cand AS (
    SELECT cs.id
      FROM public.community_submissions cs
     WHERE cs.status = 'processing'
       AND cs.reviewed_at IS NULL
       AND cs.reviewer_notes IS NULL
       AND cs.promoted_to_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.ingestion_staging st
          WHERE st.raw_data ? '_submission_id'
            AND st.raw_data->>'_submission_id' = cs.id::text)
  ), closed AS (
    UPDATE public.community_submissions cs
       SET status         = 'rejected',
           reviewer_notes = v_note,
           reviewed_at    = now()
           -- reviewed_by deliberately left NULL: a machine close must stay
           -- distinguishable from a human decision.
      FROM cand c
     WHERE cs.id = c.id
    RETURNING 1
  )
  SELECT count(*) INTO v_closed FROM closed;

  RAISE NOTICE 'community_submission_close_unreconcilable: closed % row(s)', v_closed;

  -- Postcondition states the REACHED state, not this run's count, so a
  -- concurrent session having already done the work cannot abort db push on main.
  SELECT count(*) INTO v_left
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND NOT EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text);
  IF v_left <> 0 THEN
    RAISE EXCEPTION
      'community_submission_close_unreconcilable: % submission(s) still stranded at processing with no staging row', v_left;
  END IF;

  -- A submission that DOES still have a staging row must not have been swept up
  -- here: those are the reconciler's job, and closing one would destroy a verdict
  -- that is still readable. Asserted in the opposite direction from the count
  -- above, because "zero stranded" is equally satisfied by closing everything.
  SELECT count(*) INTO v_wrong_open
    FROM public.community_submissions cs
   WHERE cs.reviewer_notes = v_note
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text);
  IF v_wrong_open <> 0 THEN
    RAISE EXCEPTION
      'community_submission_close_unreconcilable: % row(s) were closed despite having a readable staging row', v_wrong_open;
  END IF;

  -- The close must not have invented a link, and must stay machine-legible.
  IF EXISTS (
    SELECT 1 FROM public.community_submissions cs
     WHERE cs.reviewer_notes = v_note
       AND (cs.promoted_to_id IS NOT NULL OR cs.reviewed_by IS NOT NULL))
  THEN
    RAISE EXCEPTION 'community_submission_close_unreconcilable: a closed row carries a link or a reviewer';
  END IF;
END
$close$;
