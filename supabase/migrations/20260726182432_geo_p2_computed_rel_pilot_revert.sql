-- [Drift recovery 2026-07-26] Applied live via MCP by a concurrent session;
-- recovered verbatim from supabase_migrations.schema_migrations.statements.

-- Pilot result: computed relationships OVERRIDE FK relationships in PostgREST,
-- which breaks column-hinted embeds (cities:city_id(...)) while they coexist.
-- Sequencing must therefore be: client hint-drop edits deploy FIRST, then
-- computed rels + FK flip together. Revert the pilot functions.
drop function if exists public.cities(public.hotels);
drop function if exists public.countries(public.hotels);
drop function if exists public.queer_villages(public.hotels);
notify pgrst, 'reload schema';
