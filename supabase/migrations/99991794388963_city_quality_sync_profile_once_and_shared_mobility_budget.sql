-- Two red scheduled gates, one shape: a job whose cost crept past its clock, and a
-- job whose upstream got slower than its timeout. Neither is a data defect, and
-- both were invisible until the gate that reads them went red.
--
-- ==========================================================================
-- 1. Data Quality Gates: `city_quality_scorecard unreadable (HTTP 500)`
-- ==========================================================================
-- MEASURED, not inferred. `run_city_quality_issue_sync` calls
-- `_city_quality_full_profile()` THREE times per run -- the `actionable` CTE, the
-- `current_quality` CTE, and again inside `_city_quality_scorecard()` -- plus
-- `run_city_category_review_sync(10000)` at 1.9 s.
--
-- THE PROFILE IS NOISY AND THAT IS THE WHOLE STORY: four readings of the same
-- function over the same 18,965 rows gave 31.5, 34.9, 36.2 and 52.1 s. Three of
-- those per run is ~97-158 s against pg_cron's 120 s clock, which is why the job
-- straddles the limit instead of failing outright -- success 11-04/05/06/07, error
-- 11-08, success 11-09, error 11-10, error 11-11, every failure landing at EXACTLY
-- 00:02:00. Quoting one reading would have made this look like a fixed 109 s and
-- hidden why it fails only half the time.
--
-- THE 500 IS DOWNSTREAM OF THAT, and the chain matters because the scorecard
-- itself is not broken: `api_private.city_quality_scorecard()` serves a STORED
-- snapshot only while `captured_at >= now() - interval '2 days'`. With the writer
-- failing, the newest snapshot (2026-11-09 04:20) aged past two days, the function
-- fell through to the live `public._city_quality_scorecard()` -- 37.1 s against
-- PostgREST's 8 s statement timeout -- and `check-city-quality.mjs` correctly
-- refused to read that 500 as zero findings.
--
-- THE FIX IS FEWER CALLS, NOT A FASTER PROFILE. Measured and rejected:
-- `work_mem = 128MB` removes the temp spill entirely (9,107/2,920 blocks -> 0) and
-- moves execution 34.9 s -> 36.2 s, i.e. nothing -- the cost is per-row scalar work
-- over 18,965 rows, not the spill. And do NOT optimise the functions the timeout
-- CONTEXT line names (`city_description_is_wrong_subject`,
-- `canonicalise_image_url`); 99991793309362 already measured that dead end.
-- So the profile is materialised ONCE per run and the job's own two statements read
-- it: 3 calls -> 2, i.e. ~97-158 s -> ~70-91 s. This is the `tag_hygiene_stats`
-- lesson (3 scans -> 1) one subsystem over.
--
-- Measured after the change, in a rolled-back transaction on prod: materialising
-- the profile 31.5 s, the `current_quality` anti-join reading it 0.091 s (it used to
-- cost a whole profile computation), and ANALYZE 0.277 s. The ANALYZE is kept
-- because it is free at that price, NOT because it was shown to matter -- the
-- anti-join measured 0.145 s with stats and 0.091 s without, i.e. the same. The
-- 52.1 s reading that first looked like ANALYZE overhead was profile variance.
--
-- The scorecard's own call is deliberately NOT shared. Teaching
-- `_city_quality_scorecard()` to read the temp table would break the api_private
-- fallback, which calls it with no temp table in scope, and making it create one
-- would be a write from a STABLE function. One call remains; the raised clock is
-- what makes that safe.
--
-- AND THE 300 s TIMEOUT THAT WAS ALREADY SET IS INERT, which is why the previous
-- round of this same incident did not hold. `run_city_quality_issue_sync` carries
-- `SET statement_timeout = '300s'` in its proconfig, yet every failure landed at
-- 120 s. A function-level SET applies on ENTRY and does NOT re-arm the clock of the
-- statement that called it -- proven behaviourally rather than asserted: a function
-- declaring `SET statement_timeout = '60s'` whose body sleeps 4 s was still
-- cancelled under a caller's 2 s. The cron command is a single statement
-- (`select public.run_city_quality_issue_sync(10000);`), so the proconfig can never
-- apply to it. The timeout therefore has to be a SEPARATE statement in the cron
-- command, which is what this migration does. The proconfig is left in place: it is
-- correct for any other caller, and removing it would read as lowering the budget.
--
-- Editing `cron.job` directly is the convention here and is NOT the
-- `detect_stale_venues` mistake: this row is `action->>'type' = 'rpc'` with NO
-- `action.command`, so `sync_automations_to_cron()` branch (d) structurally cannot
-- reschedule or rewrite it and no reconciler pass can undo this.
--
-- ==========================================================================
-- 2. Pipeline Health: `shared mobility snapshot is 4232 min old`
-- ==========================================================================
-- The registry row is auto-paused and the nightly reconciler already unscheduled
-- it, so the overlay and every venue page have shown nothing since 2026-11-08.
-- Root cause is in the edge function (see its header): a 12 s per-attempt timeout
-- against a 7.2 MB feed measured at 8.97-21.89 s, so ~half of all runs aborted and
-- three consecutive landed on 11-08 07:50.
--
-- This migration owns only the CONFIG half: the registry is canonical, so the
-- request budget is raised in `action.command` to fit the new 25 s fetch.
--
-- RE-ENABLING THE ROW IS DELIBERATELY NOT HERE, and the reason is an ordering race
-- rather than tidiness. `db push` and `deploy-supabase-functions` both run on the
-- same push to main with no guaranteed order, so a migration that re-enables could
-- hand the job back while the OLD 12 s function is still deployed -- ~50% failure,
-- three consecutive inside fifteen minutes, auto-paused again, and the reconciler
-- unschedules it that night. So the row is re-enabled live, AFTER the fixed
-- function is deployed and probed, and the reschedule must be built from
-- `admin_automation_effective_command()` -- never the raw command, which posts
-- through `net.http_post` directly and gives a job that works and records no runs.

