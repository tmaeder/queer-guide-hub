-- Computed relationships so PostgREST can embed cities(...) / countries(...)
-- on organizations, as it already can on venues, events and hotels.
--
-- Since the Geo P2 FK flips, organizations.city_id / country_id reference
-- geo_city_profiles / geo_country_profiles, so a bare `cities(...)` embed has
-- no relationship to resolve. The admin Organisations list needs the city
-- name, its ISO 3166-2 region code and the country's ISO code in each row;
-- these mirror public.cities(hotels) / public.countries(hotels) verbatim.
-- No grant change: the functions read the base tables under the caller's RLS.

create or replace function public.cities(o public.organizations)
  returns setof public.cities
  language sql
  stable
  rows 1
  set search_path to 'pg_catalog', 'public', 'extensions', 'auth', 'storage'
as $function$ select * from public.cities where id = o.city_id $function$;

create or replace function public.countries(o public.organizations)
  returns setof public.countries
  language sql
  stable
  rows 1
  set search_path to 'pg_catalog', 'public', 'extensions', 'auth', 'storage'
as $function$ select * from public.countries where id = o.country_id $function$;

do $verify$
begin
  if to_regprocedure('public.cities(public.organizations)') is null then
    raise exception 'cities(organizations) missing';
  end if;
  if to_regprocedure('public.countries(public.organizations)') is null then
    raise exception 'countries(organizations) missing';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
