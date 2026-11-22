-- Festival programmes: stop recurring venue nights acting as umbrellas,
-- record who set each link, and keep a child count on the umbrella.
--
-- Design: docs/plans/2026-11-22-festival-multi-event-structure-design.md (Phase 1, items 1 + 3).
--
-- Measured on prod 2026-11-22: 149 umbrellas held 214 children, and 68 of the
-- umbrellas (88 children) were not festivals. They are a venue's standing
-- night stored as ONE row whose span runs for years ("Ouvert 18h-2h"
-- 2025-07-01 -> 2027-07-01, "Friday fuck" 2023 -> 2026), carrying
-- schedule.kind = 'recurrence'. run_event_programme_link() had a lower span
-- bound (>= 20h) and no upper one, so any single dated event at that venue's
-- city sharing two title tokens became its "programme".
--
-- The discriminator is structural, not a threshold: 87 of the 88 sit under a
-- parent whose schedule kind is 'recurrence'. The 88th is "Whole Festival"
-- (gaycities, 2025-07-21 -> 2027-08-02, no schedule), a cross-year BRAND row
-- holding its own 2027 edition as a child — the brand/edition confusion the
-- festivals table (Phase 3) exists for. The 62-day backstop catches it; real
-- umbrellas measured top out at 34 days (St Louis Mardi Gras) with one 61-day
-- film season (Lola Film Festival), both kept.
--
-- Unlinking only REMOVES a claim and is stamped on the child, so it is
-- reversible from the row; a child may legitimately relink to a real umbrella
-- on the next linker pass.

-- ---------------------------------------------------------------------------
-- 1. programme_size: live child count on the umbrella (NULL = not an umbrella)
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists programme_size integer;

comment on column public.events.programme_size is
  'Number of non-merged events whose parent_event_id is this row. NULL when none. '
  'Maintained by trg_events_programme_size; read by the feed card ("14 events").';

create or replace function public.events_programme_size_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.parent_event_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.parent_event_id];
  else
    v_ids := array[old.parent_event_id, new.parent_event_id];
  end if;

  update public.events p
     set programme_size = k.n
    from (select u.id,
                 nullif((select count(*)::integer from public.events c
                          where c.parent_event_id = u.id
                            and c.duplicate_of_id is null), 0) as n
            from unnest(v_ids) as u(id)
           where u.id is not null) k
   where p.id = k.id
     and p.programme_size is distinct from k.n;

  return null;
end;
$function$;

drop trigger if exists trg_events_programme_size on public.events;
create trigger trg_events_programme_size
  after insert or delete or update of parent_event_id, duplicate_of_id on public.events
  for each row execute function public.events_programme_size_sync();

-- ---------------------------------------------------------------------------
-- 2. Provenance: every change of parent_event_id records its source
--    Writers set app.programme_link_source; anything unset is 'manual'
--    (the admin Programme panel writes through PostgREST).
-- ---------------------------------------------------------------------------
create or replace function public.events_programme_link_provenance()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' and new.parent_event_id is not distinct from old.parent_event_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.parent_event_id is null then
    return new;
  end if;

  new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb)
    || jsonb_build_object('parent_event_id', jsonb_build_object(
         'source', coalesce(nullif(current_setting('app.programme_link_source', true), ''), 'manual'),
         'value',  new.parent_event_id,
         'at',     now()));
  return new;
end;
$function$;

drop trigger if exists trg_events_programme_link_provenance on public.events;
create trigger trg_events_programme_link_provenance
  before insert or update of parent_event_id on public.events
  for each row execute function public.events_programme_link_provenance();

