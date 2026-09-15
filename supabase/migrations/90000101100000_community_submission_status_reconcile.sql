-- community_submissions.status had no terminal writer on the pipeline path.
--
-- source-community-submissions sets status='processing' when it stages a row
-- into ingestion_staging, and NOTHING ever writes a terminal status back. The
-- only writer that advances it is submission-action, the manual admin
-- approve/flag path. So a submission that went through the pipeline sat at
-- 'processing' forever regardless of what the pipeline actually decided, and
-- the submitter's /me/contributions page never learned what happened.
--
-- Measured 2026-09-15: 74 rows stuck at 'processing' (57 event, 17 venue),
-- oldest 2026-04-13. Joined to staging on raw_data->>'_submission_id' (note the
-- UNDERSCORE prefix; source_type is 'community-submission', not
-- 'user_submission') the real disposition is:
--
--     published  (disposition inserted 9 / updated 5, target_record_id set)   14
--     rejected at the review gate                                             41
--     no surviving staging row                                                19
--
-- NOTE THE DISPOSITION VALUES. A first cut of this file tested
-- `disposition IN ('committed','rejected')` — the vocabulary pipeline-commit
-- writes — and a prod dry run returned committed=0. This corpus is committed by
-- the commit_*_staging_batch RPCs, which write 'inserted' or 'updated'. That
-- version would have rejected 41, approved NOTHING, and left all 14 published
-- rows at 'processing' forever, with its own postcondition passing, because a
-- check built from the same wrong pair never counted them as stranded. Reading
-- the code gave the word 'committed'; only measuring gave the right one.
--
-- THE PIPELINE WORKED on 55 of 74. This is a bookkeeping gap, not lost
-- content. All 74 belong to two accounts, both carrying the admin role, i.e.
-- the operator's own submission traffic rather than 74 members of the public.
--
-- THREE TRIGGERS FIRE ON A STATUS CHANGE and all three are wanted here:
--   submission_status_notify    -> an inbox row for the submitter. The 'published'
--       branch is reached by promoted_to_id changing, which is why status and
--       promoted_to_* are written in ONE statement: the committed rows get a
--       "your submission is live" notification with a real slug link rather than
--       a bare "approved". The trigger's own 30-minute anti-spam batching folds
--       the whole backfill into ONE notification row per (user, outcome), so the
--       55 late notices arrive as ~4 rows. That is why notify_submitter is NOT
--       suppressed for the rejected cohort: suppressing it would mean stamping a
--       permanent notify_submitter=false on real rows to avoid two inbox entries.
--   trust_submission_accepted   -> user_trust_events + recompute_user_tier on
--       'approved'. For the 14 committed rows this credit is genuinely owed.
--   submission_guide_contribution -> quest/guide credit, and it also backfills
--       guide_contributions.entity_id from promoted_to_id.
--
-- THE 19 WITH NO STAGING ROW ARE DELIBERATELY LEFT AT 'processing'. No evidence
-- of their disposition survives, and guessing one would publish a claim about a
-- submission nobody can check. The lateral join drops them; they cost one index
-- probe per run.
--
-- The reconciler is the durable half and matters more than the backfill: a
-- future real contributor now learns what happened within the hour instead of
-- never. The backfill is just its first run, executed at the bottom of this file
-- so the repair and the mechanism cannot drift apart.

-- ---------------------------------------------------------------------------
-- 1. Lookup index
-- ---------------------------------------------------------------------------
-- The join key is a jsonb path, so without an expression index every run is a
-- full scan of ingestion_staging per candidate. Partial on the key's presence
-- keeps it to the community-submission slice rather than the whole table.
-- No CONCURRENTLY: migrations run inside a transaction.
CREATE INDEX IF NOT EXISTS ix_ingestion_staging_submission_id
  ON public.ingestion_staging ((raw_data->>'_submission_id'))
  WHERE raw_data ? '_submission_id';

