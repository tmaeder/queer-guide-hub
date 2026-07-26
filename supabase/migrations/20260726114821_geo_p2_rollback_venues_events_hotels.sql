-- P2 ROLLBACK 2/4: venues/events/hotels — the hot embed paths.
set local lock_timeout = '10s';
alter table public.venues drop constraint venues_city_id_fkey;
alter table public.venues add constraint venues_city_id_fkey
  foreign key (city_id) references public.cities(id);
alter table public.venues drop constraint venues_country_id_fkey;
alter table public.venues add constraint venues_country_id_fkey
  foreign key (country_id) references public.countries(id);
alter table public.venues drop constraint venues_queer_village_id_fkey;
alter table public.venues add constraint venues_queer_village_id_fkey
  foreign key (queer_village_id) references public.queer_villages(id);

alter table public.events drop constraint events_city_id_fkey;
alter table public.events add constraint events_city_id_fkey
  foreign key (city_id) references public.cities(id);
alter table public.events drop constraint events_country_id_fkey;
alter table public.events add constraint events_country_id_fkey
  foreign key (country_id) references public.countries(id);
alter table public.events drop constraint events_queer_village_id_fkey;
alter table public.events add constraint events_queer_village_id_fkey
  foreign key (queer_village_id) references public.queer_villages(id);

alter table public.hotels drop constraint hotels_city_id_fkey;
alter table public.hotels add constraint hotels_city_id_fkey
  foreign key (city_id) references public.cities(id);
alter table public.hotels drop constraint hotels_country_id_fkey;
alter table public.hotels add constraint hotels_country_id_fkey
  foreign key (country_id) references public.countries(id);
alter table public.hotels drop constraint hotels_queer_village_id_fkey;
alter table public.hotels add constraint hotels_queer_village_id_fkey
  foreign key (queer_village_id) references public.queer_villages(id);
