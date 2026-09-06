-- Re-score the venue review backlog against the new arms, then take one small,
-- hand-auditable first pass.
--
-- WHY THE BACKLOG NEEDS TOUCHING AT ALL. 530 venue pairs sit open, the oldest
-- queued 2026-07-25 (43 days), every one of them scored 0.75 or 0.85 by the arms
-- 20330101100100 replaced. Those confidences are below every auto-approve
-- threshold in the system (approve_dedup_review_batch and
-- run_dedup_review_autoapprove both start at 0.95), so nothing but a human could
-- ever clear them -- and no human has, since July. Left alone they would keep
-- their old confidence, their old reason string and their thin two-titles payload
-- forever, because dedup_review_queue_open_pair is a UNIQUE index and the sweep's
-- `on conflict do nothing` means a re-run never relabels an existing open row.
--
-- SUPERSEDE, DON'T RE-SCORE BY HAND. Marking the machine-generated rows
-- 'superseded' makes the engine regenerate them under the new ladder -- merging
-- what now qualifies and re-queueing the rest with the address-bearing payload
-- from 20330101100050. Writing a second scoring pass here in SQL would be a
-- third implementation of the arms, free to disagree with both. Same move as
-- 20270822093513's relabel of the event backlog.
--
-- SCOPED TO source='sweep' AND THE TWO MACHINE REASONS, deliberately:
--   * 65 approved and 4 rejected rows are human decisions and are not touched.
--     The 4 rejections keep working as rejection memory -- the sweep's first loop
--     step skips any pair whose (least, greatest) has ever been rejected -- so
--     Rapa Nui, ElNin-Yo, GMHC and Jessheim/Fredrikstad Pride cannot come back
--     even though the new arms would generate them as candidates.
--   * 2 open rows carry a hand-written prose reason (the San Juan AR/PR relink).
--     They are not machine output and are left for the human who wrote them.
--
-- The queue cap is 200 inserts per run, so this pass will NOT re-queue all ~1,165
-- review-bound pairs at once; the rest return over subsequent nightly runs. That
-- is the existing cap doing its job, not a loss -- the unique open-pair index
-- makes every re-run idempotent.
--
-- THE MERGE CAP IS 40, NOT THE DEFAULT 300, AND THAT IS THE WHOLE POINT OF THIS
-- FILE. A dry run says the new arms would auto-merge 238 pairs. Precision on them
-- is 106 pairs read by hand (20/20 same-city address, 29/29 cross-city address,
-- 24/24 shell, 8/8 phone, 23-24/25 domain) -- good, but not proven at 238, and
-- venue merges are NOT cleanly reversible at this commit:
--
--   venue_merge_audit has no `details` column; _venue_merge_core records
--   reparenting as COUNTS; unmerge_venues only un-hides the dropped row and
--   leaves every reparented event, review, check-in, trip place and
--   venue_sources row on the survivor. 9,567 of 11,070 merged venues have no
--   audit row at all.
--
-- So the first pass is sized to be read end to end by a person, from
-- `select * from venue_merge_audit where created_at > now() - interval '1 hour'`,
-- rather than to clear the backlog. The nightly run at 05:50 continues at the
-- default cap once that read is done and the reversibility work has landed.

-- 1. Hand the machine-generated backlog back to the engine.
UPDATE public.dedup_review_queue
   SET status = 'superseded', reviewed_at = now()
 WHERE entity_type = 'venue'
   AND status = 'open'
   AND source = 'sweep'
   AND reason IN ('despace_no_geo', 'core_token_no_geo');

-- 2. One capped pass, so the arms are exercised on real rows in this deploy
--    rather than first running unobserved at 05:50 tomorrow. It also keeps
--    venue_dup_signals (20330101100500) from going red on a CORRECT deploy:
--    `would_merge > 0 AND merges_last_7d = 0` is literally true the moment the
--    arms start working and before anything has merged.
DO $drain$
DECLARE v jsonb; v_merged int; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.venue_merge_audit;

  v := public.run_dedup_truth_sweep('venue', 'full', 40);
  v_merged := (v->>'auto_merged')::int;

  SELECT count(*) INTO v_after FROM public.venue_merge_audit;

  -- A merge that throws is counted as a skip by the loop; 20330101100100 added
  -- merge_error so the reason survives. Surface it here rather than reporting a
  -- clean run over a pile of silent failures.
  --
  -- `chain_skipped` is deliberately NOT an error: a venue held in three copies
  -- generates three pairs, and the first merge collapses the chain so the rest
  -- raise. That is the engine working. Only merge_error -- an unexpected throw
  -- where neither row ended up merged -- aborts.
  IF v->>'merge_error' IS NOT NULL THEN
    RAISE EXCEPTION 'venue merges are throwing: % (full result %)', v->>'merge_error', v;
  END IF;

  IF v_merged = 0 THEN
    RAISE EXCEPTION 'the capped pass merged nothing (%) -- the arms are live but the merge branch is not reached', v;
  END IF;

  -- The audit table is the evidence this pass is auditable at all. If merges
  -- happened without audit rows appearing, the hand-read step below has nothing
  -- to read and the merges are unrecoverable.
  IF v_after - v_before <> v_merged THEN
    RAISE EXCEPTION 'merged % pairs but venue_merge_audit grew by % -- merges are not being recorded',
      v_merged, v_after - v_before;
  END IF;

  RAISE NOTICE 'venue first pass: % merged (cap 40), % queued, % skipped (% chain), % capped',
    v_merged, v->>'queued', v->>'skipped', v->>'chain_skipped', v->>'capped';
  RAISE NOTICE 'READ THESE BY HAND: select * from venue_merge_audit order by created_at desc limit %', v_merged;
END $drain$;
