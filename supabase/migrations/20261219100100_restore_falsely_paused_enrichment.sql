-- RESTORE THE ENRICHMENT JOBS THAT AUTO-PAUSE TOOK DOWN WHILE THEY WERE HEALTHY.
--
-- Measured on prod 2026-09-04. Nine automations carried the signature
-- `check-pipeline-health.mjs` hard-fails on -- enabled = false, yet
-- consecutive_failures = 0 and last_run_status = 'success'. Three of those are
-- deliberate retirements and stay off (see the bottom of this header). The rest
-- are jobs that were paused and then proved themselves healthy, and every one of
-- them had also been UNSCHEDULED: the nightly `automation_cron_sync` (05:10)
-- branch (b) removes the cron job of any disabled row, which is why all of them
-- show `cron.job` absent while their registry row survives.
--
-- WHY THEY PAUSED, AND WHY IT IS NOT THEIR FAULT. 14-day run rates:
--
--   news_fulltext_backfill      2,006 runs   16 errors   0.8%
--   marketplace_image_mirror    3,514 runs   25 errors   0.7%
--   marketplace_catalog_prune     192 runs    1 error    0.5%
--
-- These are 99%+ healthy. The failures are all the same DB-side error --
-- `canceling statement due to statement timeout` -- and, decisively, they are
-- CORRELATED: news_fulltext_backfill and marketplace_image_mirror fail at the
-- SAME minutes (2026-09-03 17:30, 09:10; 2026-08-29 12:00, 11:10), because a
-- single window of database pressure times out whichever jobs are mid-flight.
--
-- That correlation is the whole mechanism. `auto_pause_threshold` is 3, and on a
-- */5 schedule three consecutive failures is a **fifteen-minute** slow window.
-- Independent 0.7% failures would essentially never produce three in a row;
-- correlated ones do it routinely. So a transient database hiccup permanently
-- disables a job with a 99.3% success rate, and -- because the auto-pause success
-- branch resets consecutive_failures without re-enabling -- the row is then
-- indistinguishable from a deliberate retirement.
--
-- A NOTE FOR WHOEVER READS THE HEALTH CHECK NEXT. The two-bucket rule
-- ("paused-and-still-failing = warn, paused-then-recovered = hard fail") does not
-- describe an INTERMITTENT job. Such a job lands in whichever bucket its last run
-- happened to fall into. Both of these read "recovered" only because their final
-- run before the 05:10 unschedule succeeded; the underlying statement timeout is
-- still live and will pause them again. Restoring them is correct -- 0.7% is not
-- a reason to run nothing -- but the durable fix is the statement timeout, and
-- that is deliberately NOT in this migration: it is a per-function query problem,
-- not a registry problem.
--
-- city_timezone_backfill is included although it has NEVER run. It is not
-- restored on faith:
--   * its body was read -- it fills `cities.timezone` from `countries.timezone`
--     and EXCLUDES the 24 multi-timezone countries (US, CA, BR, RU, AU, ...),
--     which is exactly the rule CLAUDE.md records ("countries.timezone for US is
--     America/New_York, so a blanket fallback would mislabel every LA event");
--   * it is batch-capped at 300 and stamps `field_provenance.timezone.source =
--     'derived:country-timezone'`;
--   * its addressable set was MEASURED with the function's own predicate as a
--     plain SELECT: 243 cities. One weekly run clears the entire backlog.
-- 2,034 cities hold coordinates and no timezone; this closes 243 of them, and the
-- rest need the nearest-city path, not this one.
--
-- DELIBERATELY LEFT DISABLED, each with a reason, so a future reader does not
-- "restore" them as oversights:
--   tag_prose_pass          the LLM judge is measured unreliable -- 13 of 16
--                           retractions in its first live batch were wrong.
--   tag_relation_verify     same programme; its `broader` arm was ~29% correct
--                           across 46 proposals, at confidence 1.000.
--   ev_fill_eventbrite      the upstream endpoint is retired (20261107100000).
--   marketplace_variant_backfill  288 REAL consecutive failures. Auto-paused and
--                           still failing is the legitimate case.
--   city_cost_of_living_backfill  never run, and unlike city_timezone_backfill
--                           its body has not been reviewed here. Enabling an
--                           unverified job is the green-but-idle class this repo
--                           keeps getting bitten by. Left for a pass that checks
--                           it properly.

-- ---------------------------------------------------------------------------
-- 1. Re-enable. consecutive_failures is cleared explicitly: the auto-pause
--    trigger accumulates terminal error runs since the last terminal non-error
--    run, so a stale count would let fewer than `auto_pause_threshold` fresh
--    failures trip it again.
update public.admin_automations
set enabled = true, consecutive_failures = 0, updated_at = now()
where slug in (
  'news_fulltext_backfill',
  'marketplace_image_mirror',
  'marketplace_affiliate_backfill',
  'marketplace_catalog_prune',
  'tag_image_provenance_sync',
  'venue_geocode_repair',
  'city_timezone_backfill'
);

-- ---------------------------------------------------------------------------
-- 2. Re-schedule. The REGISTRY IS CANONICAL, so schedule and command are read
--    back out of the row rather than restated here -- a literal repeated in a
--    migration is a future drift.
--
--    Both action shapes must be handled, and this is the part that is easy to
--    get wrong: `sync_automations_to_cron()` branch (d) can only recreate a job
--    for a row that carries `action.command`. An `action.type='rpc'` row has
--    none, so the reconciler structurally CANNOT reschedule it and re-enabling
--    alone would leave it on-but-unscheduled -- enabled, invisible, and doing
--    nothing. Four of the seven are rpc rows.
do $restore$
declare
  r        record;
  v_cmd    text;
begin
  for r in
    select slug, schedule, action
    from public.admin_automations
    where slug in (
      'news_fulltext_backfill','marketplace_image_mirror','marketplace_affiliate_backfill',
      'marketplace_catalog_prune','tag_image_provenance_sync','venue_geocode_repair',
      'city_timezone_backfill')
    order by slug
  loop
    if r.action->>'type' = 'rpc' then
      -- Pure SQL, run in-process by pg_cron. Matches the shipped convention for
      -- every other rpc automation (`SELECT public.run_city_resolve_drain(50);`).
      -- Every one of these functions defaults all of its arguments, so the bare
      -- call is the whole command.
      v_cmd := format('SELECT public.%I();', r.action->>'fn');
    else
      -- net.http_post rows must carry the run-tracking wrapper, otherwise the
      -- run is never recorded and consecutive_failures can never move -- the
      -- 142-rows-with-NULL-last_run_at defect. Derive it rather than writing it
      -- out; a later sync re-derives the same string and so reports no drift.
      v_cmd := public.admin_automation_effective_command(r.slug, r.action->>'command');
    end if;

    if v_cmd is null or btrim(v_cmd) = '' then
      raise exception 'no command could be derived for %', r.slug;
    end if;

    -- Guarded unschedule then schedule: cron.unschedule throws if the job is
    -- absent, and all seven are absent right now.
    if exists (select 1 from cron.job where jobname = r.slug) then
      perform cron.unschedule(r.slug);
    end if;
    perform cron.schedule(r.slug, r.schedule, v_cmd);
  end loop;
end
$restore$;

-- ---------------------------------------------------------------------------
do $verify$
declare
  v_missing text[];
  v_off     text[];
  v_still   text[];
  v_tz      int;
begin
  -- Every row this migration touched must be enabled AND scheduled. "Enabled"
  -- alone is the exact half-fix this migration exists to avoid.
  select array_agg(a.slug order by a.slug) into v_off
  from public.admin_automations a
  where a.slug in ('news_fulltext_backfill','marketplace_image_mirror','marketplace_affiliate_backfill',
                   'marketplace_catalog_prune','tag_image_provenance_sync','venue_geocode_repair',
                   'city_timezone_backfill')
    and not a.enabled;
  if v_off is not null then
    raise exception 'these rows did not re-enable: %', v_off;
  end if;

  select array_agg(a.slug order by a.slug) into v_missing
  from public.admin_automations a
  where a.slug in ('news_fulltext_backfill','marketplace_image_mirror','marketplace_affiliate_backfill',
                   'marketplace_catalog_prune','tag_image_provenance_sync','venue_geocode_repair',
                   'city_timezone_backfill')
    and not exists (select 1 from cron.job j where j.jobname = a.slug);
  if v_missing is not null then
    raise exception 'enabled but UNSCHEDULED (the rpc-row trap): %', v_missing;
  end if;

  -- The deliberate four must still be off. If a future edit sweeps them in by
  -- widening the slug list, fail here rather than silently re-running an engine
  -- that was measured to destroy correct content.
  select array_agg(a.slug order by a.slug) into v_still
  from public.admin_automations a
  where a.slug in ('tag_prose_pass','tag_relation_verify','ev_fill_eventbrite',
                   'marketplace_variant_backfill')
    and a.enabled;
  if v_still is not null then
    raise exception 'these must stay disabled and are enabled: %', v_still;
  end if;

  -- The claim that justifies including city_timezone_backfill. If this is 0 the
  -- job is pointless; if it is huge the batch cap of 300 is the wrong shape and
  -- somebody should look before it runs weekly.
  select count(*) into v_tz
  from public.cities c join public.countries co on co.id = c.country_id
  where c.duplicate_of_id is null and c.shell_status <> 'merged'
    and c.timezone is null and co.timezone is not null and co.timezone like '%/%'
    and not (co.code = any(ARRAY['US','CA','BR','RU','AU','MX','ID','KZ','CD','CL','EC',
                                 'ES','PT','FR','NL','DK','GB','NZ','CN','MN','PF','KI','UM','AQ']));
  if v_tz = 0 then
    raise warning 'city_timezone_backfill has nothing addressable — re-check before trusting this restore';
  end if;

  raise notice 'restored 7 automations (enabled + scheduled); city_timezone_backfill addressable = %', v_tz;
end
$verify$;
