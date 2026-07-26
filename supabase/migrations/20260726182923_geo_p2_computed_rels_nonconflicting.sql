-- [Drift recovery 2026-07-26] Applied live via MCP by a concurrent session;
-- recovered verbatim from supabase_migrations.schema_migrations.statements.

-- P2 redo: computed relationships whose names do NOT collide with any existing
-- FK relationship name — safe to create ahead of the client deploy and the FK
-- flips (pilot proved same-named computed rels OVERRIDE FK relationships, so
-- the cities/countries/queer_villages ones must wait for the flip migration;
-- these distinctly-named ones have no such collision).
create or replace function public.primary_city(t public.trips)
returns setof public.cities
language sql stable rows 1
as $$ select * from public.cities where id = t.primary_city_id $$;

create or replace function public.primary_country(t public.trips)
returns setof public.countries
language sql stable rows 1
as $$ select * from public.countries where id = t.primary_country_id $$;

create or replace function public.birth_city(p public.personalities)
returns setof public.cities
language sql stable rows 1
as $$ select * from public.cities where id = p.city_id $$;

notify pgrst, 'reload schema';
