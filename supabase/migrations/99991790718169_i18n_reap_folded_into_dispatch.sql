-- ============================================================================
-- Fold the i18n reap into the dispatcher and retire its cron
-- ----------------------------------------------------------------------------
-- `99991790380618` added `run_i18n_translation_reap` on its own `1-59/5` cron
-- named `i18n_translation_reap`. That name broke a guard I did not check
-- before choosing it:
--
--   'i18n_percombo_cron_count', (
--     SELECT count(*) FROM cron.job
--     WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
--       AND jobname NOT IN ('i18n_translation_dispatch')
--   )
--
-- That sentinel (20260801020000, restated through 20261201100000) exists to
-- catch the ~150 per-combo `i18n_<table>_<field>_<locale>` crons coming back
-- after the P0 consolidation replaced them with one dispatcher. My reaper is
-- not one of those, but it matches the pattern, so `check-pipeline-health`
-- has reported "Per-combo i18n crons re-appeared (1)" on every run since.
-- A guard firing on a false positive is a guard being taught to be ignored.
--
-- THREE FIXES WERE AVAILABLE AND THIS IS THE THIRD.
--
--  (a) Add the jobname to the sentinel's exclusion list. Semantically the
--      most honest — the list exists for exactly this — but it means
--      restating `pipeline_hygiene_stats`, a ~210-line function this
--      codebase already flags as a merge-collision surface, and the Supabase
--      connection was down when this was written, so it could not be
--      dry-run against live. Restating a long shared function from a repo
--      file you cannot compare to prod is how a later definition gets
--      silently reverted.
--
--  (b) Rename the job outside the `i18n\_%` pattern. Small and safe, but it
--      dodges the guard rather than satisfying it, and the next person to
--      add an i18n infrastructure cron walks into the same wall.
--
--  (c) THIS: stop having a second cron at all. The reap has no reason to be
--      independently scheduled — the dispatcher fires every 2 minutes, which
--      is 2.5x more often than the `*/5` it replaces and far inside pg_net's
--      ~6h response retention. Reaping at the HEAD of a dispatch is also
--      strictly better ordering: the previous batch is resolved immediately
--      before the next one is fired, rather than drifting between two
--      schedules that could interleave.
--
-- `run_i18n_translation_reap()` is kept as a callable function — it is useful
-- on its own for an operator, and `i18n_dispatch_signals()` is unchanged.
-- Only its cron and its registry row are retired.
--
-- Retirement follows the house rule: disable the registry row FIRST, then a
-- guarded unschedule. Never DELETE the row — a deleted row makes the live job
-- "unregistered", which `unregistered_cron_jobs` reports forever and which no
-- sweep will auto-kill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dispatcher reaps before it dispatches.
--    Body is otherwise byte-identical to 99991790380618 — the ONLY change is
--    the PERFORM below. Stated explicitly so a reviewer does not have to diff
--    sixty lines to find it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_i18n_translation_dispatch(p_slots integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target record;
  v_count  int := 0;
  v_secret text;
  v_body   jsonb;
  v_req_id bigint;
  v_anon   text;
BEGIN
  -- Resolve the PREVIOUS tick's responses before firing new ones. Cheap (it
  -- touches only rows with an open request id) and it cannot fail the
  -- dispatch: a reap error would abort the transaction, so it is deliberately
  -- allowed to raise rather than being swallowed — a reaper that silently
  -- stops is the exact failure this whole feature exists to prevent.
  PERFORM public.run_i18n_translation_reap();

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'run_i18n_translation_dispatch: internal_invoke_secret missing, skipping';
    RETURN 0;
  END IF;

  -- The anon key is public (it ships in the frontend bundle); it is sent only
  -- so the gateway lets the request through whether verify_jwt is on or off.
  -- Real auth is X-Internal-Secret, checked inside the function.
  SELECT decrypted_secret INTO v_anon
  FROM vault.decrypted_secrets WHERE name = 'anon_key';
  v_anon := coalesce(
    v_anon,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'
  );

  FOR v_target IN
    SELECT * FROM i18n_translation_targets
    WHERE enabled
    ORDER BY last_run_at NULLS FIRST, priority, table_name, field, locale
    LIMIT greatest(coalesce(p_slots, 5), 0)
  LOOP
    v_body := jsonb_build_object(
      'table',       v_target.table_name,
      'locale',      v_target.locale,
      'field',       v_target.field,
      'batch_limit', v_target.batch_limit
    );
    IF v_target.min_quality IS NOT NULL THEN
      v_body := v_body || jsonb_build_object('min_quality', v_target.min_quality);
    END IF;

    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'X-Internal-Secret', v_secret
      ),
      body := v_body,
      timeout_milliseconds := 30000
    ) INTO v_req_id;

    UPDATE i18n_translation_targets
       SET last_run_at     = now(),
           last_request_id = v_req_id,
           -- The previous outcome is stale the moment we re-fire. Clearing it
           -- keeps "unresolved" distinguishable from "resolved and fine".
           last_status     = NULL
     WHERE id = v_target.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- ---------------------------------------------------------------------------
