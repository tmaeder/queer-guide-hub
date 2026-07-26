-- Geo Hierarchy Unification — P2: events + hotels geo FKs → satellite PKs.
set local lock_timeout = '10s';
alter table public.events drop constraint events_city_id_fkey;
alter table public.events add constraint events_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.events drop constraint events_country_id_fkey;
alter table public.events add constraint events_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);
alter table public.events drop constraint events_queer_village_id_fkey;
alter table public.events add constraint events_queer_village_id_fkey
  foreign key (queer_village_id) references public.geo_village_profiles(place_id);

alter table public.hotels drop constraint hotels_city_id_fkey;
alter table public.hotels add constraint hotels_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.hotels drop constraint hotels_country_id_fkey;
alter table public.hotels add constraint hotels_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);
alter table public.hotels drop constraint hotels_queer_village_id_fkey;
alter table public.hotels add constraint hotels_queer_village_id_fkey
  foreign key (queer_village_id) references public.geo_village_profiles(place_id);
