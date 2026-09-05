-- Retire the 06:15 legacy event sweep.
--
-- `run_event_dedup_sweep` (20260623150504) merges events directly through
-- _event_merge_core with no review queue, no confidence, no showtime suppression and
-- -- the reason this is not merely redundant -- NO MEMORY OF HUMAN REJECTIONS. The
-- truth sweep skips any pair an admin has rejected; this one has never known about
-- `dedup_review_queue` at all. Its cron fires at 06:15, fifteen minutes after the
-- marketplace sweep and twenty-five before the autoapprove pass, so a pair a reviewer
-- rejected could be merged the same night purely because both rows share a venue_id.
--
-- It is dormant rather than harmless: zero event merges since 2026-08-25 (measured on
-- entity_merge_audit), because its candidate join requires venue_id on BOTH sides and
-- only 5.4% of live events carry one. Dormant-and-unguarded is the state worth ending
-- deliberately, not the state worth leaving alone.
--
-- Everything it can reach is covered by the truth sweep's arm_venue_id (same venue,
-- +/-48h, 0.97, auto) which additionally honours rejections, suppresses showtimes,
-- caps its merge count and writes a reversible audit.
--
-- ORDER IS LOAD-BEARING. The registry row is disabled FIRST, because
-- sync_automations_to_cron() branch (d) recreates a missing cron job for any row that
-- is still `enabled` and carries an action.command -- an unschedule on its own is
-- undone by the next reconciler pass (measured precedent: the wf-enrich-wolfram
-- retirement, which did not hold until 20260813100000 disabled the row). With the row
-- disabled, branch (b) becomes the kill switch and the retirement is durable.
--
-- The registry row is NEVER deleted. A DELETE would make the live job "unregistered",
-- which the reconciler reports and deliberately never auto-kills -- the opposite of
-- what is wanted here.

-- 1. Kill switch first.
UPDATE public.admin_automations
   SET enabled = false,
       updated_at = now(),
       description = coalesce(description,'') ||
         ' [RETIRED 20270822093614: superseded by run_dedup_truth_sweep(''event''), which honours human rejections. Do not re-enable.]'
 WHERE slug = 'event_dedup_sweep';

-- 2. Then unschedule, guarded so a re-run is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event_dedup_sweep') THEN
    PERFORM cron.unschedule('event_dedup_sweep');
  END IF;
END $$;

-- The function stays callable for a deliberate manual run, but says what it is.
COMMENT ON FUNCTION public.run_event_dedup_sweep(boolean, integer) IS
  'RETIRED 20270822093614. Legacy venue_id-keyed event merger: no review queue, no confidence, no showtime suppression, and no memory of rejected dedup_review_queue pairs. Superseded by run_dedup_truth_sweep(''event''). Do not reschedule; disable the admin_automations row first if you ever do.';

-- Assert both halves, and that the row survived. Checking only the cron job would
-- pass on a DELETE, which is the failure mode this migration is written to avoid.
DO $verify$
DECLARE v_enabled boolean; v_exists boolean; v_cron int;
BEGIN
  SELECT true, enabled INTO v_exists, v_enabled
  FROM public.admin_automations WHERE slug = 'event_dedup_sweep';

  IF NOT coalesce(v_exists, false) THEN
    RAISE EXCEPTION 'admin_automations row for event_dedup_sweep is gone -- it must be disabled, never deleted';
  END IF;
  IF v_enabled THEN
    RAISE EXCEPTION 'event_dedup_sweep is still enabled; the reconciler would recreate its cron';
  END IF;

  SELECT count(*) INTO v_cron FROM cron.job WHERE jobname = 'event_dedup_sweep';
  IF v_cron <> 0 THEN
    RAISE EXCEPTION 'cron job event_dedup_sweep still scheduled (% rows)', v_cron;
  END IF;

  RAISE NOTICE 'event_dedup_sweep retired: registry row present and disabled, cron unscheduled';
END $verify$;