-- 2. Retire the reap cron. Registry row FIRST, then the guarded unschedule.
-- ---------------------------------------------------------------------------
UPDATE public.admin_automations
   SET enabled = false,
       description = 'RETIRED ' || to_char(now(), 'YYYY-MM-DD') ||
                     ': the reap now runs at the head of run_i18n_translation_dispatch '
                     'every 2 minutes. Kept as a disabled row rather than deleted so the '
                     'job can never be recreated by sync_automations_to_cron and so the '
                     'live job is never reported as unregistered. '
                     'run_i18n_translation_reap() is still callable by hand.',
       updated_at = now()
 WHERE slug = 'i18n_translation_reap';

SELECT cron.unschedule('i18n_translation_reap')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'i18n_translation_reap');

-- ---------------------------------------------------------------------------
-- Postconditions. Assert the state this file exists to REACH.
-- Comments are stripped before every pg_get_functiondef assertion: the
-- unstripped form can be satisfied by the prose that explains a symbol
-- rather than the code that uses it (scripts/check-functiondef-asserts.mjs).
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_src      text;
  v_percombo int;
  v_jobs     int;
BEGIN
  v_src := regexp_replace(
    pg_get_functiondef('public.run_i18n_translation_dispatch(integer)'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g');

  IF position('run_i18n_translation_reap()' in v_src) = 0 THEN
    RAISE EXCEPTION 'the dispatcher does not call the reaper — folding it in was the whole point';
  END IF;
  -- The dispatcher must still do its own job.
  IF position('last_request_id = v_req_id' in v_src) = 0 THEN
    RAISE EXCEPTION 'the dispatcher stopped recording the pg_net request id';
  END IF;

  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'i18n_translation_reap';
  IF v_jobs <> 0 THEN
    RAISE EXCEPTION 'i18n_translation_reap cron still scheduled (%)', v_jobs;
  END IF;

  -- The dispatcher itself must survive: retiring the reap must not have
  -- unscheduled the thing that drives the whole pipeline.
  SELECT count(*) INTO v_jobs
  FROM cron.job WHERE jobname = 'i18n_translation_dispatch' AND active;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 active i18n_translation_dispatch job, found %', v_jobs;
  END IF;

  -- And the guard this file exists to satisfy must now read zero.
  SELECT count(*) INTO v_percombo FROM cron.job
   WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
     AND jobname NOT IN ('i18n_translation_dispatch');
  IF v_percombo <> 0 THEN
    RAISE EXCEPTION 'i18n_percombo_cron_count is still % — expected 0', v_percombo;
  END IF;

  RAISE NOTICE 'i18n reap folded into dispatch; per-combo cron count is 0';
END $verify$;
