-- Geo Hierarchy Unification — P2: venues geo FKs → satellite PKs.
set local lock_timeout = '10s';
alter table public.venues drop constraint venues_city_id_fkey;
alter table public.venues add constraint venues_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.venues drop constraint venues_country_id_fkey;
alter table public.venues add constraint venues_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);
alter table public.venues drop constraint venues_queer_village_id_fkey;
alter table public.venues add constraint venues_queer_village_id_fkey
  foreign key (queer_village_id) references public.geo_village_profiles(place_id);