-- ---------------------------------------------------------------------------
-- 2. Registry row (registry of record; pg_cron is scheduled below)
-- ---------------------------------------------------------------------------
-- action.type='rpc' carries no action.command on purpose: sync_automations_to_cron()
-- branch (d) then structurally cannot recreate or re-wrap this job, so the cron
-- below is the only scheduler. Disabling this row is the kill switch.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'community_submission_reconcile',
  'Reconcile community submission status',
  'Advance community_submissions.status from processing to approved/rejected using the terminal disposition of its ingestion_staging row. Closes the gap where the ingest pipeline decided but nothing told the submitter.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[{"field":"status","op":"eq","value":"processing"}]'::jsonb,
  '{"type":"rpc","function":"run_community_submission_reconcile"}'::jsonb,
  '23 * * * *'
)
ON CONFLICT (slug) DO UPDATE
SET name        = EXCLUDED.name,
    description = EXCLUDED.description,
    enabled     = EXCLUDED.enabled,
    trigger     = EXCLUDED.trigger,
    conditions  = EXCLUDED.conditions,
    action      = EXCLUDED.action,
    schedule    = EXCLUDED.schedule;

-- ---------------------------------------------------------------------------
-- 3. The reconciler
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_community_submission_reconcile(p_batch int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_enabled       boolean;
  v_run_id        bigint;
  v_started_at    timestamptz := now();
  v_examined      int := 0;
  v_approved      int := 0;
  v_rejected      int := 0;
  v_unresolved    int := 0;
  v_unhandled     int := 0;
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
      -- A commit outranks a rejection: if any attempt published, the row was
      -- published. Otherwise take the most recent attempt.
      JOIN LATERAL (
        SELECT st.disposition, st.target_record_id, st.target_table,
               st.review_notes, st.error_message
          FROM public.ingestion_staging st
         -- The `?` test is REDUNDANT to a human and LOAD-BEARING to the planner.
         -- ix_ingestion_staging_submission_id is PARTIAL on `raw_data ? '_submission_id'`,
         -- and Postgres cannot prove that `->>'k' = <text>` implies `? 'k'`. It IS
         -- true — an absent key yields NULL and NULL equals nothing — but implication
         -- proving does not reach it, so without this line the index is ignored and
         -- every candidate seq-scans all 228k staging rows. Measured on prod: the
         -- query blew the statement timeout even with the index freshly built in
         -- the same transaction. That is what this line buys.
         WHERE st.raw_data ? '_submission_id'
           AND st.raw_data->>'_submission_id' = cs.id::text
         ORDER BY (st.disposition NOT IN ('rejected', 'pending')) DESC, st.created_at DESC
         LIMIT 1
      ) s ON true
     WHERE cs.status = 'processing'
       -- 'pending' is still in flight and must not be dispositioned.
       --
       -- THE SUCCESS VOCABULARY IS 'inserted'/'updated', NOT 'committed', AND
       -- GETTING THIS WRONG IS SILENT. pipeline-commit writes disposition
       -- 'committed', which is where the word comes from — but this corpus went
       -- through the commit_*_staging_batch RPCs, which write 'inserted' (a new
       -- record) or 'updated' (the enrich path onto an existing one). Measured on
       -- prod 2026-09-15 over the 74 stuck rows: rejected 41, inserted 9,
       -- updated 5, 'committed' ZERO. A ('committed','rejected') test therefore
       -- approves nothing, rejects 41, and leaves the 14 genuinely published rows
       -- stuck at 'processing' forever — while a postcondition written against
       -- that same pair passes, because it never considered them stranded.
       AND s.disposition IN ('committed', 'inserted', 'updated', 'rejected')
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
  SELECT count(*) FILTER (WHERE disposition <> 'rejected'),
         count(*) FILTER (WHERE disposition = 'rejected')
    INTO v_approved, v_rejected
    FROM upd;

  -- Rows left at 'processing' with no terminal staging row. Reported rather
  -- than guessed: this is the number a human has to decide about, and it is
  -- the signal that the source function staged something the pipeline lost.
  SELECT count(*) INTO v_unresolved
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND NOT EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        -- Same partial-index predicate as the LATERAL above. See the note there.
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition <> 'pending');

  -- UNHANDLED is the counter that would have caught the 'committed' mistake, and
  -- it is deliberately WIDER than the mapping above: any disposition that is
  -- neither 'pending' nor one this function knows how to act on. The vocabulary
  -- has nine values (cleared/committed/error/inserted/pending/rejected/review/
  -- skipped/updated) and only six are mapped, so a stage that starts writing
  -- 'error' or 'skipped' on this path silently strands rows. Measured 0 on prod
  -- at apply time; a non-zero reading later is a real finding, not noise.
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
           'approved',   v_approved,
           'rejected',   v_rejected,
           'unresolved', v_unresolved,
           'unhandled',  v_unhandled,
           'rule', 'community_submissions.status=processing -> approved|rejected from ingestion_staging.disposition, joined on raw_data->>''_submission_id''')
   WHERE id = v_run_id;

  UPDATE public.admin_automations
     SET last_run_at = v_started_at, last_run_status = 'success'
   WHERE id = v_automation_id;

  RETURN jsonb_build_object(
    'approved', v_approved, 'rejected', v_rejected,
    'unresolved', v_unresolved, 'unhandled', v_unhandled);

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

