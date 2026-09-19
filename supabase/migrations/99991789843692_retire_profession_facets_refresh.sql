-- ============================================================================
-- Retire profession_facets_refresh: it refreshes a matview that is now a VIEW
-- ============================================================================
--
-- `profession_facets_refresh` runs nightly at 04:35:
--
--     REFRESH MATERIALIZED VIEW CONCURRENTLY public.personality_profession_facets;
--
-- `personality_profession_facets` is a plain VIEW (pg_class.relkind='v'), so the
-- statement fails outright:
--
--     ERROR: "personality_profession_facets" is not a table or materialized view
--
-- Failing every night since 2026-09-18, consecutive_failures=2 against
-- auto_pause_threshold=3 — one more run and auto-pause disables it, which is the
-- one-way door whose success branch then erases its own evidence.
--
-- A view is always live. There is nothing to refresh and nothing to replace this
-- with: the job is obsolete, not broken. Retiring it rather than repointing it.
--
-- Order matters and is the documented convention: disable the REGISTRY row
-- first, so sync_automations_to_cron() branch (b) becomes a kill switch, THEN
-- unschedule. A DELETE would instead make the live job "unregistered", which
-- branch (a) reports and deliberately never auto-kills.
--
-- The [RETIRED ...] marker is required, not decorative: check-pipeline-health
-- §6b hard-fails on a row that was auto-paused and then looks healthy again, and
-- the marker is the migration-reviewed escape hatch that moves it to the WARN
-- path where it is still named on every run.
-- ============================================================================

DO $$
DECLARE
  v_kind "char";
BEGIN
  -- Soft on the precondition, hard on the postcondition. If a later change turns
  -- it back into a materialized view, this migration must NOT retire a job that
  -- has become correct again.
  SELECT c.relkind INTO v_kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'personality_profession_facets';

  IF v_kind = 'm' THEN
    RAISE NOTICE 'personality_profession_facets is a materialized view again — leaving the refresh cron alone';
    RETURN;
  END IF;

  UPDATE public.admin_automations
     SET enabled = false,
         description = '[RETIRED 2026-09-19: personality_profession_facets became a plain VIEW, so REFRESH MATERIALIZED VIEW fails outright ("is not a table or materialized view") and a view needs no refresh. Failing nightly since 2026-09-18 at consecutive_failures=2 of 3. Re-arm only if it is turned back into a matview.] '
                       || coalesce(description, '')
   WHERE slug = 'profession_facets_refresh'
     AND coalesce(description, '') !~* '\[(RETIRED|COMPLETED)';

  -- Guarded unschedule — only after the registry row is off.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'profession_facets_refresh') THEN
    PERFORM cron.unschedule('profession_facets_refresh');
  END IF;
END $$;

DO $verify$
DECLARE
  v_enabled boolean;
  v_marked  boolean;
  v_jobs    int;
  v_kind    "char";
BEGIN
  SELECT c.relkind INTO v_kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'personality_profession_facets';
  IF v_kind = 'm' THEN
    RETURN;  -- the no-op branch above ran; nothing to assert
  END IF;

  SELECT enabled, coalesce(description,'') ~* '\[RETIRED'
    INTO v_enabled, v_marked
    FROM public.admin_automations WHERE slug = 'profession_facets_refresh';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'profession_facets_refresh registry row is missing — it must be disabled, never deleted';
  END IF;
  IF v_enabled THEN
    RAISE EXCEPTION 'profession_facets_refresh is still enabled';
  END IF;
  IF NOT v_marked THEN
    RAISE EXCEPTION 'profession_facets_refresh carries no [RETIRED marker — check-pipeline-health would hard-fail on it';
  END IF;

  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'profession_facets_refresh';
  IF v_jobs <> 0 THEN
    RAISE EXCEPTION 'profession_facets_refresh is still scheduled (% job(s))', v_jobs;
  END IF;
END $verify$;
