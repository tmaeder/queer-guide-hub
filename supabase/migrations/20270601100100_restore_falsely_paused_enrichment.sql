-- RESTORE THE ENRICHMENT JOBS THAT AUTO-PAUSE TOOK DOWN WHILE THEY WERE HEALTHY.
--
-- Measured on prod 2026-09-04. Eight automations carry the signature
-- `check-pipeline-health.mjs` hard-fails on -- enabled = false, yet
-- consecutive_failures = 0 and last_run_status = 'success'. THREE of them are
-- restored here. The other five are correctly off, and the reasons are recorded
-- at the bottom so nobody "fixes" them later.
--
-- The shape alone does not justify a restore, and an earlier draft of this
-- migration got that wrong: it restored SEVEN rows, on the strength of the
-- pattern plus a healthy failure rate. Four of those seven turned out to be jobs
-- that had FINISHED THEIR WORK and been switched off on purpose. The evidence
-- that separates the two cases is not the shape -- it is
-- `admin_automation_runs.summary` and the registry `description`, both of which
-- have to be read per row.
--
-- WHAT COUNTS AS EVIDENCE OF A FALSE PAUSE: an `auto_paused` marker in the run
-- history. Only two rows have one:
--
--   marketplace_image_mirror   6 auto_pause events, last 2026-09-03 17:35
--   news_fulltext_backfill     1 auto_pause event,  last 2026-09-03 17:50
--
-- 14-day rates for those two: 3,514 runs / 25 errors (0.7%) and 2,006 / 16
-- (0.8%). 99%+ healthy, and every failure is the same DB-side
-- `canceling statement due to statement timeout`. Decisively they are
-- CORRELATED -- both fail at the SAME minutes (2026-09-03 17:30, 09:10;
-- 2026-08-29 12:00, 11:10) -- because one window of database pressure times out
-- whichever jobs are mid-flight.
--
-- That correlation is the mechanism. `auto_pause_threshold` is 3, and on a */5
-- schedule three consecutive failures is a FIFTEEN-MINUTE slow window.
-- Independent 0.7% failures essentially never produce three in a row;
-- correlated ones do it routinely. So a transient hiccup permanently disables a
-- job with a 99.3% success rate -- and because the auto-pause success branch
-- resets consecutive_failures WITHOUT re-enabling, the row then reads exactly
-- like a deliberate retirement.
--
-- A NOTE FOR WHOEVER READS THE HEALTH CHECK NEXT. The two-bucket rule
-- ("paused-and-still-failing = warn, paused-then-recovered = hard fail") does not
-- describe an INTERMITTENT job: it lands in whichever bucket its last run fell
-- into. Both of these read "recovered" only because their final run before the
-- 05:10 unschedule succeeded; the statement timeout is still live and will pause
-- them again. Restoring them is right -- 0.7% is not a reason to run nothing --
-- but the durable fix is that timeout, and it is deliberately NOT here: it is a
-- per-function query problem, not a registry one.
--
-- city_timezone_backfill has NEVER run and is the third restore. Not on faith:
--   * body read -- fills `cities.timezone` from `countries.timezone` and EXCLUDES
--     the 24 multi-timezone countries (US, CA, BR, RU, AU, ...), exactly the rule
--     CLAUDE.md records ("countries.timezone for US is America/New_York, so a
--     blanket fallback would mislabel every LA event");
--   * batch-capped at 300, stamps `field_provenance.timezone.source =
--     'derived:country-timezone'`;
--   * addressable set MEASURED with the function's own predicate as a plain
--     SELECT: 243 cities. One weekly run clears the backlog.
--
-- ---------------------------------------------------------------------------
-- MEASURED AND DELIBERATELY *NOT* RESTORED. Each of these carries the
-- paused-then-recovered shape and each is correctly off. The proof is quoted so
-- the next reader does not have to re-derive it:
--
--   marketplace_affiliate_backfill
--       Its own registry description ends "Capped per run to protect the search
--       sync. DISABLE WHEN REMAINING=0." Disabled 2026-07-04. Remaining measured
--       today: fake affiliate_url copies 0, Awin cread links still in
--       external_url 0. It did its job and was switched off as instructed.
--       Re-enabling would run a no-op every 15 minutes forever.
--
--   venue_geocode_repair
--       Description begins "ONE-SHOT: re-geocodes bare-street venues...". It ran
--       once (2026-08-22) and was disabled. Its schedule is `* * * * *`, so
--       re-enabling a finished one-shot would re-run it EVERY MINUTE.
--
--       SUPERSEDED 2026-09-05, and dropped from k_stay_off below. The objection
--       above is about a finished one-shot on a per-minute schedule, and
--       20270501174243 -- applied in the same push, ahead of this file -- answers
--       both halves: it re-arms the job at `5,25,45 * * * *` (three times an hour,
--       not sixty), and the geo-validation work gave it a real backlog again, so
--       it is no longer a completed one-shot. The repair path also now refuses to
--       relocate a venue when the geocoded state disagrees with `venues.state`,
--       which was the live hazard in re-running it at all.
--
--   marketplace_catalog_prune
--       Its last two runs say it plainly:
--         06:30  {"reason":"prune_low_relevance_2026_08","archived":0,"remaining":0}
--         06:37  {"reason":"no_domain_allowlist","skipped":true}
--       Work complete, then skipping for want of config (`conditions` is `[]`),
--       then disabled. 1,744 of its 1,745 recorded runs are that vacuous success.
--
--   tag_image_provenance_sync
--       It recovers license/attribution for tag images on Wikimedia Commons.
--       There are none: `unified_tags.image_url` is NULL on all 10,214 rows, and
--       `tag_image_retirement` holds 7,143 rows. Tag images are a RETIRED
--       feature, not an empty column. Zero work exists.
--       (Corollary worth stating: do not "backfill" tag image_url either. That
--       would resurrect something deliberately removed.)
--
--   tag_prose_pass / tag_relation_verify
--       The LLM judge is measured unreliable -- 13 of 16 retractions in the prose
--       pass's first live batch were wrong, and the relation verifier's `broader`
--       arm was ~29% correct across 46 proposals at confidence 1.000.
--
--   ev_fill_eventbrite            upstream endpoint retired (20261107100000).
--   marketplace_variant_backfill  288 REAL consecutive failures -- the legitimate
--                                 paused-and-still-failing case.
--   city_cost_of_living_backfill  never run, and unlike city_timezone_backfill
--                                 its body has NOT been reviewed here. Enabling
--                                 an unverified job is the green-but-idle class
--                                 this repo keeps getting bitten by.

do $restore$
declare
  -- Declared ONCE. The previous draft repeated this list in four places, which
  -- is four chances for the scope of the enable, the reschedule and the two
  -- assertions to drift apart.
  k_restore constant text[] := array[
    'news_fulltext_backfill',
    'marketplace_image_mirror',
    'city_timezone_backfill'
  ];
  -- Slugs this migration asserts must REMAIN disabled. Every one was verified
  -- disabled on prod 2026-09-04 before being listed: an assertion that is already
  -- false aborts the migration for a reason unrelated to its purpose.
  --
  -- `tag_prose_pass` is NOT here even though the reasoning above covers it,
  -- because it is `enabled = true` on prod right now (schedule `30 3 * * *`, last
  -- run 2026-08-29). That contradicts CLAUDE.md, which states its cron is
  -- DISABLED. Resolving that is out of scope for a migration about auto-pause --
  -- and note the dangerous half was already removed at the DB layer by
  -- 20261018094000 (tag_prose_apply lost its retract branch), so an enabled cron
  -- is not the same hazard the doc describes. Flagged, not silently asserted.
  -- `venue_geocode_repair` was dropped from this list on 2026-09-05, for exactly
  -- the reason stated just above: the assertion had become false before this file
  -- could apply, so it aborted db push for a reason unrelated to its purpose --
  -- and took the rest of the queue with it, since db push stops at the first
  -- failure.
  --
  -- It is not drift. 20270501174243_reenable_venue_geocode_repair applied in the
  -- SAME push, ahead of this file, and re-enables it DELIBERATELY: its own header
  -- argues the case, it sets a schedule, and the repair path now requires the
  -- geocoded state to agree with `venues.state` before relocating a row. So a
  -- later explicit decision superseded the 09-04 snapshot; of the two statements
  -- this list is the older one.
  --
  -- Same treatment as tag_prose_pass above -- dropped from the assertion and
  -- flagged here, rather than silently asserted against a world that has moved.
  k_stay_off constant text[] := array[
    'tag_relation_verify', 'ev_fill_eventbrite',
    'marketplace_variant_backfill', 'city_cost_of_living_backfill',
    'marketplace_affiliate_backfill',
    'marketplace_catalog_prune', 'tag_image_provenance_sync'
  ];
  r         record;
  v_cmd     text;
  v_bad     text[];
  v_tz      int;
begin
  -- 1. Re-enable. consecutive_failures is cleared explicitly: the auto-pause
  --    trigger accumulates terminal error runs since the last terminal non-error
  --    run, so a stale count would let fewer than `auto_pause_threshold` fresh
  --    failures trip it again immediately.
  update public.admin_automations
  set enabled = true, consecutive_failures = 0, updated_at = now()
  where slug = any(k_restore);

  -- 2. Re-schedule. The REGISTRY IS CANONICAL, so schedule and command are read
  --    back out of the row rather than restated here.
  --
  --    Both action shapes must be handled, and this is the part that is easy to
  --    get wrong: `sync_automations_to_cron()` branch (d) can only recreate a job
  --    for a row carrying `action.command`. An `action.type='rpc'` row has none,
  --    so the reconciler structurally CANNOT reschedule it, and re-enabling alone
  --    would leave it on-but-unscheduled: enabled, invisible, doing nothing.
  for r in
    select slug, schedule, action
    from public.admin_automations
    where slug = any(k_restore)
    order by slug
  loop
    if r.action->>'type' = 'rpc' then
      -- Pure SQL, run in-process by pg_cron; matches the shipped convention
      -- (`SELECT public.run_city_resolve_drain(50);`). These functions default
      -- every argument, so the bare call is the whole command.
      v_cmd := format('SELECT public.%I();', r.action->>'fn');
    else
      -- net.http_post rows must carry the run-tracking wrapper, or the run is
      -- never recorded and consecutive_failures can never move -- the
      -- 142-rows-with-NULL-last_run_at defect. Derive it rather than writing it
      -- out, so a later sync re-derives the same string and reports no drift.
      v_cmd := public.admin_automation_effective_command(r.slug, r.action->>'command');
    end if;

    if v_cmd is null or btrim(v_cmd) = '' then
      raise exception 'no command could be derived for %', r.slug;
    end if;

    -- Guarded unschedule then schedule: cron.unschedule throws if the job is
    -- absent, and all three are absent right now.
    if exists (select 1 from cron.job where jobname = r.slug) then
      perform cron.unschedule(r.slug);
    end if;
    perform cron.schedule(r.slug, r.schedule, v_cmd);
  end loop;

  -- 3. Verify. Every restored row must be enabled AND scheduled: "enabled" alone
  --    is the exact half-fix this migration exists to avoid.
  select array_agg(a.slug order by a.slug) into v_bad
  from public.admin_automations a
  where a.slug = any(k_restore) and not a.enabled;
  if v_bad is not null then
    raise exception 'these rows did not re-enable: %', v_bad;
  end if;

  select array_agg(a.slug order by a.slug) into v_bad
  from public.admin_automations a
  where a.slug = any(k_restore)
    and not exists (select 1 from cron.job j where j.jobname = a.slug);
  if v_bad is not null then
    raise exception 'enabled but UNSCHEDULED (the rpc-row trap): %', v_bad;
  end if;

  -- The deliberate set must still be off. If a future edit widens k_restore and
  -- sweeps one of them in, fail here rather than silently resuming a finished
  -- one-shot -- or, for the two tag jobs, an engine measured to destroy correct
  -- content.
  select array_agg(a.slug order by a.slug) into v_bad
  from public.admin_automations a
  where a.slug = any(k_stay_off) and a.enabled;
  if v_bad is not null then
    raise exception 'these must stay disabled, see this migration header: %', v_bad;
  end if;

  -- The two lists must be disjoint, or the assertions above contradict.
  if exists (select 1 from unnest(k_restore) s where s = any(k_stay_off)) then
    raise exception 'a slug appears in both the restore and stay-off lists';
  end if;

  -- city_timezone_backfill is only worth scheduling if it has work, so assert the
  -- number quoted in the header rather than printing a different one.
  --
  -- This predicate MIRRORS run_city_timezone_backfill's own, including the
  -- multi-timezone country exclusion and the `co.timezone LIKE '%/%'` IANA shape
  -- test. A looser version of this query returned 2,441 -- ten times the truth --
  -- because it dropped those two filters. A justification measured with a
  -- different predicate than the function uses is not a measurement of the
  -- function.
  select count(*) into v_tz
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.duplicate_of_id is null
    and c.shell_status <> 'merged'
    and c.timezone is null
    and co.timezone is not null
    and co.timezone like '%/%'
    and not (co.code = any(array['US','CA','BR','RU','AU','MX','ID','KZ','CD','CL','EC',
                                 'ES','PT','FR','NL','DK','GB','NZ','CN','MN','PF','KI','UM','AQ']));
  if v_tz = 0 then
    raise exception 'city_timezone_backfill has no addressable work — do not schedule it';
  end if;
  raise notice 'restored % automations; city_timezone_backfill addressable: % cities',
    array_length(k_restore, 1), v_tz;
end
$restore$;
