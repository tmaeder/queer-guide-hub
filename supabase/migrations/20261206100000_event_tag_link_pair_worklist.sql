-- run_event_tag_link: resume by MISSING PAIR, not by "event has no assignment".
--
-- 20260927100000 shipped the job with an event-level work-list:
--
--   where not exists (select 1 from unified_tag_assignments a
--                      where a.entity_id = e.id and a.entity_type = 'event')
--   order by e.id limit p_batch
--
-- An event with ANY event-type assignment is never looked at again. That has two
-- consequences, and BOTH are live on prod. Measured 2026-09-02.
--
-- ## 1. The drain is wedged, and has been for ~1,100 runs
--
-- 3,855 of the unlinked events resolve to NOTHING — overwhelmingly events whose
-- only tag is `pride`, which is one of the 14 ambiguous keys the guard blocks on
-- purpose (it matches both news-pride and occ-pride). They produce no links, so
-- they are never removed from the work-list, so they accumulate at the head of
-- `order by e.id` forever.
--
-- Once 2,000 of them had piled up below the cursor, the batch filled entirely
-- with events that cannot produce a link, and the drain stopped dead:
--
--   next batch's high-water id          81081c8f-f0f1-4c0e-8081-eeca6b6df5c2
--   first LINKABLE unlinked id          81178f9c-2dc7-4e06-9ef3-481c4dabf4af  (just above it)
--   links the next tick would create    0
--   dead events below the watermark     1,999 of 2,000
--   already-linked below wall / above   15,553 / 9
--
-- 15,553 linked below the wall against 9 above is the drain's own footprint: it
-- marched from uuid 0x00 to 0x81, then hit the wall of unresolvable events and
-- has produced nothing from the backlog since. 16,802 events / 41,748 pairs are
-- stranded above it.
--
-- It did not LOOK stuck — cron.job_run_details shows 1,106 runs, 1,106 succeeded,
-- and ~250 new links a day. Those links are all newly-ingested events that happen
-- to get a uuid below the wall (~52% of them, since the wall sits near the middle
-- of the uuid space). A green run history and a nonzero link rate were both true
-- and both misleading.
--
-- ## 2. The vocabulary grows, so a partial first pass is permanent
--
-- An event processed when only some of its strings resolved is frozen at that
-- partial set, because it now has an assignment and is never revisited. 1,488
-- already-linked events are missing 9,393 links that today's vocabulary resolves.
--
-- ## The fix: make the work-list the pairs, not the events
--
-- Both failures are the same defect — "has at least one assignment" is a proxy
-- for "is done", and it is wrong in both directions. The honest work-list is the
-- set of (event, tag) pairs that resolve today and have no row yet.
--
-- That list is SELF-CONSUMING: inserting the pair is what removes it. So it needs
-- no cursor, no watermark against unified_tags growth, and no scan marker — and
-- critically no new column on `events`, which is what the original design was
-- protecting (every write there costs a search reindex, 13.8s per 300 rows).
-- An event that resolves to nothing simply never enters the list, so no wall can
-- form; a vocabulary addition makes its pairs appear on the next tick.
--
-- Cost, measured on prod at full corpus size: map build 58ms, and the full
-- pair-level anti-join over all 81,845 candidate pairs — the steady state, where
-- it must scan everything to prove there is no work — 357ms. The current job
-- already averages 761ms per run. This is not a regression.
--
-- `p_batch` now bounds PAIRS rather than events. That is the unit that actually
-- bounds the cost (the INSERT and the recount), and it is what the cron's 2000
-- should have been measuring all along. `events_scanned` keeps its meaning:
-- distinct events represented in the batch.
--
-- ## Also fixed: the job was corrupting usage_count every night
--
-- It called `recount_unified_tag_usage_for(ids)`, which recomputes usage_count by
-- counting slug strings in exactly three arrays — venues.tags, news_articles.tags,
-- personalities.tags. It does not read `unified_tag_assignments` and it does not
-- read `events` at all. But usage_count IS the assignment count: the nightly
-- `recount_all_tag_usage` (cron recount_tag_usage, 04:20) maintains it that way,
-- and stored == assignment count exactly for every tag sampled.
--
-- So the one job whose entire purpose is creating event assignments finished each
-- batch by overwriting usage_count with a number that excludes events. From
-- tag_change_log, actor 'job:event_tag_link': 181 usage_count rewrites, 167 of
-- them decreases, every night at ~03:30 when the ingest lands, left wrong until
-- the 04:20 repair:
--
--   queer  7,328 -> 2,804        party  3,424 -> 26        lgbtq  3,699 -> 4
--
-- Fixing the work-list makes this strictly worse if left alone (more batches
-- create links, so more batches corrupt), so it is fixed here: the recount is
-- scoped to the touched tags AND counts assignments, matching the nightly job.
-- The `is distinct from` guard keeps no-op rows from firing the audit + search
-- triggers on unified_tags, which is why the original bounded it in the first
-- place.
--
-- ## Deliberately NOT changed here: tag_hygiene_stats()
--
-- Its `events_with_tags_unlinked` counter says "drains to 0 as the cron works
-- through the backlog; non-zero after that means the job stopped running". It can
-- never reach 0 — the 3,855 unresolvable events are unlinkable by design — so the
-- sentinel is permanently red and cannot distinguish "wedged" from "normal". That
-- is precisely why this sat for 1,100 runs. The honest counter is unlinked
-- PAIRS, which does drain to 0.
--
-- It is not changed in this migration because the function must be restated in
-- full to touch one key, and branch `claude/tag-language-normalization-27e39c`
-- has an unmerged committed migration (20261203100300_tag_hygiene_language_sentinels)
-- that restates it. Two branches doing that do not conflict in git and the second
-- to merge silently drops the other's keys. The cron remains observable through
-- admin_automations / admin_automation_project_cron_runs() meanwhile.

