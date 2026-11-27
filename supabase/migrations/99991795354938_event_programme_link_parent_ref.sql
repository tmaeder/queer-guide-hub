-- Festival programmes: the linker trusts a source's own parent link first, and
-- seven festival umbrellas filed as 'other' get their real type.
--
-- Design: docs/plans/2026-11-22-festival-multi-event-structure-design.md
-- (Phase 1, items 4 and 6). Builds on 99991795346462 (umbrella guard).
--
-- 1. PARENT_REF. #5541 made the JSON-LD parsers keep a sub-event's schema.org
--    `superEvent` (or the Festival it was flattened out of) at
--    event_sources.payload->'normalized'->'metadata'->'parent_ref' = {name,url,type}.
--    A publisher saying "this party belongs to Folsom Europe" is a far stronger
--    signal than two shared title words, so a child with a ref is matched by it
--    and the title heuristic is skipped for that child.
--
--    Measured 2026-11-22: 82 rows carry a ref, all one recurring show
--    ("Travestie im Kiez Berlin", type EventSeries, ticketcorner). An EventSeries
--    is the SERIES layer (repeat dates), not a festival programme, so it is
--    refused here — this links 0 rows today and exists for the first source
--    that publishes a Festival/superEvent. Stated rather than implied.
--
--    Match: the ref's url equals the umbrella's website or ticket_url, or the
--    ref's name equals the umbrella's title once both are despaced and stripped
--    of 4-digit years ("Folsom Europe" = "Folsom Europe 2027"). Location may be
--    the same city OR within 25 km — a festival's venues are often in a
--    neighbouring municipality, which the city_id-only title arm misses. Every
--    other guard of the title arm applies unchanged (bounded umbrella, not a
--    standing schedule, child inside the span, one candidate only).
--
-- 2. RE-TYPE. Seven umbrellas with >= 2 children were typed 'other', so they
--    never appeared under the festival / pride filters. Read by hand: four are
--    Prides, three are festivals. Guarded on event_type = 'other' so a later
--    human correction is never overwritten.

