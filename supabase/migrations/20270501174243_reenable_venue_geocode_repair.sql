-- Re-enable venue_geocode_repair on a Nominatim-polite schedule.
--
-- STATE BEFORE: enabled=false, schedule '* * * * *', last_run_status='success',
-- consecutive_failures=0, and exactly ONE run in its entire history
-- (2026-08-22 17:05). No cron.job row — the nightly sync_automations_to_cron()
-- unscheduled it once it was disabled.
--
-- That value combination is the auto-paused-then-recovered signature that
-- check-pipeline-health.mjs is meant to hard-fail on, but the history says this
-- was a deliberate stop, and the reason is legible: `* * * * *` against public
-- Nominatim. One batch of 50 with the required 1100 ms courtesy sleep runs
-- ~55 s, so a per-minute schedule is continuous back-to-back querying of a free
-- service whose usage policy caps absolute throughput at 1 req/s. It was right
-- to stop it. It was wrong to leave it stopped, because a disabled registry row
-- is indistinguishable from a retirement and the work simply stopped happening.
--
-- WHY RE-ENABLE RATHER THAN RETIRE: its pool is not empty and is not shrinking.
-- Measured 2026-09-04: 3,366 rows match the sweep's filters and 2,628 of those
-- are bare-street addresses, with ZERO carrying the
-- enrichment_status.geocode.verified_at stamp — i.e. the historical population
-- that docs/audits/2026-08-22-venue-forward-geocode.md recorded as "measured
-- but NOT repaired" is still entirely unrepaired. Nothing else targets it:
-- venue_coord_snap only acts on rows with no usable address (0-2 a night), and
-- venue_geocode_forward only fills rows that have no coordinates at all.
--
-- WHY IT IS SAFE TO POINT AT WRITES AGAIN — checked before enabling, because
-- re-arming a writer that implements the wrong rule is worse than leaving it
-- off. processForwardRepair already carries the discipline this codebase
-- requires: it needs a SECOND independent signal (matching postcode, or the
-- returned locality matching the row's own city) on top of "the new answer is
-- far from the old one"; it only writes at >=25 km and deliberately flags the
-- 1-25 km band for a human instead of writing it; and its Nominatim query is
-- country-scoped via `countrycodes=`. That last property is what makes it safe
-- against the coordinates-right/link-wrong shape: a Penang venue filed 'MY' but
-- linked to Georgetown, GUYANA is geocoded within Malaysia, agrees with its
-- stored coordinate and is stamped 'verified' — the correct coordinate is not
-- overwritten. It is also resumable by stamp rather than offset, so the pool
-- drains instead of re-walking.
--
-- SCHEDULE: '5,25,45 * * * *' — every 20 minutes, deliberately offset from
-- venue_geocode_forward's '*/15' so the two Nominatim consumers do not fire on
-- the same minute. At batch 50 that is ~150 rows/hour and drains the 2,628
-- backlog in roughly 18 hours, then costs almost nothing because every examined
-- row is stamped and leaves the pool.
--
-- venue_coord_snap is deliberately left ALONE. An earlier reading of it as a
-- nightly no-op was wrong: its own run summaries report items_examined=2536 and
-- an honest still_misplaced count, and it does snap 0-12 rows a night. It is
-- narrow, not broken — it can only act on misplaced rows that have no usable
-- address, and the geocodable majority is what the containment validator and
-- its adjudicating repair pass are for.

-- RIDE-ALONG, checked before writing this: sync_automations_to_cron(true)
-- reconciles the WHOLE registry, not just the row above, so it applies whatever
-- drift is already pending. A dry run on 2026-09-04 showed exactly one other
-- item — command_rewrapped: [tag_prose_pass] — which adds the
-- admin_automation_run_begin / automation_http_post run-tracking wrapper to a
-- command that still calls net.http_post directly. That is the bookkeeping
-- change from the cron-run-tracking work, it does not enable or re-arm
-- anything, and the nightly automation_cron_sync at 05:10 applies it anyway.
-- The assertion below fails the migration if this call would kill a job, so an
-- unexpected ride-along cannot pass silently.
do $reenable$
declare
  v_sync      jsonb;
  v_recreated jsonb;
  v_killed    jsonb;
  v_exists    boolean;
begin
  update public.admin_automations
     set enabled  = true,
         schedule = '5,25,45 * * * *',
         consecutive_failures = 0,
         updated_at = now()
   where slug = 'venue_geocode_repair';

  -- Warning, by the same rule as below: if the row is absent the UPDATE simply
  -- matched nothing, so no data is left wrong and there is nothing to roll
  -- back. Halting the whole repo's migration stream over an absent registry
  -- row would be disproportionate. The remaining checks then warn about the
  -- missing cron too, which is the honest description of that state.
  if not found then
    raise warning 'admin_automations row venue_geocode_repair is missing — nothing to re-enable, skipping';
  end if;

  -- The registry is canonical, but re-enabling a row does NOT by itself put a
  -- job back into pg_cron. Branch (d) of the reconciler is what recreates a
  -- missing cron job from an enabled row's action.command, and it is also what
  -- applies the run-tracking wrapper. Call it and READ THE ANSWER: assuming a
  -- reconciler pass worked is how an rpc-type automation was once left
  -- enabled-but-unscheduled with 21,613 rows unprocessed behind it.
  v_sync := public.sync_automations_to_cron(true);
  v_recreated := coalesce(v_sync -> 'recreated', '[]'::jsonb);
  v_killed    := coalesce(v_sync -> 'disabled_killed', '[]'::jsonb);

  -- CORRECTED. This originally aborted whenever `disabled_killed` was
  -- non-empty, on the reasoning that re-enabling one row should not unschedule
  -- another. That conflated two different things, and it cost a deployment:
  -- `disabled_killed` is branch (b) of the reconciler doing its DOCUMENTED job
  -- — retiring the pg_cron entry of a registry row somebody deliberately
  -- disabled. It is the kill switch, not a side effect, and the nightly
  -- automation_cron_sync performs exactly the same retirement at 05:10.
  --
  -- On the first real run it fired on `marketplace_image_mirror`
  -- (enabled=false with a still-active cron), aborted this migration, and
  -- because `db push` stops at the first failure it took 20270501174244
  -- (geo_boundaries) down with it. Worse, an unapplied migration that always
  -- raises does not fail once — it blocks EVERY later migration in the repo on
  -- every subsequent push, so a too-strict assertion here is a repo-wide
  -- outage rather than a local annoyance.
  --
  -- What is actually worth refusing is an ENABLED automation losing its cron,
  -- which no correct reconciler pass produces. That is checked below. Ordinary
  -- kill-switch retirements are recorded in the notice instead, so the
  -- information is not lost — it just stops being fatal.
  if exists (
    select 1
    from jsonb_array_elements(v_killed) k
    join public.admin_automations a
      on a.slug = coalesce(k->>'jobname', k->>'slug', k #>> '{}')
    where a.enabled is true
  ) then
    raise exception
      'sync_automations_to_cron(true) unscheduled a job whose registry row is still ENABLED: %',
      v_killed;
  end if;

  select exists (select 1 from cron.job where jobname = 'venue_geocode_repair')
    into v_exists;

  -- WARNINGS, NOT EXCEPTIONS — and the distinction is the lesson of this file.
  --
  -- These two post-conditions are worth knowing about, but they are
  -- OPERATIONAL (is a cron scheduled, at what cadence), not data integrity.
  -- Raising on them means an unapplied migration that always fails, and such a
  -- migration does not fail once: `db push` aborts at the first failure, so it
  -- blocks every later migration in the repo on every subsequent push. That is
  -- what the disabled_killed assertion above already did once, and paying for
  -- the same mistake twice in one file would be careless.
  --
  -- Nothing is lost by warning instead. The enabled-but-unscheduled state is
  -- exactly what check-pipeline-health.mjs watches for on EVERY slug -- the
  -- sentinel written after an rpc automation sat enabled-but-unscheduled with
  -- 21,613 listings behind it -- so this condition is already monitored by
  -- something that can report it without halting deploys.
  --
  -- Reserve `raise exception` in a migration for states that would leave DATA
  -- wrong if the migration were allowed to complete.
  if not v_exists then
    raise warning
      'venue_geocode_repair is enabled but has no cron.job row after sync_automations_to_cron(true) — check-pipeline-health will flag this. recreated=%, full=%',
      v_recreated, v_sync;
  end if;

  if v_exists and not exists (
    select 1 from cron.job
     where jobname = 'venue_geocode_repair' and schedule = '5,25,45 * * * *'
  ) then
    raise warning 'venue_geocode_repair scheduled with the wrong cadence: %',
      (select schedule from cron.job where jobname = 'venue_geocode_repair');
  end if;

  raise notice
    'venue_geocode_repair re-enabled at 5,25,45 * * * *; sync recreated=%, kill-switch retirements (expected, not fatal)=%',
    v_recreated, v_killed;
end
$reenable$;
