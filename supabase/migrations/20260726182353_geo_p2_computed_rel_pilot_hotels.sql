-- P2 redo pilot: computed relationships for hotels. Reverted in the next
-- migration — the pilot proved computed rels OVERRIDE same-named FK
-- relationships, breaking column-hinted embeds while both exist.
create or replace function public.cities(h public.hotels)
returns setof public.cities language sql stable rows 1
as $$ select * from public.cities where id = h.city_id $$;
create or replace function public.countries(h public.hotels)
returns setof public.countries language sql stable rows 1
as $$ select * from public.countries where id = h.country_id $$;
create or replace function public.queer_villages(h public.hotels)
returns setof public.queer_villages language sql stable rows 1
as $$ select * from public.queer_villages where id = h.queer_village_id $$;
notify pgrst, 'reload schema';
