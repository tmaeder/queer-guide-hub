-- Nearest airports for a city, measured from the city itself and across borders.
--
-- The city page showed airports up to five times (head fact strip, "Nearest
-- airport", "Other airports nearby", "All airport codes", and the `airports`
-- key of transportation_info under "Getting around") and still got the border
-- case wrong. Aachen, measured on prod:
--
--   nearest_airport_codes = {DUS,CGN}, nearest_airport_km = 74.4
--
-- while the real nearest scheduled passenger airports are Maastricht (MST,
-- 26.6 km) and Liège (LGG, 47.6 km). run_city_airport_link only considers
-- airports in the SAME country, which is right for choosing a booking target
-- and wrong for answering "which airports are near this city": a border city's
-- nearest airport is routinely in the neighbouring country.
--
-- This is a read-time function rather than a stored column on purpose:
--   * no backfill and no batch, so it is correct for every city the moment it
--     ships and stays in step with the monthly airport-service-refresh;
--   * no UPDATE on `cities`, which would fan out through the geo spine into
--     search_reindex_queue for ~7.8k rows to store a derived value.
--
-- run_city_airport_link and major_airport_code (the flight-search input) are
-- deliberately left alone; the booking target is a separate decision.
--
-- Only large/medium airports: small_airport rows with scheduled service are
-- legitimate (island strips) but would otherwise lead the list for almost every
-- rural town. The city's OWN airports (local_airport_codes) are excluded, since
-- the page states those in the separate "Airport" field.

create or replace function public.city_nearest_airports(
  p_city_id uuid,
  p_limit   integer default 3
)
returns table(
  iata_code    text,
  city         text,
  airport_name text,
  country_code text,
  distance_km  numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select a.iata_code,
         a.municipality,
         a.name,
         a.country_code,
         round((public.haversine_m(
                  c.latitude::numeric,  c.longitude::numeric,
                  a.latitude::numeric,  a.longitude::numeric) / 1000.0)::numeric, 1)
    from public.cities c
    cross join public.airport_service a
   where c.id = p_city_id
     and c.latitude is not null
     and c.longitude is not null
     and a.ap_type in ('large_airport', 'medium_airport')
     and not (a.iata_code = any (coalesce(c.local_airport_codes, '{}'::text[])))
   order by 5, 1
   limit least(greatest(coalesce(p_limit, 3), 1), 10)
$$;

comment on function public.city_nearest_airports(uuid, integer) is
  'Up to p_limit (default 3, max 10) nearest large/medium scheduled-passenger airports to a city, by great-circle distance, across borders, excluding the city''s own local_airport_codes.';

revoke all on function public.city_nearest_airports(uuid, integer) from public;
grant execute on function public.city_nearest_airports(uuid, integer) to anon, authenticated, service_role;

-- Postconditions. Aachen is the case that motivated this; assert the ORDER
-- invariant and that the cross-border airport leads, not exact distances.
do $verify$
declare
  v_aachen uuid;
  v_codes  text[];
  v_km     numeric[];
begin
  select id into v_aachen
    from public.cities
   where lower(name) = 'aachen' and duplicate_of_id is null
     and latitude is not null
   limit 1;

  if v_aachen is null then
    raise notice 'city_nearest_airports: Aachen not present, skipping data postcondition';
    return;
  end if;

  select array_agg(iata_code order by distance_km, iata_code),
         array_agg(distance_km order by distance_km, iata_code)
    into v_codes, v_km
    from public.city_nearest_airports(v_aachen, 3);

  if coalesce(cardinality(v_codes), 0) <> 3 then
    raise exception 'city_nearest_airports: expected 3 rows for Aachen, got %', v_codes;
  end if;
  if v_codes[1] <> 'MST' then
    raise exception 'city_nearest_airports: expected MST first for Aachen, got %', v_codes;
  end if;
  if not (v_km[1] <= v_km[2] and v_km[2] <= v_km[3]) then
    raise exception 'city_nearest_airports: distances not ascending: %', v_km;
  end if;
end
$verify$;
