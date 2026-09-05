-- Re-enable venue_geocode_repair on a Nominatim-polite schedule.
--
-- MOVED HERE FROM 20270501174243 (which is now a no-op tombstone explaining why).
-- DO NOT MOVE IT BACK, and read this before adding anything that must run earlier.
--
-- At its original version this file sorted BEFORE
-- 20270601100100_restore_falsely_paused_enrichment, and the two deadlocked
-- `supabase db push` for the whole repo from 2026-09-05 08:46Z: eight merged
-- migrations never applied while edge functions kept deploying, so prod ran new
-- code against the old schema. NEITHER MIGRATION IS WRONG — the ORDER was.
--
--   1. This file calls sync_automations_to_cron(true), whose branch (b)
--      unschedules every DISABLED registry row. `marketplace_image_mirror` was
--      disabled (falsely auto-paused) but still carried a live cron.job, so the
--      sync killed it and the guard below correctly refused:
--        ERROR: sync_automations_to_cron(true) unscheduled jobs as a side effect
--        of re-enabling venue_geocode_repair: ["marketplace_image_mirror"]
--      That guard found a real inconsistency. It is untouched.
--
--   2. The migration that REPAIRS that exact row is 20270601100100, which sorted
--      later and so could never run. It also asserts `venue_geocode_repair` is
--      still disabled (its `k_stay_off` list) — so even once (1) was past, this
--      file running first would have aborted 20270601100100 in turn. A mutual
--      deadlock, not one bad migration.
--
-- Ordering this after 20270601100100 satisfies both: the restore re-enables
-- marketplace_image_mirror first, so the sync here has nothing to kill; and
-- venue_geocode_repair is still disabled when the restore asserts it, so its
-- stay-off list holds. No guard relaxed, no logic changed — only the filename.
-- The original version is left in place as a no-op rather than renamed, so the
-- pre-push drift guard stays armed: it cannot read remote history and so treats
-- every merged version as applied. That inference is false here (db push aborted
-- inside this migration's transaction on three consecutive runs, each of which
-- re-attempted it), but weakening a drift guard to move a migration is not a
-- trade worth making.
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

  if not found then
    raise exception 'admin_automations row venue_geocode_repair is missing — nothing to re-enable';
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

  -- Nothing about re-enabling one row should unschedule another. If this call
  -- killed anything, a registry row was disabled without its cron being
  -- retired and this migration is not the place to discover that.
  if jsonb_array_length(v_killed) > 0 then
    raise exception
      'sync_automations_to_cron(true) unscheduled jobs as a side effect of re-enabling venue_geocode_repair: %',
      v_killed;
  end if;

  select exists (select 1 from cron.job where jobname = 'venue_geocode_repair')
    into v_exists;

  if not v_exists then
    raise exception
      'venue_geocode_repair is enabled but has no cron.job row after sync_automations_to_cron(true). recreated=%, full=%',
      v_recreated, v_sync;
  end if;

  -- Belt and braces: the reconciler creates a missing job but does not
  -- necessarily correct the schedule of one it just made from a stale value.
  -- Assert the live schedule is the polite one, not the per-minute original.
  if not exists (
    select 1 from cron.job
     where jobname = 'venue_geocode_repair' and schedule = '5,25,45 * * * *'
  ) then
    raise exception 'venue_geocode_repair scheduled with the wrong cadence: %',
      (select schedule from cron.job where jobname = 'venue_geocode_repair');
  end if;

  raise notice 'venue_geocode_repair re-enabled at 5,25,45 * * * *; sync recreated=%', v_recreated;
end
$reenable$;
