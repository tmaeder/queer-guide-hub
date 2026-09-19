-- One submission was published and then parked at a status nothing writes.
--
-- Found while verifying 99910101100000: 15 staging rows had published a record,
-- but only 14 submissions were 'approved'. The fifteenth sat at
-- status='pending_review'.
--
-- THAT VALUE IS NOT PART OF ANY STATE MACHINE. Measured across the whole repo —
-- edge functions, workers, hooks and every migration — NOTHING writes
-- community_submissions.status = 'pending_review'. The live vocabulary is
-- pending / processing / approved / rejected (plus duplicate and needs_info from
-- submission-action). `pending_review` exists on exactly ONE row out of 4,262 and
-- belongs to ingestion_staging.review_status, a different column on a different
-- table. It was set out of band — by hand, or by a code path since deleted.
--
-- That matters because it changes the disposition. The first read of this row
-- treated it as another producer's state machine (its staging row is
-- source_type='community-telegram') and left it alone on the rule that you do not
-- widen a selector into a workflow you have not studied. There is no such
-- workflow: it is an orphan value, and the row is simply stranded.
--
-- WHAT IT SHOULD SAY. Its staging row is disposition='inserted' into `events`
-- with target_record_id pointing at a record that still exists — the event
-- 'BLOWN AWAY' (slug blown-away), status active, not a duplicate, not safety
-- gated, indexable. The submission was published. The reconciler would already
-- have said so if its selector had seen the row; the selector reads
-- status='processing', which this row is not.
--
-- BOTH TRIGGERS ARE INERT HERE, verified on the row rather than assumed:
-- submitted_by IS NULL, and tg_submission_status_notify returns early on a null
-- submitted_by, as does tg_trust_on_submission_accepted. So this write sends no
-- notification and grants no trust credit. It is a bookkeeping correction and
-- nothing else.
--
-- WHY THIS IS A ONE-SHOT AND NOT A SELECTOR CHANGE. Widening the reconciler to
-- chase statuses no producer writes would mean a third CREATE OR REPLACE of a
-- 200-line function in one day, purely to handle a value that appears once and
-- has no writer. If it recurs, that is evidence of an out-of-band writer, which
-- is a different problem than the one this file fixes.

DO $repair$
DECLARE
  v_fixed   int;
  v_orphans int;
BEGIN
  -- Keyed on the CONDITION, never on the id: published to a record that still
  -- exists, and no human decision already recorded. If the row has meanwhile been
  -- dispositioned by someone else this matches nothing and the file no-ops,
  -- rather than overwriting their decision.
  -- The candidate is selected in its own CTE rather than in an `UPDATE ... FROM
  -- LATERAL`: a LATERAL in the FROM of an UPDATE cannot reference the update
  -- target's alias (42P10). Same shape the reconciler uses, for the same reason.
  WITH cand AS (
    SELECT cs.id, s.target_record_id, s.target_table
      FROM public.community_submissions cs
      JOIN LATERAL (
        SELECT st.target_record_id, st.target_table
          FROM public.ingestion_staging st
         WHERE st.raw_data ? '_submission_id'
           AND st.raw_data->>'_submission_id' = cs.id::text
           AND st.disposition IN ('committed', 'inserted', 'updated')
           AND public.community_submission_target_exists(
                 st.target_table, st.target_record_id) IS TRUE
         ORDER BY st.created_at DESC
         LIMIT 1
      ) s ON true
     WHERE cs.status = 'pending_review'
       AND cs.reviewed_at IS NULL
       AND cs.reviewer_notes IS NULL
  ), fixed AS (
    UPDATE public.community_submissions cs
       SET status            = 'approved',
           promoted_to_id    = COALESCE(cs.promoted_to_id, c.target_record_id),
           promoted_to_table = COALESCE(cs.promoted_to_table, c.target_table),
           reviewed_at       = COALESCE(cs.reviewed_at, now())
      FROM cand c
     WHERE cs.id = c.id
    RETURNING 1
  )
  SELECT count(*) INTO v_fixed FROM fixed;

  RAISE NOTICE 'community_submission_orphan_status_repair: % row(s) advanced to approved', v_fixed;

  -- Postcondition states the REACHED state, not the count this run happened to
  -- change: no submission may sit at an orphan status while its published record
  -- is still live. That holds whether this file did the work or a concurrent
  -- session already had.
  SELECT count(*) INTO v_orphans
    FROM public.community_submissions cs
   WHERE cs.status NOT IN ('pending', 'processing', 'approved', 'rejected',
                           'duplicate', 'needs_info')
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition IN ('committed', 'inserted', 'updated')
          AND public.community_submission_target_exists(
                st.target_table, st.target_record_id) IS TRUE);
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION
      'community_submission_orphan_status_repair: % submission(s) still stranded at a status no producer writes while their published record is live',
      v_orphans;
  END IF;

  -- The repaired row must actually carry a link, or it is approved-with-nothing,
  -- which is the defect 99910101100000 exists to prevent.
  IF EXISTS (
    SELECT 1 FROM public.community_submissions cs
     WHERE cs.status = 'approved'
       AND cs.promoted_to_id IS NOT NULL
       AND public.community_submission_target_exists(
             cs.promoted_to_table, cs.promoted_to_id) IS FALSE)
  THEN
    RAISE EXCEPTION 'community_submission_orphan_status_repair: an approved submission points at a deleted record';
  END IF;
END
$repair$;