create or replace function public.run_event_tag_link(p_batch int default 2000)
returns table (events_scanned int, links_created int, ambiguous_keys int, tags_recounted int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_scanned int := 0; v_created int := 0; v_amb int := 0; v_recount int := 0;
  v_tag_ids uuid[];
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'job:event_tag_link', true);

  -- `on commit drop` drops these at COMMIT, not at function exit, so a second
  -- call inside one transaction hits 42P07. The seed block below loops in a
  -- single transaction, so this is load-bearing exactly when there is a backlog.
  drop table if exists _raw, _amb, _map, _todo;

  -- Small side, built once. `distinct` because a tag whose slug and name
  -- normalize to the same string would otherwise appear twice.
  create temp table _raw on commit drop as
    select lower(btrim(k)) as key, u.id as tag_id
      from unified_tags u, lateral (values (u.slug), (u.name)) v(k)
     where u.status = 'active' and u.merged_into_id is null and btrim(k) <> '';

  create temp table _amb on commit drop as
    select key from _raw group by key having count(distinct tag_id) > 1;
  select count(*) into v_amb from _amb;

  create temp table _map on commit drop as
    select distinct r.key, r.tag_id from _raw r
     where not exists (select 1 from _amb a where a.key = r.key);
  create index on _map(key);
  analyze _map;

  -- The work-list is the MISSING PAIRS, not the unprocessed events. Inserting a
  -- pair is what removes it from this list, so the list is its own cursor: no
  -- watermark, no scan marker, and no column on `events`. An event whose strings
  -- all resolve to nothing (or only to ambiguous keys) contributes no rows at
  -- all, so it can never accumulate into a wall the way it did under the
  -- event-level anti-join.
  create temp table _todo on commit drop as
    select w.entity_id, w.tag_id
      from (
        select distinct e.id as entity_id, m.tag_id
          from events e
          cross join lateral unnest(e.tags) as t
          join _map m on m.key = lower(btrim(t))
         where coalesce(array_length(e.tags, 1), 0) > 0
      ) w
     where not exists (
       select 1 from unified_tag_assignments a
        where a.entity_id = w.entity_id
          and a.tag_id = w.tag_id
          and a.entity_type = 'event')
     order by w.entity_id, w.tag_id
     limit greatest(p_batch, 0);

  select count(distinct entity_id) into v_scanned from _todo;
  if v_scanned = 0 then
    events_scanned := 0; links_created := 0; ambiguous_keys := v_amb; tags_recounted := 0;
    return next; return;
  end if;

  with ins as (
    insert into unified_tag_assignments (tag_id, entity_id, entity_type)
    select d.tag_id, d.entity_id, 'event' from _todo d
    on conflict (tag_id, entity_id, entity_type) do nothing
    returning tag_id
  )
  select count(*)::int, array_agg(distinct tag_id) into v_created, v_tag_ids from ins;

  -- usage_count is the ASSIGNMENT count — same quantity the nightly
  -- recount_all_tag_usage maintains. `recount_unified_tag_usage_for` computes a
  -- different, lossier number (three arrays, no events) and was overwriting this
  -- column with it on every batch. Bounded to the tags this batch touched, and
  -- skipping rows whose value would not change, so the audit + search triggers on
  -- unified_tags only fire where there is a real delta.
  if v_tag_ids is not null and array_length(v_tag_ids, 1) > 0 then
    update unified_tags u
       set usage_count = coalesce(
             (select count(*)::int from unified_tag_assignments a where a.tag_id = u.id), 0),
           updated_at = now()
     where u.id = any(v_tag_ids)
       and u.usage_count is distinct from coalesce(
             (select count(*)::int from unified_tag_assignments a where a.tag_id = u.id), 0);
    get diagnostics v_recount = row_count;
  end if;

  events_scanned := v_scanned; links_created := coalesce(v_created, 0);
  ambiguous_keys := v_amb; tags_recounted := v_recount;
  return next;
