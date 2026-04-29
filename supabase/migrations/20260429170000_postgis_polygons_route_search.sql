-- PostGIS polygons + route-based search
--
-- Builds on the venues.location PostGIS column already in place
-- (migration 20250803120349). Adds polygon support to regions + queer_villages
-- and three geo-RPCs that the search-intelligence layer (and future trip
-- planner) need:
--
--   entities_in_polygon(polygon_geojson, entity_type, limit)
--     "what entities sit inside this user-drawn polygon?"
--   entities_along_route(route_geojson, buffer_m, entity_types[], limit)
--     "what's within X meters of my LineString?"  (trip planner)
--   find_polygon_for_point(lat, lng)
--     "which queer_village or region contains this coordinate?"
--
-- Pure additive: no existing column or index altered. Uses the on-the-fly
-- ST_MakePoint(lng, lat) projection for entities that don't carry a geometry
-- column yet, so we don't have to backfill venues/events/marketplace today.
-- A future PR can add proper geometry columns + a sync trigger if perf
-- becomes a concern.
--
-- Note: venues already has a `location extensions.GEOMETRY(Point, 4326)`
-- column from 20250803120349; we still use ST_MakePoint(longitude, latitude)
-- here for uniformity across entity types and to avoid a hard dependency
-- on whether `location` is populated for any given row.

-- ── Polygon columns ─────────────────────────────────────────────────────────
alter table public.regions
  add column if not exists geometry extensions.geometry(MultiPolygon, 4326);

alter table public.queer_villages
  add column if not exists geometry extensions.geometry(MultiPolygon, 4326);

create index if not exists regions_geometry_gist
  on public.regions using gist (geometry)
  where geometry is not null;

create index if not exists queer_villages_geometry_gist
  on public.queer_villages using gist (geometry)
  where geometry is not null;

-- ── entities_in_polygon ─────────────────────────────────────────────────────
-- Returns entity rows whose (latitude, longitude) point falls within the
-- given polygon. Polygon is supplied as GeoJSON text to keep the API
-- friendly to callers that don't carry PostGIS-aware clients.
create or replace function public.entities_in_polygon(
  p_polygon_geojson text,
  p_entity_type     text,
  p_limit           int default 200
) returns table (
  entity_type text,
  entity_id   uuid,
  latitude    numeric,
  longitude   numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_polygon extensions.geometry;
begin
  -- ST_GeomFromGeoJSON raises on malformed input — let the error propagate
  -- as a 400-equivalent to the caller.
  v_polygon := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_polygon_geojson), 4326);

  return query
  with src as (
    select 'venue'::text as etype, v.id, v.latitude::numeric, v.longitude::numeric
      from public.venues v where p_entity_type in ('venue','*')
    union all
    select 'event', e.id, e.latitude::numeric, e.longitude::numeric
      from public.events e where p_entity_type in ('event','*')
    union all
    select 'marketplace_listing', m.id, m.latitude::numeric, m.longitude::numeric
      from public.marketplace_listings m where p_entity_type in ('marketplace_listing','*')
    union all
    select 'queer_village', qv.id, qv.latitude::numeric, qv.longitude::numeric
      from public.queer_villages qv where p_entity_type in ('queer_village','*')
    union all
    select 'city', c.id, c.latitude::numeric, c.longitude::numeric
      from public.cities c where p_entity_type in ('city','*')
  )
  select s.etype, s.id, s.latitude, s.longitude
    from src s
   where s.latitude is not null
     and s.longitude is not null
     and extensions.ST_Within(
       extensions.ST_SetSRID(extensions.ST_MakePoint(s.longitude, s.latitude), 4326),
       v_polygon
     )
   limit greatest(p_limit, 1);
end $$;

