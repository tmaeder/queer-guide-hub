-- [Drift recovery 2026-07-26] Applied live via MCP by a concurrent session;
-- recovered verbatim from supabase_migrations.schema_migrations.statements so
-- db push stops skipping (remote-only versions block ALL merged migrations).

-- P2 redo pilot: PostgREST computed relationships for hotels → cities/countries/villages.
-- These restore FK-free embeds ("cities(...)") after the FK re-point. rows 1 marks
-- the relationship to-one so embeds return an object, not an array.
create or replace function public.cities(h public.hotels)
returns setof public.cities
language sql stable rows 1
as $$ select * from public.cities where id = h.city_id $$;

create or replace function public.countries(h public.hotels)
returns setof public.countries
language sql stable rows 1
as $$ select * from public.countries where id = h.country_id $$;

create or replace function public.queer_villages(h public.hotels)
returns setof public.queer_villages
language sql stable rows 1
as $$ select * from public.queer_villages where id = h.queer_village_id $$;

-- PostgREST discovers computed relationships on schema reload.
notify pgrst, 'reload schema';