end;
$fn$;

comment on function public.run_event_tag_link(int) is
  'Links events.tags[] free text to unified_tag_assignments where the string resolves EXACTLY to one active canonical tag. Ambiguous keys (pride -> news-pride/occ-pride, leather -> leather/mat-leather, ...) are blocked, never guessed. Resumes by MISSING PAIR, not by absence of an assignment: the work-list is self-consuming, so events that resolve to nothing cannot pile up into a wall, and vocabulary added later is picked up on the next tick. p_batch bounds PAIRS. Adds no column to events, because writes there cost a search reindex.';

revoke all on function public.run_event_tag_link(int) from public, anon;
grant execute on function public.run_event_tag_link(int) to authenticated, service_role;

update public.admin_automations
   set description = 'Every 10 min: links events.tags[] strings that resolve to exactly one active canonical tag into unified_tag_assignments. Ambiguous keys are blocked. Resumes by missing (event, tag) pair, so unresolvable events cannot wedge the drain and later vocabulary additions are backfilled. p_batch bounds pairs.'
 where slug = 'event_tag_link';

-- Recover the 51,141 stranded pairs. Bounded so the migration cannot run long;
-- the */10 cron finishes the rest (~35k pairs, a few hours). Each pass is one
-- full-corpus anti-join (~360ms) plus a bounded insert and recount.
do $$
declare r record; i int := 0; v_ev int := 0; v_ln int := 0;
begin
  loop
    i := i + 1;
    select * into r from public.run_event_tag_link(2000);
    v_ev := v_ev + r.events_scanned; v_ln := v_ln + r.links_created;
    exit when r.links_created = 0 or i >= 8;
  end loop;
  raise notice 'event tag link (pair work-list) seed: % events touched, % links created over % pass(es)', v_ev, v_ln, i;
end $$;