-- --------------------------------------------------------------------------
-- 1a. Compute the city profile once per run.
-- --------------------------------------------------------------------------
-- Patched out of the live definition with exactly-once anchors rather than
-- restated: the body is 3,953 characters and only three fragments change, so a
-- full rewrite would be a needless collision surface (99991790719601's rule).
do $patch$
declare
  v_src text := pg_get_functiondef('public.run_city_quality_issue_sync(integer)'::regprocedure);
  v_anchor text := E'  with actionable as (';
  v_materialise text := E'  -- ONE profile computation per run. It used to be computed three times\n'
    || E'  -- (actionable, current_quality, and again inside _city_quality_scorecard) at\n'
    || E'  -- ~35 s each, i.e. ~105 s against pg_cron''s 120 s clock, which is what froze\n'
    || E'  -- the snapshot the Data Quality gate reads. Dropped first so a second call in\n'
    || E'  -- one transaction cannot raise 42P07; on commit drop because the cron runs this\n'
    || E'  -- inside its own transaction.\n'
    || E'  drop table if exists pg_temp._cq_profile;\n'
    || E'  create temp table _cq_profile on commit drop as\n'
    || E'    select id, name, slug, seo_indexable, publication_ready, issue_codes, blockers\n'
    || E'    from public._city_quality_full_profile();\n'
    || E'  -- Without stats the planner assumes 1,000 rows (the EXPLAIN default for a\n'
    || E'  -- function scan) against the real 18,965 and can pick a bad anti-join.\n'
    || E'  analyze _cq_profile;\n\n';
  v_from_profile text := E'    from public._city_quality_full_profile() q\n';
  v_from_temp text := E'    from pg_temp._cq_profile q\n';
  v_current_profile text := 'with current_quality as materialized (select id, issue_codes from public._city_quality_full_profile())';
  v_current_temp text := 'with current_quality as materialized (select id, issue_codes from pg_temp._cq_profile)';
begin
  -- Soft on preconditions: if the body has already been patched, say so and stop.
  if position(v_current_temp in v_src) > 0 then
    raise notice 'run_city_quality_issue_sync already reads pg_temp._cq_profile — nothing to patch';
    return;
  end if;

  if (select count(*) from regexp_matches(v_src, '_city_quality_full_profile', 'g')) <> 2 then
    raise exception 'expected exactly 2 _city_quality_full_profile() calls in the body, found %',
      (select count(*) from regexp_matches(v_src, '_city_quality_full_profile', 'g'));
  end if;
  if position(v_anchor in v_src) = 0 or position(v_from_profile in v_src) = 0
     or position(v_current_profile in v_src) = 0 then
    raise exception 'anchor missing — run_city_quality_issue_sync was rewritten; re-derive the patch';
  end if;

  v_src := replace(v_src, v_from_profile, v_from_temp);
  v_src := replace(v_src, v_current_profile, v_current_temp);
  v_src := replace(v_src, v_anchor, v_materialise || v_anchor);
  execute v_src;
end
$patch$;

-- --------------------------------------------------------------------------
-- 1b. Make the 300 s budget effective by putting it in the cron command.
-- --------------------------------------------------------------------------
do $cron$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'city_quality_issue_sync';
  if v_jobid is null then
    raise notice 'city_quality_issue_sync has no cron.job row — scheduling it';
    perform cron.schedule('city_quality_issue_sync', '20 4 * * *',
      $cmd$set statement_timeout = '300s'; select public.run_city_quality_issue_sync(10000);$cmd$);
  else
    perform cron.alter_job(v_jobid,
      command := $cmd$set statement_timeout = '300s'; select public.run_city_quality_issue_sync(10000);$cmd$);
  end if;
end
$cron$;

-- --------------------------------------------------------------------------
-- 2a. Raise the shared-mobility request budget to fit the measured feed.
-- --------------------------------------------------------------------------
-- 25 s fetch + aggregation + write needs more than the 30 s that was registered
-- when the feed was fast; 50 s stays inside pg_net's ~55 s ceiling.
update public.admin_automations
set action = jsonb_set(action, '{command}',
      to_jsonb(replace(action->>'command', 'timeout_milliseconds := 30000',
                                           'timeout_milliseconds := 50000')))
where slug = 'shared_mobility_refresh'
  and action->>'command' like '%timeout_milliseconds := 30000%';

-- ==========================================================================
-- Postconditions. END STATE only, and deliberately NOT a source-text assertion
-- on anything this file does not itself write: 20810101100100 aborted db push for
-- the whole repo by encoding one PHRASING of a condition a later rewrite preserved
-- differently.
-- ==========================================================================
do $verify$
declare
  v_src text := pg_get_functiondef('public.run_city_quality_issue_sync(integer)'::regprocedure);
  v_profile_calls integer;
  v_cmd text;
  v_sm record;
begin
  -- P1: the job computes the profile once and both consumers read the temp table.
  v_profile_calls := (select count(*) from regexp_matches(v_src, '_city_quality_full_profile', 'g'));
  if v_profile_calls <> 1 then
    raise exception 'P1 failed: expected 1 _city_quality_full_profile() call in the job, found %', v_profile_calls;
  end if;
  if (select count(*) from regexp_matches(v_src, 'pg_temp\._cq_profile', 'g')) < 3 then
    raise exception 'P1 failed: the materialised profile is not read by both consumers';
  end if;

  -- P2: the city cron carries the timeout as its own statement, ahead of the call,
  -- and still runs on its own schedule. Verified LIVE rather than assumed from the
  -- alter_job call above.
  select command into v_cmd from cron.job
   where jobname = 'city_quality_issue_sync' and active and schedule = '20 4 * * *';
  if v_cmd is null then
    raise exception 'P2 failed: city_quality_issue_sync is not active on 20 4 * * *';
  end if;
  if position('statement_timeout' in v_cmd) = 0
     or position('statement_timeout' in v_cmd) > position('run_city_quality_issue_sync' in v_cmd) then
    raise exception 'P2 failed: the timeout is missing or does not precede the call: %', v_cmd;
  end if;

  -- P3: the shared-mobility request budget is raised in the canonical registry
  -- command. Scheduling is NOT asserted: this file deliberately leaves the row
  -- disabled (see the header), so requiring an active cron here would fail on
  -- correct code. What IS asserted is that whatever is scheduled -- now or by the
  -- nightly reconciler -- would be wrapped, because an unwrapped command gives a
  -- job that works and records no runs.
  select a.action->>'command' as cmd,
         public.admin_automation_effective_command(a.slug, a.action->>'command') as eff
  into v_sm
  from public.admin_automations a where a.slug = 'shared_mobility_refresh';

  if v_sm.cmd is null then
    raise exception 'P3 failed: shared_mobility_refresh has no registry command';
  end if;
  if position('timeout_milliseconds := 50000' in v_sm.cmd) = 0 then
    raise exception 'P3 failed: the registry command still carries the old request budget';
  end if;
  if position('automation_http_post' in v_sm.eff) = 0
     or position('admin_automation_run_begin' in v_sm.eff) = 0 then
    raise exception 'P3 failed: the effective command is unwrapped and would record no runs';
  end if;
  if position('timeout_milliseconds := 50000' in v_sm.eff) = 0 then
    raise exception 'P3 failed: the effective command dropped the raised budget';
  end if;

  raise notice 'P1-P3 pass: profile computed once, city cron timeout effective, shared-mobility budget raised';
end
$verify$;
