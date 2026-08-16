-- ============================================================================
-- The projector and the reaper deadlocked against each other, every tick.
-- ----------------------------------------------------------------------------
-- #2817 scheduled both admin_automation_project and admin_automation_reap at
-- '*/5 * * * *' — the SAME minute, forever. Both walk a set of automations and
-- write public.admin_automations: the projector directly (last_cron_runid,
-- last_run_at), the reaper indirectly, because finalizing a run row fires the
-- auto-pause trigger which updates the parent row. Neither takes those row
-- locks in a defined order — the projector follows its automation loop, the
-- reaper follows open run ids — so two long transactions each held locks the
-- other wanted.
--
-- Measured on prod: deadlock at 09:50, 10:00, 10:30 and 11:10 on the first
-- morning. Combined with the double-counting fixed in the previous migration,
-- that was enough to auto-pause admin_automation_reap itself — the layer the
-- entire response-truth half depends on, and the only one that can see a
-- target which never answers at all. A safety net that disables its own
-- detector is worse than no net, because the admin column still looks alive.
--
-- FIX, two independent layers:
--
--  1. A shared advisory lock, so the two can never run concurrently whatever
--     the schedules say. try, not blocking: a skipped tick is free (the
--     projector is cursor-driven and the reaper runs every 5 minutes against a
--     ~6h evidence window), whereas a blocking lock would queue pg_cron
--     workers behind a slow run and turn a stall into a pile-up.
--
--  2. Offset schedules, so the normal case never even reaches the lock.
--
-- They stay TWO jobs rather than being merged into one tick. Merging would
-- also have killed the deadlock, and with fewer moving parts — but it puts
-- both in one transaction, where an error in either aborts the other. The
-- reaper is time-critical (net._http_response is retained ~6h; a lost window
-- is unrecoverable) and the projector is not (cron.job_run_details keeps 7
-- days). Coupling the recoverable one to the unrecoverable one is the wrong
-- trade for a safety mechanism.
--
-- The lock is taken in a WRAPPER rather than by rewriting the two functions,
-- so their bodies stay exactly as reviewed in #2817 — restating 200 lines of
-- SQL to insert two lines at the top is how the copies drift.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_automation_project_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('admin_automation_tracking')) THEN
    RETURN jsonb_build_object('skipped', 'lock_busy');
  END IF;
  RETURN public.admin_automation_project_cron_runs();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_automation_reap_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('admin_automation_tracking')) THEN
    RETURN jsonb_build_object('skipped', 'lock_busy');
  END IF;
  RETURN public.admin_automation_reap_runs();
END;
$$;

COMMENT ON FUNCTION public.admin_automation_project_tick() IS
  'Cron entry point for the dispatch-truth projector. Shares one advisory lock with admin_automation_reap_tick so the two can never deadlock over admin_automations row locks.';
COMMENT ON FUNCTION public.admin_automation_reap_tick() IS
  'Cron entry point for the response-truth reaper. Shares one advisory lock with admin_automation_project_tick so the two can never deadlock over admin_automations row locks.';

REVOKE ALL ON FUNCTION public.admin_automation_project_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_automation_reap_tick()    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_project_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_reap_tick()    TO service_role;

-- ── Registry is the source of truth; pg_cron follows ────────────────────────
-- Schedules offset by two minutes so the lock is a backstop, not the mechanism.
UPDATE public.admin_automations
SET action = action || jsonb_build_object('command', 'SELECT public.admin_automation_project_tick();'),
    schedule = '*/5 * * * *'
WHERE slug = 'admin_automation_project';

UPDATE public.admin_automations
SET action = action || jsonb_build_object('command', 'SELECT public.admin_automation_reap_tick();'),
    schedule = '2-59/5 * * * *',
    -- Re-arm: it was auto-paused on a doubled failure count, not on two real
    -- failures. The previous migration recomputes the counter from the audit
    -- log; this clears the pause that count produced.
    enabled = true,
    consecutive_failures = 0
WHERE slug = 'admin_automation_reap';

-- Apply both to pg_cron now rather than waiting for the 05:10 reconciler —
-- until it runs, the live jobs still call the unguarded functions and the
-- reaper's cron would be unscheduled by the kill-switch branch for being a
-- disabled row.
SELECT cron.schedule('admin_automation_project', '*/5 * * * *',
                     'SELECT public.admin_automation_project_tick();');
SELECT cron.schedule('admin_automation_reap',    '2-59/5 * * * *',
                     'SELECT public.admin_automation_reap_tick();');
