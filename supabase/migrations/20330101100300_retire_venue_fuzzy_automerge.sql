-- Retire run_venue_fuzzy_automerge: a second venue auto-merger with no memory of
-- human rejections.
--
-- It carries the SAME predicate the nightly sweep's venue arm carried until
-- 20330101100100 -- identical dedup_despace / dedup_core_tokens key, identical
-- `haversine_m(...) < 150` gate -- and calls _venue_merge_core directly with a
-- NULL actor. Two independent implementations of one rule is already a drift
-- surface; what makes this one unsafe is narrower and specific:
--
--   IT NEVER READS dedup_review_queue. The sweep opens its loop with a rejection
--   check -- an admin who said "not a duplicate" is honoured forever. This
--   function has no such check, so a pair a human explicitly rejected can be
--   merged anyway by pressing a button. All four venue rejections on record are
--   pairs that share a name key: Rapa Nui's two Buenos Aires branches, ElNin-Yo's
--   two Bangkok addresses, GMHC's two offices, and Jessheim vs Fredrikstad Pride.
--   Every one of them is reachable by this function.
--
-- Exactly the reason 20270822093614 retired the legacy 06:15 event sweep.
--
-- THE RETIREMENT PATTERN DOES NOT APPLY HERE, and saying so is the point rather
-- than performing the ritual. 20270822093614 had to disable an admin_automations
-- row FIRST because sync_automations_to_cron() branch (d) recreates any enabled
-- registry row whose cron job is missing. Measured on prod 2026-09-06:
--
--   cron.job matching run_venue_fuzzy_automerge  -> 0
--   admin_automations matching it                -> 0
--
-- There is nothing scheduled and nothing registered. It is reachable only from
-- the "Auto-merge N same-place" button on /admin/duplicates, and only because it
-- is granted to `authenticated`. So the retirement is a REVOKE plus removing the
-- button; inventing a registry row in order to disable it would create the thing
-- the pattern exists to kill.
--
-- The function body is left in place rather than dropped. It contains
-- assert_admin_or_internal(), so with the grant gone it is unreachable from
-- PostgREST while staying available to a deliberate service_role call during the
-- soak -- and DROP would need the /admin/duplicates config removed in the same
-- deploy or the button 404s instead of disappearing. If the soak is clean, drop
-- it in a follow-up.

REVOKE EXECUTE ON FUNCTION public.run_venue_fuzzy_automerge(boolean, integer) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.run_venue_fuzzy_automerge(boolean, integer) IS
  'RETIRED 20330101100300. Second venue auto-merger, geo-gated at 150 m, with NO '
  'memory of dedup_review_queue rejections -- it can merge a pair a human rejected. '
  'Superseded by run_dedup_truth_sweep(''venue''), which honours rejections and '
  'corroborates on address/domain/phone rather than on coordinates. service_role only; '
  'drop after soak.';

DO $verify$
DECLARE v_anon boolean; v_authed boolean; v_cron int; v_reg int;
BEGIN
  SELECT has_function_privilege('anon', 'public.run_venue_fuzzy_automerge(boolean,integer)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.run_venue_fuzzy_automerge(boolean,integer)', 'EXECUTE')
    INTO v_anon, v_authed;

  -- Test the PRIVILEGE, not proacl: this project carries ALTER DEFAULT PRIVILEGES
  -- ... GRANT ALL ON FUNCTIONS TO anon, so a partial revoke can read as removed in
  -- the ACL while has_function_privilege() is still true.
  IF v_anon THEN RAISE EXCEPTION 'run_venue_fuzzy_automerge still executable by anon'; END IF;
  IF v_authed THEN RAISE EXCEPTION 'run_venue_fuzzy_automerge still executable by authenticated'; END IF;

  -- Re-assert the premise this migration rests on. If a cron or a registry row
  -- appeared since it was written, a bare REVOKE is NOT the retirement -- the
  -- registry row would have to be disabled first, and an internal caller bypasses
  -- the grant entirely.
  SELECT count(*) INTO v_cron FROM cron.job
   WHERE command ILIKE '%run_venue_fuzzy_automerge%' OR jobname ILIKE '%venue_fuzzy%';
  SELECT count(*) INTO v_reg FROM public.admin_automations
   WHERE slug ILIKE '%venue_fuzzy%' OR action::text ILIKE '%run_venue_fuzzy_automerge%';

  IF v_cron > 0 THEN
    RAISE EXCEPTION 'run_venue_fuzzy_automerge is scheduled in pg_cron (% job(s)) -- revoking the grant does not stop a cron; disable the registry row first, then unschedule (pattern 20270822093614)', v_cron;
  END IF;
  IF v_reg > 0 THEN
    RAISE EXCEPTION 'run_venue_fuzzy_automerge has % admin_automations row(s) -- disable them rather than DELETE, or sync_automations_to_cron will recreate the job', v_reg;
  END IF;

  RAISE NOTICE 'run_venue_fuzzy_automerge retired: service_role only, no cron, no registry row';
END $verify$;