-- ---------------------------------------------------------------------------
-- 3. Linker: an umbrella is a bounded event, never a standing schedule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_event_programme_link(p_batch integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linked integer := 0;
  v_ambiguous integer := 0;
begin
  perform set_config('app.programme_link_source', 'linker', true);

  with live as (
    select e.id, e.start_date, coalesce(e.end_date, e.start_date) as end_date,
           e.city_id, e.parent_event_id,
           -- A row describing a venue's standing night (opening hours or a
           -- recurrence) spans months or years but is not a festival.
           coalesce(e.schedule->>'kind', '') in ('recurrence', 'opening_hours') as is_standing,
           public.dedup_core_tokens(e.title) as toks,
           coalesce(public.dedup_core_tokens(ci.name), '{}'::text[])
             || coalesce(public.dedup_core_tokens(e.city), '{}'::text[]) as city_toks
    from public.events e
    left join public.cities ci on ci.id = e.city_id
    where e.duplicate_of_id is null
      and e.status = 'active'
      and e.city_id is not null
      and e.title is not null
  ),
  cand as (
    select c.id as child_id, p.id as parent_id
    from live p
    join live c
      on c.id <> p.id
     and c.city_id = p.city_id
     -- The umbrella spans more than a day and strictly contains the child. The 6h
     -- slack absorbs a child whose end is stamped just past midnight.
     and p.end_date - p.start_date >= interval '20 hours'
     -- ...and is a bounded event: no festival measured runs past 62 days.
     and p.end_date - p.start_date <= interval '62 days'
     and not p.is_standing
     -- A child is a PART of the umbrella. A row spanning half or more of it, or
     -- whose title adds no word beyond the umbrella's own (years and city words
     -- aside), is the same festival listed twice: "Atlanta Pride 2027" under
     -- "Atlanta Pride 2027", "Denver Pride 2027" under "Denver Pride Weekend 2027".
     -- Measured over the 126 links that survive section 4: these two tests veto
     -- 50, and ~46 of the 50 read as duplicates by hand. Duplicates belong to the
     -- dedup queue, not to a programme.
     and c.end_date - c.start_date < 0.5 * (p.end_date - p.start_date)
     and cardinality(
           array(select t from unnest(c.toks) t where t !~ '^\d{4}$'
                 except select unnest(p.toks)
                 except select unnest(p.city_toks))
         ) >= 1
     and c.start_date >= p.start_date
     and c.end_date <= p.end_date + interval '6 hours'
    where c.parent_event_id is null
      -- The parent must itself be top-level, and the child must not already be a
      -- parent: events_programme_depth_guard() rejects a two-level chain, so
      -- building one here would raise rather than link.
      and p.parent_event_id is null
      and not exists (select 1 from public.events x where x.parent_event_id = c.id)
      and cardinality(
            array(select unnest(p.toks) intersect select unnest(c.toks)
                  except select unnest(p.city_toks))
          ) >= 2
  ),
  grouped as (
    -- `min(uuid)` does not exist in Postgres — hence array_agg.
    select child_id,
           count(distinct parent_id) as n_parents,
           (array_agg(parent_id order by parent_id))[1] as parent_id
    from cand
    group by child_id
  ),
  picked as (
    -- Two candidate umbrellas means we cannot tell which one owns the child, and a
    -- wrong parent is not self-correcting. Block rather than guess.
    select g.child_id, g.parent_id from grouped g
    where g.n_parents = 1
      and not exists (select 1 from cand p where p.parent_id=g.child_id)
    order by g.child_id limit greatest(0,least(p_batch,200))
  ),
  upd as (
    update public.events e
       set parent_event_id = pk.parent_id
      from picked pk
     where e.id = pk.child_id
    returning 1
  )
  select (select count(*) from upd)::integer,
         -- Reported, not silently dropped: a blocked child is work for a human, and
         -- a run that links nothing because everything is ambiguous must not read
         -- the same as a run with nothing to do.
         (select count(*) from grouped where n_parents > 1)::integer
    into v_linked, v_ambiguous;

  return jsonb_build_object('linked', v_linked, 'ambiguous', v_ambiguous);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. One-shot: unlink children of standing-schedule / over-long umbrellas
-- ---------------------------------------------------------------------------
select set_config('app.programme_link_source', 'migration:99991795346462', true);

update public.events c
   set parent_event_id = null,
       enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_programme_link', jsonb_build_object(
              'state', 'unlinked',
              'from_parent', p.id,
              'from_parent_title', p.title,
              'reason', case when coalesce(p.schedule->>'kind', '') in ('recurrence', 'opening_hours')
                             then 'umbrella_is_standing_schedule'
                             else 'umbrella_span_over_62_days' end,
              'by', 'migration:99991795346462',
              'at', now()))
  from public.events p
 where c.parent_event_id = p.id
   and (coalesce(p.schedule->>'kind', '') in ('recurrence', 'opening_hours')
        or coalesce(p.end_date, p.start_date) - p.start_date > interval '62 days');

-- Backfill programme_size for every umbrella (the trigger only covers writes from now on).
update public.events p
   set programme_size = k.n
  from (select parent_event_id as id, count(*)::integer as n
          from public.events
         where parent_event_id is not null and duplicate_of_id is null
         group by 1) k
 where p.id = k.id
   and p.programme_size is distinct from k.n;

update public.events p
   set programme_size = null
 where p.programme_size is not null
   and not exists (select 1 from public.events c
                    where c.parent_event_id = p.id and c.duplicate_of_id is null);

-- ---------------------------------------------------------------------------
-- 5. Postconditions (end state, not counts: the corpus moves)
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad integer;
  v_src text;
begin
  select count(*) into v_bad
    from public.events c join public.events p on p.id = c.parent_event_id
   where coalesce(p.schedule->>'kind', '') in ('recurrence', 'opening_hours')
      or coalesce(p.end_date, p.start_date) - p.start_date > interval '62 days';
  if v_bad <> 0 then
    raise exception 'P1 failed: % children still sit under a standing / over-62-day umbrella', v_bad;
  end if;

  select count(*) into v_bad
    from public.events p
   where p.programme_size is distinct from
         nullif((select count(*)::integer from public.events c
                  where c.parent_event_id = p.id and c.duplicate_of_id is null), 0)
     and (p.programme_size is not null
          or exists (select 1 from public.events c where c.parent_event_id = p.id));
  if v_bad <> 0 then
    raise exception 'P2 failed: % umbrellas carry a programme_size that disagrees with their children', v_bad;
  end if;

  -- Positive control: a real festival keeps its programme. Asserted only when the
  -- row exists, so a later legitimate merge/rename does not abort db push.
  select count(*) into v_bad
    from public.events p
   where p.title = 'Folsom Europe 2027' and p.duplicate_of_id is null
     and coalesce(p.programme_size, 0) = 0
     and exists (select 1 from public.events c where c.parent_event_id = p.id);
  if v_bad <> 0 then
    raise exception 'P3 failed: Folsom Europe 2027 lost its programme_size';
  end if;

  v_src := pg_get_functiondef('public.run_event_programme_link(integer)'::regprocedure);
  if position('not p.is_standing' in v_src) = 0
     or position('interval ''62 days''' in v_src) = 0
     or position('0.5 * (p.end_date - p.start_date)' in v_src) = 0 then
    raise exception 'P4 failed: linker is missing the standing-schedule / 62-day / duplicate guard';
  end if;
end
$verify$;
