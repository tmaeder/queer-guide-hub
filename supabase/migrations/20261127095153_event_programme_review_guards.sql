-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127095153 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
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
      and public.normalize_name(p.title) !~ '\m(campsite|camping|expo)\M|after dark|street party|pool part'
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
            array(select t from unnest(p.toks) t
                  where t !~ '^\d{4}$' and t <> all(array['tbc','date','dates','week','weekend','official'])
                  intersect select unnest(c.toks) except select unnest(p.city_toks))
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
$function$
;
;