CREATE OR REPLACE FUNCTION public.run_event_programme_link(p_batch integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linked integer := 0;
  v_ambiguous integer := 0;
  v_by_ref integer := 0;
begin
  perform set_config('app.programme_link_source', 'linker', true);

  with live as (
    select e.id, e.title, e.website, e.ticket_url,
           e.latitude::numeric as lat, e.longitude::numeric as lng,
           e.start_date, coalesce(e.end_date, e.start_date) as end_date,
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
  umbrella as (
    -- Every guard on the parent side, shared by both arms.
    select p.* from live p
    where p.parent_event_id is null
      and not p.is_standing
      and p.end_date - p.start_date >= interval '20 hours'
      and p.end_date - p.start_date <= interval '62 days'
  ),
  ref as (
    select distinct on (s.event_id)
           s.event_id as child_id,
           nullif(btrim(s.payload->'normalized'->'metadata'->'parent_ref'->>'url'), '') as ref_url,
           nullif(regexp_replace(public.dedup_despace(
             s.payload->'normalized'->'metadata'->'parent_ref'->>'name'), '\d{4}', '', 'g'), '') as ref_name
    from public.event_sources s
    where s.payload->'normalized'->'metadata' ? 'parent_ref'
      -- An EventSeries is a recurring show (the series layer), not a festival.
      and coalesce(s.payload->'normalized'->'metadata'->'parent_ref'->>'type', '') <> 'EventSeries'
    order by s.event_id
  ),
  cand_ref as (
    select distinct c.id as child_id, p.id as parent_id
    from ref r
    join live c on c.id = r.child_id
    join umbrella p
      on p.id <> c.id
     and (p.city_id = c.city_id
          or public.haversine_m(p.lat, p.lng, c.lat, c.lng) <= 25000)
     and c.start_date >= p.start_date
     and c.end_date <= p.end_date + interval '6 hours'
     and ((r.ref_url is not null and r.ref_url in (p.website, p.ticket_url))
          or (r.ref_name is not null
              and r.ref_name = nullif(regexp_replace(public.dedup_despace(p.title), '\d{4}', '', 'g'), '')))
    where c.parent_event_id is null
      and not exists (select 1 from public.events x where x.parent_event_id = c.id)
  ),
  cand_title as (
    select c.id as child_id, p.id as parent_id
    from umbrella p
    join live c
      on c.id <> p.id
     and c.city_id = p.city_id
     -- A child is a PART of the umbrella. A row spanning half or more of it, or
     -- whose title adds no word beyond the umbrella's own (years and city words
     -- aside), is the same festival listed twice. See 99991795346462.
     and c.end_date - c.start_date < 0.5 * (p.end_date - p.start_date)
     and cardinality(
           array(select t from unnest(c.toks) t where t !~ '^\d{4}$'
                 except select unnest(p.toks)
                 except select unnest(p.city_toks))
         ) >= 1
     and c.start_date >= p.start_date
     and c.end_date <= p.end_date + interval '6 hours'
    where c.parent_event_id is null
      and not exists (select 1 from public.events x where x.parent_event_id = c.id)
      and cardinality(
            array(select unnest(p.toks) intersect select unnest(c.toks)
                  except select unnest(p.city_toks))
          ) >= 2
      -- A child the publisher placed is decided by its ref, never by its title.
      and not exists (select 1 from cand_ref r where r.child_id = c.id)
  ),
  cand as (
    select child_id, parent_id, true as by_ref from cand_ref
    union all
    select child_id, parent_id, false from cand_title
  ),
  grouped as (
    -- `min(uuid)` does not exist in Postgres — hence array_agg.
    select child_id,
           count(distinct parent_id) as n_parents,
           (array_agg(parent_id order by parent_id))[1] as parent_id,
           bool_or(by_ref) as by_ref
    from cand
    group by child_id
  ),
  picked as (
    -- Two candidate umbrellas means we cannot tell which one owns the child, and a
    -- wrong parent is not self-correcting. Block rather than guess.
    select g.child_id, g.parent_id, g.by_ref from grouped g
    where g.n_parents = 1
      and not exists (select 1 from cand p where p.parent_id = g.child_id)
    order by g.child_id limit greatest(0, least(p_batch, 200))
  ),
  upd as (
    update public.events e
       set parent_event_id = pk.parent_id
      from picked pk
     where e.id = pk.child_id
    returning pk.by_ref
  )
  select (select count(*) from upd)::integer,
         (select count(*) from upd where by_ref)::integer,
         -- Reported, not silently dropped: a blocked child is work for a human, and
         -- a run that links nothing because everything is ambiguous must not read
         -- the same as a run with nothing to do.
         (select count(*) from grouped where n_parents > 1)::integer
    into v_linked, v_by_ref, v_ambiguous;

  return jsonb_build_object('linked', v_linked, 'linked_by_ref', v_by_ref, 'ambiguous', v_ambiguous);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Re-type seven festival umbrellas filed as 'other' (hand-read 2026-11-22)
-- ---------------------------------------------------------------------------
update public.events e
   set event_type = v.t
  from (values
    ('31ea1eb7-a913-4ed3-88ab-d57129b89bcc'::uuid, 'pride'),    -- Belfast Pride 2027
    ('8e8d048a-6eb3-4edc-bc7d-66c9d46d9be1'::uuid, 'pride'),    -- Birmingham Pride 2027
    ('357acd54-0e7a-42c7-94bf-1c89b3ccefaf'::uuid, 'pride'),    -- Leeds Pride 2027
    ('1b3cae7a-5727-4552-9ff6-299894e2c172'::uuid, 'pride'),    -- Nashville Pride Weekend 2027
    ('eda985d0-0dc1-4551-9e9d-4e6532432faa'::uuid, 'festival'), -- BeefDip Bear Week 2027
    ('776165ad-9e33-4865-ab01-9abcc6ebab58'::uuid, 'festival'), -- Holly Folly 2026
    ('56971640-c849-4167-a989-8c4223fd1281'::uuid, 'festival')  -- Fantasy Fest
  ) as v(id, t)
 where e.id = v.id
   and e.event_type = 'other';

-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src text;
  v_bad integer;
begin
  v_src := pg_get_functiondef('public.run_event_programme_link(integer)'::regprocedure);
  if position('not p.is_standing' in v_src) = 0
     or position('0.5 * (p.end_date - p.start_date)' in v_src) = 0
     or position('<> ''EventSeries''' in v_src) = 0
     or position('not exists (select 1 from cand_ref r where r.child_id = c.id)' in v_src) = 0 then
    raise exception 'P1 failed: linker lost a guard or the parent_ref arm';
  end if;

  -- None of the seven may still read 'other' (a row since merged away is ignored).
  select count(*) into v_bad
    from public.events
   where id in ('31ea1eb7-a913-4ed3-88ab-d57129b89bcc', '8e8d048a-6eb3-4edc-bc7d-66c9d46d9be1',
                '357acd54-0e7a-42c7-94bf-1c89b3ccefaf', '1b3cae7a-5727-4552-9ff6-299894e2c172',
                'eda985d0-0dc1-4551-9e9d-4e6532432faa', '776165ad-9e33-4865-ab01-9abcc6ebab58',
                '56971640-c849-4167-a989-8c4223fd1281')
     and duplicate_of_id is null
     and event_type = 'other';
  if v_bad <> 0 then
    raise exception 'P2 failed: % festival umbrellas still typed other', v_bad;
  end if;
end
$verify$;
