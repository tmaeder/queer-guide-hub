-- P2 redo B2: venues/events/hotels — computed rels (forward + reverse) + FK flips, atomic.
set local lock_timeout = '10s';

-- Forward computed relationships (restore bare cities()/countries()/queer_villages() embeds)
create or replace function public.cities(v public.venues)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = v.city_id $$;
create or replace function public.countries(v public.venues)
returns setof public.countries language sql stable rows 1
as $$ select * from public.countries where id = v.country_id $$;
create or replace function public.queer_villages(v public.venues)
returns setof public.queer_villages language sql stable rows 1
as $$ select * from public.queer_villages where id = v.queer_village_id $$;

create or replace function public.cities(e public.events)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = e.city_id $$;
create or replace function public.countries(e public.events)
returns setof public.countries language sql stable rows 1
as $$ select * from public.countries where id = e.country_id $$;
create or replace function public.queer_villages(e public.events)
returns setof public.queer_villages language sql stable rows 1
as $$ select * from public.queer_villages where id = e.queer_village_id $$;

create or replace function public.cities(h public.hotels)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = h.city_id $$;
create or replace function public.countries(h public.hotels)
returns setof public.countries language sql stable rows 1
as $$ select * from public.countries where id = h.country_id $$;
create or replace function public.queer_villages(h public.hotels)
returns setof public.queer_villages language sql stable rows 1
as $$ select * from public.queer_villages where id = h.queer_village_id $$;

-- Reverse computed relationships (venues(count)/events(count) from city/village lists)
create or replace function public.venues(c public.cities)
returns setof public.venues language sql stable
as $$ select * from public.venues where city_id = c.id $$;
create or replace function public.events(c public.cities)
returns setof public.events language sql stable
as $$ select * from public.events where city_id = c.id $$;
create or replace function public.venues(qv public.queer_villages)
returns setof public.venues language sql stable
as $$ select * from public.venues where queer_village_id = qv.id $$;
create or replace function public.events(qv public.queer_villages)
returns setof public.events language sql stable
as $$ select * from public.events where queer_village_id = qv.id $$;

-- FK flips to the type-safe satellite PKs
alter table public.venues drop constraint venues_city_id_fkey;
alter table public.venues add constraint venues_city_id_fkey
  foreign key (city_id) references public.geo_city_profiles(place_id);
alter table public.venues drop constraint venues_country_id_fkey;
alter table public.venues add constraint venues_country_id_fkey
  foreign key (country_id) references public.geo_country_profiles(place_id);
alter table public.venues drop constraint venues_queer_village_id_fkey;
alter table public.venues add constraint venues_queer_village_id_fkey
  foreign key (queer_village_id) references public.geo_village_profiles(place_id);

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

notify pgrst, 'reload schema';
