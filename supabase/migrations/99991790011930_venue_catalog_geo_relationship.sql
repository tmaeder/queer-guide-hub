-- PostgREST cannot infer the venues -> cities relationship through a view.
-- Declare the computed relationship explicitly so crawler/detail queries can
-- embed cities(...) from the canonical catalog without falling back to a 404.
create or replace function public.cities(v public.venue_catalog_public)
returns setof public.cities
language sql
stable
rows 1
set search_path to 'public', 'pg_temp'
as $cities$
  select c.*
  from public.cities c
  where c.id = v.city_id
$cities$;

grant execute on function public.cities(public.venue_catalog_public)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
