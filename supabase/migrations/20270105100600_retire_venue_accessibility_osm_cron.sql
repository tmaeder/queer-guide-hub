-- Retire the `venue_accessibility_osm` cron. The edge function stays; only the
-- every-20-minutes schedule goes.
--
-- WHY, measured on prod 2026-09-03 rather than reasoned:
--
--   enrichment_status->'osm_accessibility' over the 916 venues it has ever
--   probed:
--       none        741  (81%)   Overpass answered; no name match within 60 m
--       unknown/busy 137  (15%)   both mirrors busy
--       found         25  (2.7%)
--       ambiguous      7          correctly blocked, wrote nothing
--       unknown/error  6
--
--   So the per-venue matcher resolves 2.7%, and has contributed 25 of the 31
--   venues that carry any accessibility value at all — against 26,876 that do
--   not. Meanwhile it spends 72 fires/day and two Overpass probes per fire.
--   Today it spent eight straight hours at HTTP 504 (~152 s per attempt, one
--   200 in the window) and is currently recording `upstream_busy` with
--   processed: 0.
--
-- The 2.7% is NOT an argument that OSM lacks the data — it is an argument that
-- asking Overpass one venue at a time, matching on exact name inside 60 m, is
-- the wrong shape. The replacement is a bulk regional-extract join that matches
-- once and PERSISTS the OSM element id into `venue_sources`, so later runs are
-- id lookups instead of repeated name guesses. Note what today's code does with
-- identity it has already established: `venue-accessibility-osm` resolves
-- `pick.element.type/id`, uses it, and never writes it back anywhere the
-- selector can read — which is why 916 probes produced no durable identity at
-- all and every pass starts over.
--
-- RETIRING A CRON MEANS RETIRING THE REGISTRY ROW (pattern 20260813100000):
-- `cron.unschedule` alone is undone by the next `sync_automations_to_cron()`
-- pass, whose branch (d) recreates any enabled row carrying an action.command.
-- The row here is already `enabled = false` — but from AUTO-PAUSE, not from a
-- decision, and those are indistinguishable by column value. That ambiguity is
-- the documented trap ("the pause deletes the proof it happened"), so this
-- migration records the intent in `description` where a human and
-- check-pipeline-health can both read it.
--
-- Not deleted: branch (b) unschedules any job whose registry row is disabled,
-- which makes a disabled row a durable kill switch. A DELETE would instead make
-- the live job "unregistered", which branch (a) reports and never auto-kills.

update public.admin_automations
set enabled = false,
    description = coalesce(description, '')
      || ' [RETIRED 2026-09-03 (20270105100600): the per-venue Overpass matcher resolved'
      || ' 2.7% of 916 probes (25 venues) and never persisted the OSM element id it'
      || ' resolved, so every pass re-derived identity by name. Superseded by the bulk'
      || ' regional-extract join, which matches once and writes the ref into venue_sources.'
      || ' The edge function is retained for that rewrite; only the schedule is retired.'
      || ' Kept disabled rather than deleted so sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'venue_accessibility_osm';

-- Unschedule now rather than waiting for the 05:10 reconciler: at */20 that is
-- ~36 more fires, each of them two Overpass probes for a job we have decided
-- should not run.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'venue_accessibility_osm') then
    perform cron.unschedule('venue_accessibility_osm');
  end if;
end $$;

-- Assert, in this transaction, the two things that are easy to believe and
-- wrong: that the UPDATE matched, and that the job is actually gone. A
-- cron.schedule/unschedule inside a migration has silently not taken before
-- (20260820191944), which is why this is checked rather than assumed.
do $$
declare
  v_enabled boolean;
  v_marked  boolean;
  v_jobs    integer;
begin
  select enabled, description like '%[RETIRED 2026-09-03 (20270105100600)%'
    into v_enabled, v_marked
  from public.admin_automations
  where slug = 'venue_accessibility_osm';

  if v_enabled is null then
    raise exception 'venue_accessibility_osm has no admin_automations row — expected to disable it, not to find it missing';
  end if;
  if v_enabled then
    raise exception 'venue_accessibility_osm is still enabled after the UPDATE';
  end if;
  if not v_marked then
    raise exception 'venue_accessibility_osm was not stamped with the retirement marker; check-pipeline-health reads it';
  end if;

  select count(*) into v_jobs from cron.job where jobname = 'venue_accessibility_osm';
  if v_jobs <> 0 then
    raise exception 'venue_accessibility_osm cron job still present (% row(s))', v_jobs;
  end if;
end $$;
