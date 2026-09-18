-- The reconciler could approve a submission whose published record no longer exists.
--
-- 99000101100000 advances community_submissions.status from 'processing' using the
-- terminal disposition of its ingestion_staging row: 'inserted'/'updated'/'committed'
-- -> approved, with promoted_to_id copied from staging.target_record_id.
--
-- It never asks whether that target still EXISTS. A staging row is an immutable
-- record of what happened at commit time; the record it created can be deleted,
-- archived or merged away afterwards, and dedup on this platform does exactly that
-- routinely. So a submission could be stamped 'approved' with a promoted_to_id
-- pointing at nothing, and the submitter told "your submission is live" about a
-- page that 404s.
--
-- MEASURED BEFORE WRITING THIS, and the result is why there is no repair section:
-- all 14 approved rows point at a LIVE record, and 0 of the 15 published staging
-- rows carry a dangling or null target. This is PREVENTION, not cleanup. The
-- postcondition asserts that zero, so if the number is ever non-zero on apply the
-- migration fails loudly instead of quietly repairing something it never measured.
--
-- ============================================================================
-- THREE DECISIONS THAT DIFFER FROM THE OBVIOUS IMPLEMENTATION
-- ============================================================================
--
-- (1) UNKNOWN TABLE IS **NULL**, NOT FALSE.
--     The obvious CASE ends `ELSE false`, which says "the target does not exist"
--     about a table the CASE simply does not know. That is the absence-of-evidence
--     error this repo has paid for repeatedly — most recently the city class gate,
--     where `undetermined` had to be kept distinct from `refused` so a Wikidata
--     outage could not be recorded as a decision about the entity. Here an unknown
--     target_table means WE CANNOT CHECK, which is a gap in this function, not a
--     fact about the row. It returns NULL and is counted under its own key.
--
-- (2) THE CHECK IS ONE HELPER, NOT THREE COPIES OF A CASE.
--     The draft this replaces inlined the same five-branch CASE at three sites
--     (the LATERAL, the invalid-target count, the postcondition). Three copies of
--     a vocabulary is a drift surface: adding a sixth target table means finding
--     all three, and missing one silently strands exactly the rows the new branch
--     was added for. `source-community-submissions` maps 7 content types onto 5
--     tables, so the vocabulary lives in one function that all three call.
--
-- (3) IT DOES NOT GUESS WHEN THE TARGET IS GONE.
--     A submission whose only published staging row points at a deleted record is
--     left at 'processing' and counted as `invalid_target`. It is not approved
--     (the record is not there) and it is not rejected (it WAS published — the
--     pipeline did its job, something removed the row later). Neither label is
--     true, so it stays unlabelled and visible, the same call 99000101100000 made
--     for the 19 rows with no surviving staging row.
--
-- MEASURED TARGET-TABLE VOCABULARY on the community-submission corpus: only
-- 'events' (47) and 'venues' (9). The other three branches are correct but
-- currently unexercised — the producer can emit them, this corpus has not.

