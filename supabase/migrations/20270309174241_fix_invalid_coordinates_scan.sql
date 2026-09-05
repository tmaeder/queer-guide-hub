-- find_invalid_coordinates / count_invalid_coordinates — repair a scan that
-- has never once executed.
--
-- Both functions have raised 42703 "column m.latitude does not exist" on EVERY
-- call since 20260429140000 created them. The `all_geo` CTE unions a branch
-- over public.marketplace_listings selecting m.latitude / m.longitude, and
-- marketplace_listings has never had either column — not in the baseline, not
-- in any migration since. This is not a column that was dropped underneath a
-- working function; the function was born broken.
--
-- It survived because it had no callers. Grepping src/, workers/, scripts/,
-- supabase/functions/ and e2e/ finds it only in the generated
-- src/integrations/supabase/types.ts. The "Ingestion Quality / Consistency"
-- surfaces its header promises were never wired up, so nothing ever asked it a
-- question and nothing ever saw the error. A geo quality scan that reports
-- zero problems and one that cannot run are indistinguishable from the
-- outside, which is the whole reason this class of defect lasts.
--
-- Changes, all to the entity list — the validation rules, signature, return
-- type, security properties and grants are untouched:
--   - REMOVED marketplace_listing. The table carries no coordinates and never
--     has, so there is nothing to scan.
--   - ADDED hotel and organization. Both carry latitude/longitude (hotels
--     since the baseline, organizations since 20260916160000) and both are in
--     the derive_entity_geo_address() trigger set, so they are exactly as
--     eligible as venues/events. Omitting them was the same oversight in the
--     other direction.
--   - ADDED landmark, which lives natively on the geo_places spine
--     (place_type='landmark') and has no typed table. Scoped to that
--     place_type so the spine's city/country/village mirror rows are not
--     double-counted against their typed originals.
--
-- The DO block at the end is the point of the migration as much as the fix is:
-- it calls the function and cross-checks one branch against a direct count, so
-- a future edit that reintroduces a phantom column fails here instead of
-- silently restoring a scan nobody can call.

create or replace function public.find_invalid_coordinates(
  p_entity_type text default null,
  p_limit int default 1000
) returns table (
  entity_type text,
  entity_id   uuid,
  latitude    numeric,
  longitude   numeric,
  problem     text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- Admin gate. Service role bypasses (auth.uid() returns NULL for service
  -- role, but service role inherits all privileges so the EXISTS short-circuits).
  if auth.uid() is not null and not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin','moderator')
  ) then
    raise exception 'admin access required';
  end if;

  return query
  with all_geo as (
    select 'venue'::text as etype, v.id::uuid, v.latitude::numeric, v.longitude::numeric
      from public.venues v
    union all
    select 'event', e.id, e.latitude::numeric, e.longitude::numeric
      from public.events e
    union all
    select 'hotel', h.id, h.latitude::numeric, h.longitude::numeric
      from public.hotels h
    union all
    select 'organization', o.id, o.latitude::numeric, o.longitude::numeric
      from public.organizations o
    union all
    select 'city', c.id, c.latitude::numeric, c.longitude::numeric
      from public.cities c
    union all
    select 'country', co.id, co.latitude::numeric, co.longitude::numeric
      from public.countries co
    union all
    select 'queer_village', qv.id, qv.latitude::numeric, qv.longitude::numeric
      from public.queer_villages qv
    union all
    -- Landmarks have no typed table; they exist only on the spine. Scoping to
    -- place_type='landmark' keeps the country/city/village mirror rows out,
    -- which would otherwise be counted twice — once here and once from their
    -- own typed table above.
    select 'landmark', gp.id, gp.latitude::numeric, gp.longitude::numeric
      from public.geo_places gp
     where gp.place_type = 'landmark'
  )
  select
    g.etype,
    g.id,
    g.latitude,
    g.longitude,
    case
      when g.latitude is null or g.longitude is null then 'missing'
      when g.latitude = 0 and g.longitude = 0 then 'zero_zero'
      when g.latitude < -90 or g.latitude > 90 then 'lat_out_of_range'
      when g.longitude < -180 or g.longitude > 180 then 'lng_out_of_range'
      else null
    end as problem
  from all_geo g
  where (p_entity_type is null or g.etype = p_entity_type)
    and (
      g.latitude is null or g.longitude is null
      or (g.latitude = 0 and g.longitude = 0)
      or g.latitude < -90 or g.latitude > 90
      or g.longitude < -180 or g.longitude > 180
    )
  order by g.etype, g.id
  limit greatest(p_limit, 1);
end $$;

revoke all on function public.find_invalid_coordinates(text, int) from public;
grant execute on function public.find_invalid_coordinates(text, int)
  to authenticated, service_role;

comment on function public.find_invalid_coordinates(text, int) is
  'Returns rows from venues/events/hotels/organizations/cities/countries/queer_villages and spine landmarks that fail one or more coordinate validation rules (missing, zero_zero, lat/lng out of range). Admin-only. Raised 42703 on every call from 20260429140000 until 20270309174241 because it scanned a marketplace_listings.latitude column that has never existed.';
comment on function public.count_invalid_coordinates() is
  'Aggregate count of invalid coordinates per entity type. Wraps find_invalid_coordinates(NULL, large_limit) and groups. Inherits the entity list from that function.';

-- ── Proof it runs, and runs correctly ────────────────────────────────────────
-- Two assertions. The first would have caught the original defect: it simply
-- calls the function, so any phantom column raises here and fails the
-- migration. The second is the one that matters longer term — it compares the
-- 'venue' branch against a direct count over venues, so the scan cannot drift
-- into under-reporting (a dropped UNION branch, a filter typo) while still
-- executing cleanly. A scan that runs but silently omits a table is the same
-- failure this migration exists to end, one layer along.
do $verify$
declare
  v_direct   bigint;
  v_reported bigint;
  v_types    text[];
begin
  select count(*) into v_direct
  from public.venues
  where latitude is null or longitude is null
     or (latitude = 0 and longitude = 0)
     or latitude not between -90 and 90
     or longitude not between -180 and 180;

  select coalesce(total_invalid, 0) into v_reported
  from public.count_invalid_coordinates()
  where entity_type = 'venue';

  if coalesce(v_reported, 0) is distinct from v_direct then
    raise exception
      'find_invalid_coordinates venue branch disagrees with a direct count: reported %, direct %',
      coalesce(v_reported, 0), v_direct;
  end if;

  select array_agg(distinct entity_type order by entity_type) into v_types
  from public.count_invalid_coordinates();

  if 'marketplace_listing' = any(coalesce(v_types, '{}')) then
    raise exception 'marketplace_listing is still in the coordinate scan; it has no coordinate columns';
  end if;

  raise notice 'find_invalid_coordinates repaired: venue=% invalid, entity types reporting = %',
    v_direct, coalesce(array_to_string(v_types, ','), '(none)');
end
$verify$;
