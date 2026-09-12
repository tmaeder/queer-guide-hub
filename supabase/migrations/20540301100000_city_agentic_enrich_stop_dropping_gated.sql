-- ============================================================================
-- city_agentic_enrich: stop DISCARDING every review-gated proposal
-- ============================================================================
-- The hourly cron posted `{"batch_limit": 5, "skip_gated": true}`, and in
-- city-agentic-enrich/index.ts that flag does this:
--
--     if (skipGated) gatedProposals.length = 0
--
-- It runs AFTER the pushes that build the array, so every gated proposal the
-- model produced was thrown away before the queue insert. Not "not produced" —
-- produced, then dropped. Measured on prod before this change, since
-- 2026-09-03: 52 agentic runs produced 48 `editorial_hook` proposals, 42
-- `lgbt_friendly_rating` proposals and 1 `best_time_to_visit`, and the queue
-- received NONE of them. The newest open review row for either of the two
-- long-standing gated fields was 2026-09-02 20:36, ten days stale, while the
-- cron ran every hour throughout.
--
-- This is the failure class the repo already documents twice — a queue that
-- collects decisions and discards them (the 40-day `ai_validation_status`
-- incident) — except here the loss happens one step earlier, before anything
-- is ever written down, so no queue depth and no sentinel could show it. The
-- only visible symptom was a review queue that had quietly stopped growing.
--
-- WHAT MADE IT VISIBLE, and it was not a counter. 20490210090000 moved
-- `best_time_to_visit` into the same gated set, and the very first proposal
-- the compact voice produced in production was Haapsalu linn's "Summer, for
-- festivals and mud spa treatments" (2026-09-12 03:21Z, confidence 0.8). It
-- was correctly NOT auto-published — the gate works — and then it was not
-- queued either. Checked by hand, the claim is true: Haapsalu is Estonia's
-- oldest resort, its curative sea-mud clinic opened in 1825, and its own
-- tourist board calls it an event resort for the summer season. So the flag
-- was not protecting anyone from bad content; it was discarding good content
-- along with bad, which is the argument for removing it rather than for
-- tuning it.
--
-- THE REGISTRY IS THE ONLY THING THIS FILE TOUCHES. `action.command` is
-- canonical and holds the readable, unwrapped SQL; the wrapped form that
-- pg_cron actually runs is derived by `admin_automation_effective_command()`
-- and applied by `sync_automations_to_cron()`'s command-drift branch. Editing
-- `cron.job` from a migration is the `detect_stale_venues` mistake — a
-- `cron.schedule()` in a migration is not durable against the next reconciler
-- pass, and there the drift sat uncorrected for two months.
--
-- This migration deliberately does NOT call `sync_automations_to_cron(true)`.
-- That reconciler is global: it can recreate, re-wrap and kill OTHER jobs in
-- the same pass, and whatever drift exists at CI time is not this change's to
-- apply. Propagation is the nightly `automation_cron_sync` (`10 5 * * *`).
-- Applied live on 2026-09-12 06:2xZ, where the dry run reported exactly
-- `command_rewrapped: [{"jobname": "city_agentic_enrich"}]` and nothing else,
-- and the resulting cron command was verified to have lost `skip_gated` while
-- keeping `admin_automation_run_begin` and `automation_http_post` (the tracked
-- shim — a raw `net.http_post` there would silently break run bookkeeping).
--
-- Soft on preconditions: the UPDATE is guarded on the flag still being present,
-- so this is a no-op if a concurrent session or the live fix already did it.
-- Hard on the postcondition this file exists to reach.
-- ============================================================================

UPDATE public.admin_automations
   SET action = jsonb_set(
         action, '{command}',
         to_jsonb(replace(action->>'command',
                          '{"batch_limit": 5, "skip_gated": true}',
                          '{"batch_limit": 5}')))
 WHERE slug = 'city_agentic_enrich'
   AND action->>'command' LIKE '%skip_gated%';

-- ---------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------
DO $verify$
DECLARE
  v_cmd      text;
  v_enabled  boolean;
  v_cron_cmd text;
BEGIN
  SELECT action->>'command', enabled INTO v_cmd, v_enabled
    FROM public.admin_automations WHERE slug = 'city_agentic_enrich';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'city_agentic_enrich has no registry row — nothing to fix, and the cron is now unregistered';
  END IF;

  -- The whole point.
  IF v_cmd LIKE '%skip_gated%' THEN
    RAISE EXCEPTION 'skip_gated survived in the registry command — gated proposals are still being discarded';
  END IF;

  -- ...but the job must still actually DO something. A replace() that ate more
  -- than intended would pass the check above and silently break the cron.
  IF v_cmd NOT LIKE '%batch_limit%' THEN
    RAISE EXCEPTION 'batch_limit lost from the registry command';
  END IF;
  IF v_cmd NOT LIKE '%city-agentic-enrich%' THEN
    RAISE EXCEPTION 'the function url was mangled by the rewrite';
  END IF;
  IF v_cmd NOT LIKE '%city_quality_webhook_secret%' THEN
    RAISE EXCEPTION 'the vault secret lookup was lost — every call would 401';
  END IF;
  IF NOT v_enabled THEN
    RAISE EXCEPTION 'city_agentic_enrich is disabled; re-enabling is a separate decision, not a side effect of this file';
  END IF;

  -- The registry is canonical, so pg_cron is REPORTED rather than asserted:
  -- the nightly automation_cron_sync owns propagation, and between this merge
  -- and 05:10 the live job legitimately still carries the old command.
  SELECT command INTO v_cron_cmd FROM cron.job WHERE jobname = 'city_agentic_enrich';
  IF v_cron_cmd IS NULL THEN
    RAISE NOTICE 'no live cron job named city_agentic_enrich; sync_automations_to_cron will create it';
  ELSIF v_cron_cmd LIKE '%skip_gated%' THEN
    RAISE NOTICE 'live cron still carries skip_gated; the nightly automation_cron_sync will re-wrap it from the registry';
  ELSE
    RAISE NOTICE 'live cron already clean';
    -- If it HAS been synced, the wrap must have survived: a re-wrap that drops
    -- run_begin or falls back to a raw net.http_post yields a job that works
    -- but records no runs, which is how a failing cron reads as healthy.
    IF v_cron_cmd NOT LIKE '%admin_automation_run_begin%'
       OR v_cron_cmd NOT LIKE '%automation_http_post%' THEN
      RAISE EXCEPTION 'live cron lost its run-tracking wrapper — runs would stop being recorded';
    END IF;
  END IF;
END
$verify$;