-- ---------------------------------------------------------------------------
-- 1. The vocabulary, in one place
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_submission_target_exists(
  p_table text,
  p_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- A null id cannot be verified and is not evidence of deletion either.
  IF p_id IS NULL OR p_table IS NULL THEN
    RETURN NULL;
  END IF;

  -- The five tables source-community-submissions can target (7 content types
  -- collapse onto these). An unrecognised table returns NULL — "cannot check" —
  -- and NEVER false, which would assert deletion on no evidence.
  CASE p_table
    WHEN 'events' THEN
      SELECT EXISTS (SELECT 1 FROM public.events x WHERE x.id = p_id) INTO v_exists;
    WHEN 'venues' THEN
      SELECT EXISTS (SELECT 1 FROM public.venues x WHERE x.id = p_id) INTO v_exists;
    WHEN 'marketplace_listings' THEN
      SELECT EXISTS (SELECT 1 FROM public.marketplace_listings x WHERE x.id = p_id) INTO v_exists;
    WHEN 'news_articles' THEN
      SELECT EXISTS (SELECT 1 FROM public.news_articles x WHERE x.id = p_id) INTO v_exists;
    WHEN 'personalities' THEN
      SELECT EXISTS (SELECT 1 FROM public.personalities x WHERE x.id = p_id) INTO v_exists;
    ELSE
      RETURN NULL;
  END CASE;

  RETURN v_exists;
END;
$$;

ALTER FUNCTION public.community_submission_target_exists(text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.community_submission_target_exists(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_submission_target_exists(text, uuid) TO service_role;

COMMENT ON FUNCTION public.community_submission_target_exists(text, uuid) IS
  'Does the record a staging row claims to have published still exist? TRUE/FALSE for the five tables source-community-submissions can target, NULL for an unknown table or a null id — "cannot check", never "does not exist". Single source of the target-table vocabulary; add a sixth table here and all callers follow.';

-- ---------------------------------------------------------------------------
-- 2. The reconciler, gated on a target that still exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_community_submission_reconcile(p_batch int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_automation_id       uuid;
  v_enabled             boolean;
  v_run_id              bigint;
  v_started_at          timestamptz := now();
  v_examined            int := 0;
  v_approved            int := 0;
  v_rejected            int := 0;
  v_unresolved          int := 0;
  v_unhandled           int := 0;
  v_invalid_target      int := 0;
  v_unknown_target_tbl  int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'community_submission_reconcile';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'community_submission_reconcile', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT COALESCE(v_enabled, false) THEN
    UPDATE public.admin_automation_runs
       SET finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     WHERE id = v_run_id;
    UPDATE public.admin_automations
       SET last_run_at = v_started_at, last_run_status = 'paused'
     WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  SELECT count(*) INTO v_examined
    FROM public.community_submissions WHERE status = 'processing';

  WITH cand AS (
    SELECT cs.id,
           s.disposition,
           s.target_record_id,
           s.target_table,
           s.review_notes,
           s.error_message
      FROM public.community_submissions cs
      -- One submission can be staged more than once (a re-stage after a fix).
      -- A VALID publish outranks everything: if any attempt published to a record
      -- that still exists, the submission was published. Ordering by created_at
      -- alone would let a later rejection, or a publish whose record has since
      -- been deleted, mask a live one.
      JOIN LATERAL (
        SELECT st.disposition, st.target_record_id, st.target_table,
               st.review_notes, st.error_message,
               public.community_submission_target_exists(st.target_table, st.target_record_id)
                 AS target_exists
          FROM public.ingestion_staging st
         -- The `?` test is REDUNDANT to a human and LOAD-BEARING to the planner.
         -- ix_ingestion_staging_submission_id is PARTIAL on `raw_data ? '_submission_id'`,
         -- and Postgres cannot prove that `->>'k' = <text>` implies `? 'k'`. Without
         -- this line the index is ignored and every candidate seq-scans all 228k
         -- staging rows, which blew the statement timeout rather than merely being slow.
         WHERE st.raw_data ? '_submission_id'
           AND st.raw_data->>'_submission_id' = cs.id::text
         ORDER BY (st.disposition NOT IN ('rejected', 'pending')
                   AND public.community_submission_target_exists(
                         st.target_table, st.target_record_id) IS TRUE) DESC,
                  st.created_at DESC
         LIMIT 1
      ) s ON true
     WHERE cs.status = 'processing'
       -- 'pending' is still in flight and must not be dispositioned. A publish is
       -- only actionable when its record is still there — `IS TRUE` so that NULL
       -- (unknown table / null id) falls through rather than counting as proof.
       AND (
         s.disposition = 'rejected'
         OR (s.disposition IN ('committed', 'inserted', 'updated')
             AND s.target_exists IS TRUE)
       )
     LIMIT p_batch
  ), upd AS (
    UPDATE public.community_submissions cs
       SET status = CASE WHEN c.disposition = 'rejected' THEN 'rejected' ELSE 'approved' END,
           -- COALESCE throughout: never overwrite a value a human already wrote.
           promoted_to_id    = COALESCE(cs.promoted_to_id, c.target_record_id),
           promoted_to_table = COALESCE(cs.promoted_to_table, c.target_table),
           reviewer_notes    = COALESCE(
                                 cs.reviewer_notes,
                                 CASE WHEN c.disposition = 'rejected'
                                      THEN NULLIF(COALESCE(c.review_notes, c.error_message), '')
                                 END),
           reviewed_at       = COALESCE(cs.reviewed_at, now())
      FROM cand c
     WHERE cs.id = c.id
    RETURNING c.disposition AS disposition
  )
  SELECT count(*) FILTER (WHERE disposition = 'rejected'),
         count(*) FILTER (WHERE disposition <> 'rejected')
    INTO v_rejected, v_approved
    FROM upd;

  -- Published, but the record is GONE. Not approved (nothing to link to) and not
  -- rejected (it really was published). Left at 'processing' and counted, so the
  -- number is visible rather than the row being silently stuck.
  SELECT count(*) INTO v_invalid_target
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition IN ('committed', 'inserted', 'updated')
          AND public.community_submission_target_exists(
                st.target_table, st.target_record_id) IS FALSE);

  -- Published onto a table this function cannot check. Distinct from the above on
  -- purpose: that one is a fact about the row, this one is a gap in the vocabulary
  -- above, and conflating them hides the second behind the first.
  SELECT count(*) INTO v_unknown_target_tbl
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition IN ('committed', 'inserted', 'updated')
          AND public.community_submission_target_exists(
                st.target_table, st.target_record_id) IS NULL);

  -- Rows left at 'processing' with no terminal staging row at all.
  SELECT count(*) INTO v_unresolved
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND NOT EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition <> 'pending');

  -- A disposition this function maps to neither outcome. The vocabulary has nine
  -- values and this maps five; an unmapped one strands rows exactly the way
  -- reading 'committed' off pipeline-commit did before it was measured.
  SELECT count(*) INTO v_unhandled
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition NOT IN
              ('pending', 'committed', 'inserted', 'updated', 'rejected'));

  UPDATE public.admin_automation_runs
     SET finished_at    = now(),
         items_examined = v_examined,
         items_changed  = v_approved + v_rejected,
         summary        = jsonb_build_object(
           'approved',            v_approved,
           'rejected',            v_rejected,
           'unresolved',          v_unresolved,
           'unhandled',           v_unhandled,
           'invalid_target',      v_invalid_target,
           'unknown_target_table', v_unknown_target_tbl,
           'rule', 'status=processing -> approved|rejected from staging disposition; a publish requires its target record to still exist')
   WHERE id = v_run_id;

  UPDATE public.admin_automations
     SET last_run_at = v_started_at, last_run_status = 'success'
   WHERE id = v_automation_id;

  RETURN jsonb_build_object(
    'approved',             v_approved,
    'rejected',             v_rejected,
    'unresolved',           v_unresolved,
    'unhandled',            v_unhandled,
    'invalid_target',       v_invalid_target,
    'unknown_target_table', v_unknown_target_tbl);

EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
     SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations
     SET last_run_at = v_started_at, last_run_status = 'error' WHERE id = v_automation_id;
  RAISE;
END;
$$;

ALTER FUNCTION public.run_community_submission_reconcile(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_community_submission_reconcile(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_community_submission_reconcile(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Postconditions
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_dangling int;
  v_probe    jsonb;
BEGIN
  -- The premise this migration was written on, asserted rather than assumed: no
  -- approved submission points at a record that is gone. Measured at 0 before
  -- writing; if it is ever non-zero the prevention shipped too late and the
  -- repair this file deliberately does not contain is actually needed.
  SELECT count(*) INTO v_dangling
    FROM public.community_submissions cs
   WHERE cs.status = 'approved'
     AND cs.promoted_to_id IS NOT NULL
     AND public.community_submission_target_exists(
           cs.promoted_to_table, cs.promoted_to_id) IS FALSE;
  IF v_dangling <> 0 THEN
    RAISE EXCEPTION 'community_submission_reconcile: % approved submission(s) point at a deleted record — this migration prevents new ones but repairs none', v_dangling;
  END IF;

  -- The helper must distinguish all three answers. A version that returns false
  -- for an unknown table passes every structural check and silently strands rows.
  IF public.community_submission_target_exists('not_a_table',
       '00000000-0000-0000-0000-000000000000'::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'community_submission_target_exists must return NULL for an unknown table, not a boolean';
  END IF;
  IF public.community_submission_target_exists('events', NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'community_submission_target_exists must return NULL for a null id';
  END IF;
  IF public.community_submission_target_exists('events',
       '00000000-0000-0000-0000-000000000000'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'community_submission_target_exists must return FALSE for a known table with no such row';
  END IF;

  -- The reconciler still runs and still reports every key. An omitted key reads
  -- as zero to the health script, which is the shape being removed here.
  v_probe := public.run_community_submission_reconcile(1);
  IF NOT (v_probe ? 'invalid_target' AND v_probe ? 'unknown_target_table'
          AND v_probe ? 'unresolved' AND v_probe ? 'unhandled') THEN
    RAISE EXCEPTION 'run_community_submission_reconcile lost a report key: %', v_probe;
  END IF;
END
$verify$;
