-- P2 redo: computed relationships whose names do NOT collide with any existing
-- FK relationship name — safe ahead of the client deploy and the FK flips.
create or replace function public.primary_city(t public.trips)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = t.primary_city_id $$;
create or replace function public.primary_country(t public.trips)
returns setof public.countries language sql stable rows 1
as $$ select * from public.countries where id = t.primary_country_id $$;
create or replace function public.birth_city(p public.personalities)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = p.city_id $$;
notify pgrst, 'reload schema';