COMMENT ON FUNCTION public.run_community_submission_reconcile(int) IS
  'Advances community_submissions.status from processing to approved/rejected using its ingestion_staging row''s terminal disposition. Writes promoted_to_id/table in the same statement so the notify trigger reaches its published branch. Never touches a row whose staging disposition is still pending, and never overwrites a value a human wrote.';

-- ---------------------------------------------------------------------------
-- 4. Schedule
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('community_submission_reconcile')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'community_submission_reconcile');

SELECT cron.schedule(
  'community_submission_reconcile',
  '23 * * * *',
  $cron$SELECT public.run_community_submission_reconcile();$cron$
);

-- ---------------------------------------------------------------------------
-- 5. Backfill = the reconciler's first run
-- ---------------------------------------------------------------------------
-- Looped rather than one 500-row call: the postcondition below asserts that NO
-- row with a terminal staging disposition is left at 'processing', so a corpus
-- larger than one batch would abort db push on main and block every migration
-- queued behind it.
DO $backfill$
DECLARE v_result jsonb; v_moved int; v_guard int := 0;
BEGIN
  LOOP
    v_result := public.run_community_submission_reconcile(500);
    v_moved  := COALESCE((v_result->>'approved')::int, 0)
              + COALESCE((v_result->>'rejected')::int, 0);
    RAISE NOTICE 'community_submission_reconcile backfill pass: %', v_result;
    EXIT WHEN v_moved = 0;
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 50;
  END LOOP;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- 6. Postconditions
-- ---------------------------------------------------------------------------
-- Asserted as a reached STATE, not as a count measured on a dated snapshot of
-- prod: a row whose staging row is no longer 'pending' may not sit at
-- 'processing'. That holds whether the live corpus is the 74 measured on
-- 2026-09-15 or something a concurrent session has already moved.
--
-- THE PREDICATE IS DELIBERATELY WIDER THAN THE MAPPING IT CHECKS: `<> 'pending'`,
-- not the five values the function knows. Written against the function's own
-- list it is self-consistent and vacuous — that is exactly how the 'committed'
-- mistake above survived a postcondition. Anything the pipeline finished but
-- this file cannot act on fails here, loudly, instead of stranding rows.
DO $verify$
DECLARE
  v_stranded int;
  v_scheduled int;
BEGIN
  SELECT count(*) INTO v_stranded
    FROM public.community_submissions cs
   WHERE cs.status = 'processing'
     AND EXISTS (
       SELECT 1 FROM public.ingestion_staging st
        -- Same partial-index predicate as the LATERAL above. See the note there.
        WHERE st.raw_data ? '_submission_id'
          AND st.raw_data->>'_submission_id' = cs.id::text
          AND st.disposition <> 'pending');
  IF v_stranded <> 0 THEN
    RAISE EXCEPTION 'community_submission_reconcile: % submissions still processing despite a finished staging row (unmapped disposition?)', v_stranded;
  END IF;

  SELECT count(*) INTO v_scheduled
    FROM cron.job WHERE jobname = 'community_submission_reconcile';
  IF v_scheduled <> 1 THEN
    RAISE EXCEPTION 'community_submission_reconcile: expected exactly 1 cron job, found %', v_scheduled;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_automations
     WHERE slug = 'community_submission_reconcile' AND enabled) THEN
    RAISE EXCEPTION 'community_submission_reconcile: registry row missing or disabled';
  END IF;
END
$verify$;
