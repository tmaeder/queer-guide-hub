-- ============================================================================
-- Retire username_auto_assign: obsolete, and structurally unable to run anyway
-- ============================================================================
--
-- The row reads as a healthy nightly job and is neither. Measured 2026-09-11:
--
--   enabled            true
--   schedule           '0 5 * * *'
--   last_run_at        NULL -- never, since it was registered 2026-06-12
--   action             {"type":"sql","function":"auto_assign_usernames"}
--   cron.job matching  0
--
-- It carries NO action.command, so sync_automations_to_cron() branch (d) —
-- which only recreates a missing cron for an enabled row that HAS one — cannot
-- schedule it. It has been enabled-but-unschedulable for three months. That is
-- the same shape as the rpc-typed rows documented in CLAUDE.md, where
-- re-enabling restores nothing because the cron must come from the originating
-- migration.
--
-- BUT THE FIX IS NOT TO SCHEDULE IT.
--
-- 20260915090000_handle_new_user_restore_consent_and_defaults mints the handle
-- INLINE at signup, using (its own words) "the same algorithm as
-- auto_assign_usernames … so a handle minted here matches". Its header names
-- this very cron as the gap it closed:
--
--   "auto_assign_usernames is a DAILY cron (0 5 * * *), so a new user would
--    [carry a null handle for up to a day]. That gap is not cosmetic:
--    trg_mirror_username_to_display_name only fires when username IS NOT NULL,
--    so a null handle leaves display_name as the [email prefix]."
--
-- So the deadline sweep is obsolete: signup now guarantees a username, and
-- there is nothing left for a nightly pass to find. Measured on prod: 17
-- profiles, ZERO without a username.
--
-- The row is retired rather than deleted — a DELETE would make the registry
-- forget it, and sync_automations_to_cron()'s branch (a) reports an unregistered
-- cron rather than killing one, so a deleted row is strictly worse than a
-- disabled one. It also gets the [RETIRED marker so check-pipeline-health §6b
-- keeps naming it on the warn path instead of hard-failing on it, per the
-- convention established for the other six.
--
-- public.auto_assign_usernames() is deliberately KEPT. It is the shared
-- algorithm handle_new_user matches, and it remains useful as a manual backfill
-- if a future import ever creates profiles outside the signup trigger. Dropping
-- it would remove the reference implementation for no gain.
-- ============================================================================

DO $$
DECLARE
  v_enabled boolean;
  v_marked  boolean;
BEGIN
  -- Soft on preconditions: if a concurrent change already retired it, no-op.
  UPDATE public.admin_automations
     SET enabled = false,
         description = '[RETIRED 2026-09-11: obsolete — 20260915090000 mints the username inline in handle_new_user using the same algorithm, so the nightly deadline sweep has nothing to find (measured: 0 of 17 profiles without a username). It also never ran once: action carries no command, so sync_automations_to_cron branch (d) could not schedule it. public.auto_assign_usernames() is kept as the shared algorithm and a manual backfill.] '
                       || coalesce(description, '')
   WHERE slug = 'username_auto_assign'
     AND (enabled OR coalesce(description, '') !~* '\[(RETIRED|COMPLETED)');

  -- Hard on postconditions.
  SELECT enabled, coalesce(description,'') ~* '\[(RETIRED|COMPLETED)'
    INTO v_enabled, v_marked
    FROM public.admin_automations
   WHERE slug = 'username_auto_assign';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'username_auto_assign is missing from the registry — it must be retired, not deleted';
  END IF;
  IF v_enabled THEN
    RAISE EXCEPTION 'username_auto_assign is still enabled';
  END IF;
  IF NOT v_marked THEN
    RAISE EXCEPTION 'username_auto_assign carries no [RETIRED marker; §6b would hard-fail on it';
  END IF;

  -- The shared algorithm must survive the retirement.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_assign_usernames') THEN
    RAISE EXCEPTION 'auto_assign_usernames() was dropped; handle_new_user matches its algorithm and it is the manual backfill';
  END IF;

  -- And retiring it must not have scheduled anything.
  IF EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%auto_assign_usernames%') THEN
    RAISE EXCEPTION 'a cron for auto_assign_usernames exists; this migration must not create one';
  END IF;
END $$;
