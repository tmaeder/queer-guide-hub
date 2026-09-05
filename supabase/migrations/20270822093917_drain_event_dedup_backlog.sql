-- Run the fixed sweep once, at deploy, instead of waiting for 05:50 tomorrow.
--
-- Two reasons, and the second one is not cosmetic.
--
-- 1. The backlog is 11 days old. The arms are fixed by 20270822093513 and the venue
--    name column by 20270822093715, so the pairs are mergeable the moment this series
--    applies; leaving them for the cron means another day of duplicates on the site
--    for no reason.
--
-- 2. THE SENTINEL WOULD OTHERWISE GO RED ON A CORRECT DEPLOY. event_dup_signals()
--    hard-fails on `would_merge > 0 AND merges_last_7d = 0` -- candidates exist and
--    nothing is merging them. Immediately after this series that is exactly the true
--    state: the arms now see ~39 pairs and the last event merge was 2026-08-25. The
--    check would fail for up to 24 hours until the first nightly run, on a deploy that
--    is working perfectly. A gate that cries wolf on a good deploy is a gate people
--    learn to ignore, and this one was written because nobody noticed an eleven-day
--    outage. Draining here makes the deploy self-consistent: merges_last_7d > 0 and
--    would_merge back to ~0 by the time CI runs the health check.
--
-- This is a real data change: ~39 merges. It is the same work the cron would do
-- tonight, through the same code path, under the same caps -- and it is reversible for
-- the first time, which is why 20270822093311/100100 land before it rather than after.
-- Every merged pair is an entity_merge_audit row carrying details.moved, so any one of
-- them can be undone with unmerge_entities(audit_id).
--
-- mode is passed explicitly rather than read from admin_automations: this must do what
-- the migration says even if the registry lever happens to be queue_only today.

DO $drain$
DECLARE v_res jsonb; v_merged int; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.entity_merge_audit WHERE entity_type = 'event';

  v_res := public.run_dedup_truth_sweep('event', 'full');
  v_merged := coalesce((v_res->>'auto_merged')::int, 0);

  SELECT count(*) INTO v_after FROM public.entity_merge_audit WHERE entity_type = 'event';
  RAISE NOTICE 'event backlog drain: % (audit rows % -> %)', v_res, v_before, v_after;

  -- The whole series exists to make this number non-zero. If it is still zero the
  -- arms did not take effect and the deploy must not look successful.
  IF v_merged = 0 THEN
    RAISE EXCEPTION 'event sweep merged nothing after the arm fix -- 20270822093513 did not take effect (result: %)', v_res;
  END IF;

  -- The loop counts a failed merge as "skipped", silently. A drain that skipped more
  -- than it merged means merge_entities is throwing and the audit is not being written.
  IF coalesce((v_res->>'skipped')::int, 0) > v_merged THEN
    RAISE EXCEPTION 'event sweep skipped % pairs while merging only % -- merges are failing silently (result: %)',
      v_res->>'skipped', v_merged, v_res;
  END IF;

  IF v_after <> v_before + v_merged THEN
    RAISE EXCEPTION 'audit rows moved by % but the sweep reported % merges', v_after - v_before, v_merged;
  END IF;
END $drain$;

-- With the backlog drained, the sentinel must now read clean. This is the assertion
-- that the whole series worked, phrased as the health check phrases it.
DO $verify$
DECLARE v jsonb;
BEGIN
  v := public.event_dup_signals();
  IF (v->>'dry_run_error') IS NOT NULL THEN
    RAISE EXCEPTION 'event_dup_signals probe broken: %', v->>'dry_run_error';
  END IF;
  IF coalesce((v->>'would_merge')::int, -1) > 0 AND coalesce((v->>'merges_last_7d')::int, 0) = 0 THEN
    RAISE EXCEPTION 'sentinel would fail immediately after deploy: %', v;
  END IF;
  IF coalesce((v->>'open_auto_eligible')::int, 0) > 0 THEN
    RAISE EXCEPTION 'auto-eligible event pairs left sitting in the review queue: %', v;
  END IF;
  IF (v->>'legacy_sweep_scheduled')::boolean IS TRUE THEN
    RAISE EXCEPTION 'legacy event_dedup_sweep is still scheduled -- 20270822093614 did not take';
  END IF;
  RAISE NOTICE 'event dedup healthy after drain: %', v;
END $verify$;
