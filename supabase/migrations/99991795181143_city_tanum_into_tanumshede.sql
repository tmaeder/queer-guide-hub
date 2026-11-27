-- Renaming "Tanums kommun" to "Tanum" (99991795171347) collided with the
-- "Tanum" alias of Tanumshede, the municipality's seat town 19 km away, and
-- city_name_twin_signals().colliding_aliases went 0 -> 1. It is the same
-- kommun-beside-its-town pair as the seven Swedish merges in that migration,
-- so the municipality row merges into Tanumshede (QID Q670220 stays).
-- Reversible via unmerge_cities.
do $$
begin
  perform set_config('app.actor', 'migration:city_tanum_into_tanumshede', true);
  if exists (select 1 from public.cities where id = '8b22d68b-d2e0-424f-9d6f-121f54f20152' and duplicate_of_id is null)
     and exists (select 1 from public.cities where id = 'bdf2ebad-125f-417b-b96e-5bd28e5e14db' and duplicate_of_id is null)
     and exists (select 1 from public.geo_city_profiles where place_id = '8b22d68b-d2e0-424f-9d6f-121f54f20152')
     and exists (select 1 from public.geo_city_profiles where place_id = 'bdf2ebad-125f-417b-b96e-5bd28e5e14db')
     and exists (select 1 from public.cities c join public.geo_places g on g.id = c.country_id
                  where c.id = '8b22d68b-d2e0-424f-9d6f-121f54f20152') then
    perform public.merge_cities('8b22d68b-d2e0-424f-9d6f-121f54f20152', 'bdf2ebad-125f-417b-b96e-5bd28e5e14db', false);
  end if;
end $$;