-- ── entities_along_route ────────────────────────────────────────────────────
-- Trip planner: given a GeoJSON LineString and a buffer in meters, return
-- entities (across requested types) within that buffer of the route.
-- Uses geography casts so distances are in meters regardless of latitude.
create or replace function public.entities_along_route(
  p_route_geojson text,
  p_buffer_m      int default 1000,
  p_entity_types  text[] default array['venue','event','queer_village'],
  p_limit         int default 200
) returns table (
  entity_type      text,
  entity_id        uuid,
  latitude         numeric,
  longitude        numeric,
  distance_m       numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_route extensions.geometry;
begin
  v_route := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_route_geojson), 4326);

  return query
  with src as (
    select 'venue'::text as etype, v.id, v.latitude::numeric, v.longitude::numeric
      from public.venues v where 'venue' = any(p_entity_types)
    union all
    select 'event', e.id, e.latitude::numeric, e.longitude::numeric
      from public.events e where 'event' = any(p_entity_types)
    union all
    select 'marketplace_listing', m.id, m.latitude::numeric, m.longitude::numeric
      from public.marketplace_listings m where 'marketplace_listing' = any(p_entity_types)
    union all
    select 'queer_village', qv.id, qv.latitude::numeric, qv.longitude::numeric
      from public.queer_villages qv where 'queer_village' = any(p_entity_types)
    union all
    select 'city', c.id, c.latitude::numeric, c.longitude::numeric
      from public.cities c where 'city' = any(p_entity_types)
  )
  select s.etype, s.id, s.latitude, s.longitude,
    extensions.ST_Distance(
      extensions.ST_SetSRID(extensions.ST_MakePoint(s.longitude, s.latitude), 4326)::extensions.geography,
      v_route::extensions.geography
    )::numeric as distance_m
    from src s
   where s.latitude is not null
     and s.longitude is not null
     and extensions.ST_DWithin(
       extensions.ST_SetSRID(extensions.ST_MakePoint(s.longitude, s.latitude), 4326)::extensions.geography,
       v_route::extensions.geography,
       p_buffer_m
     )
   order by distance_m asc
   limit greatest(p_limit, 1);
end $$;

-- ── find_polygon_for_point ──────────────────────────────────────────────────
-- Reverse lookup: which curated polygon (queer_village or region) contains
-- the given coordinate? Returns at most one row per layer; caller can
-- choose whichever they prefer. NULL when no containing polygon exists.
create or replace function public.find_polygon_for_point(
  p_lat numeric,
  p_lng numeric
) returns table (
  layer       text,
  polygon_id  uuid,
  polygon_name text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_pt extensions.geometry;
begin
  if p_lat is null or p_lng is null then return; end if;
  v_pt := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326);

  return query
    select 'queer_village'::text, qv.id, qv.name
      from public.queer_villages qv
     where qv.geometry is not null
       and extensions.ST_Contains(qv.geometry, v_pt)
     limit 1;

  return query
    select 'region'::text, r.id, r.name
      from public.regions r
     where r.geometry is not null
       and extensions.ST_Contains(r.geometry, v_pt)
     limit 1;
end $$;

revoke all on function public.entities_in_polygon(text, text, int) from public;
revoke all on function public.entities_along_route(text, int, text[], int) from public;
revoke all on function public.find_polygon_for_point(numeric, numeric) from public;
grant execute on function public.entities_in_polygon(text, text, int)
  to anon, authenticated, service_role;
grant execute on function public.entities_along_route(text, int, text[], int)
  to anon, authenticated, service_role;
grant execute on function public.find_polygon_for_point(numeric, numeric)
  to anon, authenticated, service_role;

comment on column public.regions.geometry is
  'Optional MultiPolygon of the region in EPSG:4326. NULL when boundary not yet curated.';
comment on column public.queer_villages.geometry is
  'Optional MultiPolygon of the village footprint in EPSG:4326. NULL when only point-coordinates are known.';
comment on function public.entities_in_polygon(text, text, int) is
  'Find entities whose lat/lng falls inside a user-drawn polygon (GeoJSON). entity_type=''*'' returns all types.';
comment on function public.entities_along_route(text, int, text[], int) is
  'Find entities within p_buffer_m meters of a GeoJSON LineString. Sorted by distance.';
comment on function public.find_polygon_for_point(numeric, numeric) is
  'Reverse lookup: which queer_village / region polygon contains the given coordinate? Up to one row per layer.';
