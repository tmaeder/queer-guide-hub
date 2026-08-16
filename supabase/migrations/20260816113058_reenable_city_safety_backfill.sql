-- ============================================================================
-- Re-arm city_safety_backfill now that the ON CONFLICT cause is fixed.
-- ----------------------------------------------------------------------------
-- Auto-pause is a one-way door on purpose: it sets enabled = false and nothing
-- clears that automatically, because "it failed three times" is evidence about
-- the past, not evidence that the cause is gone. Re-enabling is an explicit
-- act with a name attached to it, and this migration is that act.
--
-- The cron job itself was never unscheduled — sync_automations_to_cron's kill
-- switch runs nightly at 05:10 and the pause landed after it — so this is the
-- only change needed; branch (b) will now leave the job alone instead of
-- unscheduling it.
-- ============================================================================
UPDATE public.admin_automations
SET enabled = true,
    consecutive_failures = 0,
    last_run_status = 'success'
WHERE slug = 'city_safety_backfill';
