-- find_invalid_coordinates
--
-- Bulk geo quality scan across every entity type that carries coordinates.
-- Returns rows that fail at least one validation rule:
--   - missing:        latitude or longitude is NULL
--   - zero_zero:      both are exactly 0 (the "Null Island" sentinel)
--   - lat_out_of_range: latitude is outside [-90, 90]
--   - lng_out_of_range: longitude is outside [-180, 180]
--
-- Plugs into the Search Intelligence Ingestion Quality / Consistency surfaces
-- so admins can see at a glance "23 venues with no coordinates" or "4 events
-- at (0,0)". Also useful in `compute_visibility_score`'s geo axis as a bulk
-- precompute (today that axis inspects one row at a time).
--
-- Pure SELECT, no side effects. Admin-only via the SECURITY DEFINER guard.

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
    select 'city', c.id, c.latitude::numeric, c.longitude::numeric
      from public.cities c
    union all
    select 'country', co.id, co.latitude::numeric, co.longitude::numeric
      from public.countries co
    union all
    select 'queer_village', qv.id, qv.latitude::numeric, qv.longitude::numeric
      from public.queer_villages qv
    union all
    select 'marketplace_listing', m.id, m.latitude::numeric, m.longitude::numeric
      from public.marketplace_listings m
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

-- ── Aggregate counts (cheap one-row-per-type tally) ──────────────────────────
-- Useful for the Ingestion Quality tab's overview: "venues: 12 missing,
-- 3 zero_zero, 0 out_of_range".
create or replace function public.count_invalid_coordinates()
returns table (
  entity_type      text,
  missing          bigint,
  zero_zero        bigint,
  lat_out_of_range bigint,
  lng_out_of_range bigint,
  total_invalid    bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin','moderator')
  ) then
    raise exception 'admin access required';
  end if;

  return query
  with rows as (
    select * from public.find_invalid_coordinates(null, 1000000)
  )
  select
    r.entity_type,
    count(*) filter (where r.problem = 'missing')::bigint,
    count(*) filter (where r.problem = 'zero_zero')::bigint,
    count(*) filter (where r.problem = 'lat_out_of_range')::bigint,
    count(*) filter (where r.problem = 'lng_out_of_range')::bigint,
    count(*)::bigint
  from rows r
  group by r.entity_type
  order by r.entity_type;
end $$;

revoke all on function public.count_invalid_coordinates() from public;
grant execute on function public.count_invalid_coordinates()
  to authenticated, service_role;

comment on function public.find_invalid_coordinates(text, int) is
  'Returns rows from venues/events/cities/countries/queer_villages/marketplace_listings that fail one or more coordinate validation rules. Admin-only.';
comment on function public.count_invalid_coordinates() is
  'Aggregate count of invalid coordinates per entity type. Wraps find_invalid_coordinates(NULL, large_limit) and groups.';
