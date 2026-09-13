-- ============================================================================
-- news_orphan_reclaim: quality-enhance batch_size 15 -> 60
-- ----------------------------------------------------------------------------
-- This cron (hourly, :30) is the ONLY caller of pipeline-quality-enhance that
-- posts no pipeline_run_id, so it is the only path by which a staging row that
-- missed its DAG run is ever re-judged. At batch_size 15 the 854-row cohort that
-- 40500101100000 re-offers would take ~57 hours to drain, and because the
-- selector is oldest-first that cohort (from 2026-05-24) sorts AHEAD of current
-- inflow (2026-09-12) — every new article and podcast queues behind it for two
-- and a half days. 60 brings it to ~14 hours.
--
-- 60 is the CEILING, not a round number: pipeline-quality-enhance clamps with
-- `Math.min(60, body.batch_size ?? 24)`, so a larger value here would silently
-- be 60 anyway and the registry would then misrepresent what runs.
--
-- THE REGISTRY IS CANONICAL AND cron.job IS NOT EDITED HERE. action.command
-- keeps the plain readable net.http_post form; admin_automation_effective_command()
-- derives the run-tracking wrapper and sync_automations_to_cron()'s command-drift
-- branch applies it. A cron.schedule() inside a migration is the detect_stale_venues
-- mistake — it is not durable against the next reconciler pass, and in that case
-- did not even apply cleanly the first time.
--
-- This migration deliberately does NOT call sync_automations_to_cron(true).
-- That reconciler is GLOBAL: branch (b) unschedules every disabled row and
-- branch (d) recreates enabled ones, which is exactly how the nightly pass took
-- the whole ingest engine down for 40 hours on 2026-08-24. Whatever unrelated
-- drift exists at CI time is not this change's to apply. Propagation is the
-- nightly automation_cron_sync (10 5 * * *). Until it runs, the live cron keeps
-- firing at 15 — correct, just slower. If it is needed sooner, run
-- sync_automations_to_cron(false) FIRST and READ the report: proceed only if
-- command_rewrapped names news_orphan_reclaim and nothing else is touched.
--
-- SUBSTITUTION, NOT AN ARGUMENT-LIST PARSE. The command posts TWICE in one
-- statement — pipeline-enrich-news at batch_size 20 and pipeline-quality-enhance
-- at 15 — so any expression-level rewrite risks hitting the wrong one. Measured
-- on prod: the token '"batch_size":15,"concurrency":3' occurs exactly once in
-- this command and in exactly one registry row repo-wide, while the enrich post
-- carries 20 and cannot match. Only the quality-enhance post moves.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. A concurrent session may have
-- already raised this, so an exact-match premise would abort and block every
-- migration queued behind it on main. Already-60 is a no-op; the assertions
-- below are what this file exists to guarantee.
--
-- KNOWN CONSEQUENCE, recorded rather than discovered later. The registered
-- timeout_milliseconds is 60000 and a 60-item batch cannot answer inside it, so
-- pg_net will record `timed_out`. That is classified `partial`, NOT an error, and
-- never touches consecutive_failures — so this cannot auto-pause the job. It is
-- already partial today at batch 15, so nothing regresses. The cost is that the
-- run stays response-unverifiable, which admin_automation_tracking_gaps()
-- .unverifiable_automations is the sentinel for. Raising the timeout so the
-- response fits is the documented fix, and is deliberately NOT bundled here: it
-- would have to move only the quality-enhance post's timeout while leaving the
-- enrich post's alone, and the right value depends on how long a 60-item batch
-- actually takes, which is worth measuring after this lands rather than guessing
-- now.
--
-- Concurrency is left at 3. 60 items in waves of 3 is 20 waves, and against the
-- 45s per-call ceiling the worst case (900s) exceeds the 546s edge wall — but the
-- degradation is graceful, because apply_enrichment persists each item as it
-- completes, so a wall-clock kill loses only in-flight rows and they are
-- re-offered on the next fire. Raising concurrency to its cap of 6 halves that to
-- 10 waves (~450s, inside the wall) and is the obvious follow-up; it is a
-- separate change because it multiplies parallel LLM calls and wants its own
-- measurement against the provider rate limiter.
-- ============================================================================

DO $$
DECLARE
  v_before text;
  v_after  text;
  v_rows   integer;
BEGIN
  SELECT action->>'command' INTO v_before
  FROM admin_automations WHERE slug = 'news_orphan_reclaim';

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'admin_automations row news_orphan_reclaim is missing — '
      'it is the only unscoped caller of pipeline-quality-enhance; do not create it here';
  END IF;

  IF v_before LIKE '%"batch_size":60,"concurrency":3%' THEN
    RAISE NOTICE 'news_orphan_reclaim already at batch_size 60 — nothing to do';
    RETURN;
  END IF;

  IF v_before NOT LIKE '%"batch_size":15,"concurrency":3%' THEN
    RAISE EXCEPTION 'news_orphan_reclaim command does not carry the expected '
      'quality-enhance token; refusing to guess. Current command: %', v_before;
  END IF;

  UPDATE admin_automations
  SET action = jsonb_set(
        action, '{command}',
        to_jsonb(replace(action->>'command',
          '"batch_size":15,"concurrency":3',
          '"batch_size":60,"concurrency":3'))),
      updated_at = now()
  WHERE slug = 'news_orphan_reclaim';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'expected to update exactly 1 registry row, updated %', v_rows;
  END IF;

  SELECT action->>'command' INTO v_after
  FROM admin_automations WHERE slug = 'news_orphan_reclaim';

  -- Postconditions: the quality-enhance post moved, the enrich post did not, and
  -- the command is still the plain readable form the reconciler expects to wrap.
  IF v_after NOT LIKE '%"batch_size":60,"concurrency":3%' THEN
    RAISE EXCEPTION 'quality-enhance batch_size was not raised to 60';
  END IF;
  IF v_after LIKE '%"batch_size":15%' THEN
    RAISE EXCEPTION 'a batch_size 15 remains in the command after substitution';
  END IF;
  IF v_after NOT LIKE '%"batch_size":20,"concurrency":3%' THEN
    RAISE EXCEPTION 'the pipeline-enrich-news post was altered — it must stay at 20';
  END IF;
  IF v_after NOT LIKE '%pipeline-quality-enhance%'
     OR v_after NOT LIKE '%pipeline-enrich-news%' THEN
    RAISE EXCEPTION 'both post targets must survive the substitution';
  END IF;
  -- The registry must NOT carry the wrapped form; effective_command() derives it.
  -- A registry row that already names automation_http_post would be re-wrapped
  -- into nonsense by the drift branch.
  IF v_after LIKE '%automation_http_post%' THEN
    RAISE EXCEPTION 'registry command must keep the plain net.http_post form';
  END IF;
  IF length(v_after) <> length(v_before) THEN
    RAISE EXCEPTION 'command length changed by more than the two digits substituted (% -> %)',
      length(v_before), length(v_after);
  END IF;

  RAISE NOTICE 'news_orphan_reclaim quality-enhance batch_size 15 -> 60; '
    'live cron still at 15 until the nightly automation_cron_sync rewraps it';
END $$;
