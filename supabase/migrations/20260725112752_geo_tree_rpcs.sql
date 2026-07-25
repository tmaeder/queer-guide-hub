-- Geo Hierarchy Unification — P1: tree read RPCs, move action, integrity report.
-- Breadcrumbs are public (anon); the tree + move + integrity surfaces are admin.

-- ---------------------------------------------------------------------------
-- Breadcrumbs: full ancestor chain for any geo node, root first.
-- Public — powers visible breadcrumbs + BreadcrumbList JSON-LD on detail pages.
-- ---------------------------------------------------------------------------
create or replace function public.get_geo_breadcrumbs(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with recursive chain as (
    select id, place_type, parent_id, name, slug, 0 as depth
    from public.geo_places where id = p_id
    union all
    select g.id, g.place_type, g.parent_id, g.name, g.slug, c.depth + 1
    from public.geo_places g
    join chain c on g.id = c.parent_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('type', place_type, 'id', id, 'name', name, 'slug', slug)
      order by depth desc
    ), '[]'::jsonb)
  from chain;
$$;

grant execute on function public.get_geo_breadcrumbs(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lazy tree: children of a node (roots when null) with geo child + entity counts.
-- ---------------------------------------------------------------------------
create or replace function public.get_geo_children(p_parent_id uuid default null)
returns table (
  id uuid,
  place_type text,
  name text,
  slug text,
  safety_gated boolean,
  duplicate_of_id uuid,
  child_count bigint,
  venue_count bigint,
  event_count bigint,
  hotel_count bigint
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select g.id, g.place_type, g.name, g.slug, g.safety_gated, g.duplicate_of_id,
    (select count(*) from public.geo_places c where c.parent_id = g.id) as child_count,
    case g.place_type
      when 'country' then (select count(*) from public.venues v where v.country_id = g.id)
      when 'city'    then (select count(*) from public.venues v where v.city_id = g.id)
      when 'village' then (select count(*) from public.venues v where v.queer_village_id = g.id)
      else 0::bigint
    end as venue_count,
    case g.place_type
      when 'country' then (select count(*) from public.events e where e.country_id = g.id)
      when 'city'    then (select count(*) from public.events e where e.city_id = g.id)
      when 'village' then (select count(*) from public.events e where e.queer_village_id = g.id)
      else 0::bigint
    end as event_count,
    case g.place_type
      when 'country' then (select count(*) from public.hotels h where h.country_id = g.id)
      when 'city'    then (select count(*) from public.hotels h where h.city_id = g.id)
      when 'village' then (select count(*) from public.hotels h where h.queer_village_id = g.id)
      else 0::bigint
    end as hotel_count
  from public.geo_places g
  where g.parent_id is not distinct from p_parent_id
  order by g.name;
$$;

grant execute on function public.get_geo_children(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Move: re-parent a node. Writes the TYPED source table (system of record);
-- dual-write mirrors into the spine and the cascade trigger re-derives
-- descendants. Also repairs denormalized country FKs on children/entities so a
-- move leaves the world consistent (safety_gated recomputes via the existing
-- entity triggers on country_id change).
-- ---------------------------------------------------------------------------
create or replace function public.geo_move_node(p_id uuid, p_new_parent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type text;
  v_ptype text;
  v_new_country uuid;
  v_villages int := 0;
  v_venues int := 0;
  v_events int := 0;
  v_hotels int := 0;
begin
  perform public.assert_admin_or_internal();

  select place_type into v_type from public.geo_places where id = p_id;
  select place_type into v_ptype from public.geo_places where id = p_new_parent_id;
  if v_type is null then raise exception 'geo_move_node: node % not found', p_id; end if;
  if v_ptype is null then raise exception 'geo_move_node: parent % not found', p_new_parent_id; end if;

  case v_type
    when 'region' then
      if v_ptype <> 'continent' then raise exception 'a region can only move under a continent'; end if;
      update public.regions set continent_id = p_new_parent_id, updated_at = now() where id = p_id;

    when 'country' then
      if v_ptype = 'region' then
        update public.countries
          set region_id = p_new_parent_id,
              continent_id = (select continent_id from public.regions where id = p_new_parent_id),
              updated_at = now()
          where id = p_id;
      elsif v_ptype = 'continent' then
        update public.countries set region_id = null, continent_id = p_new_parent_id, updated_at = now()
          where id = p_id;
      else
        raise exception 'a country can only move under a continent or region';
      end if;

    when 'city' then
      if v_ptype <> 'country' then raise exception 'a city can only move under a country'; end if;
      v_new_country := p_new_parent_id;
      update public.cities set country_id = v_new_country, updated_at = now() where id = p_id;
      -- Repair denormalized country on children + located entities.
      update public.queer_villages set country_id = v_new_country, updated_at = now()
        where city_id = p_id and country_id is distinct from v_new_country;
      get diagnostics v_villages = row_count;
      update public.venues set country_id = v_new_country
        where city_id = p_id and country_id is distinct from v_new_country;
      get diagnostics v_venues = row_count;
      update public.events set country_id = v_new_country
        where city_id = p_id and country_id is distinct from v_new_country;
      get diagnostics v_events = row_count;
      update public.hotels set country_id = v_new_country
        where city_id = p_id and country_id is distinct from v_new_country;
      get diagnostics v_hotels = row_count;

    when 'village' then
      if v_ptype <> 'city' then raise exception 'a village can only move under a city'; end if;
      v_new_country := (select country_id from public.cities where id = p_new_parent_id);
      update public.queer_villages set city_id = p_new_parent_id, country_id = v_new_country, updated_at = now()
        where id = p_id;

    when 'landmark' then
      if v_ptype not in ('city','village') then raise exception 'a landmark can only move under a city or village'; end if;
      -- Landmarks live natively on the spine.
      update public.geo_places set parent_id = p_new_parent_id where id = p_id;

    else
      raise exception 'geo_move_node: cannot move a %', v_type;
  end case;

  return jsonb_build_object(
    'moved', p_id, 'type', v_type, 'new_parent', p_new_parent_id,
    'repaired', jsonb_build_object('villages', v_villages, 'venues', v_venues, 'events', v_events, 'hotels', v_hotels)
  );
end;
$$;

revoke execute on function public.geo_move_node(uuid, uuid) from public, anon;
grant execute on function public.geo_move_node(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity report: every geo FK disagreement, read-only. Backfill/enforcement
-- come after a review of what this surfaces.
-- ---------------------------------------------------------------------------
create or replace view public.geo_integrity_violations
with (security_invoker = true) as
select 'village_country_mismatch' as violation, 'village' as entity_type, qv.id as entity_id,
       qv.name as entity_name, c.country_id as expected_id, qv.country_id as actual_id
from public.queer_villages qv
join public.cities c on c.id = qv.city_id
where qv.country_id is distinct from c.country_id
union all
select 'venue_city_country_mismatch', 'venue', v.id, v.name, c.country_id, v.country_id
from public.venues v
join public.cities c on c.id = v.city_id
where v.country_id is not null and v.country_id is distinct from c.country_id
union all
select 'venue_village_city_mismatch', 'venue', v.id, v.name, qv.city_id, v.city_id
from public.venues v
join public.queer_villages qv on qv.id = v.queer_village_id
where v.city_id is not null and v.city_id is distinct from qv.city_id
union all
select 'event_city_country_mismatch', 'event', e.id, e.title, c.country_id, e.country_id
from public.events e
join public.cities c on c.id = e.city_id
where e.country_id is not null and e.country_id is distinct from c.country_id
union all
select 'event_village_city_mismatch', 'event', e.id, e.title, qv.city_id, e.city_id
from public.events e
join public.queer_villages qv on qv.id = e.queer_village_id
where e.city_id is not null and e.city_id is distinct from qv.city_id
union all
select 'hotel_city_country_mismatch', 'hotel', h.id, h.name, c.country_id, h.country_id
from public.hotels h
join public.cities c on c.id = h.city_id
where h.country_id is not null and h.country_id is distinct from c.country_id
union all
select 'hotel_village_city_mismatch', 'hotel', h.id, h.name, qv.city_id, h.city_id
from public.hotels h
join public.queer_villages qv on qv.id = h.queer_village_id
where h.city_id is not null and h.city_id is distinct from qv.city_id;

grant select on public.geo_integrity_violations to authenticated;
