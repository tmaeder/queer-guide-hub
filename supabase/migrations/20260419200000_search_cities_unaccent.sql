-- Diacritic-insensitive city search RPC.
-- Used by CityCountryAutocomplete so typing "Zurich" matches "Zürich" (and vice versa).
create extension if not exists unaccent;

create or replace function public.search_cities(q text, max_results int default 8)
returns table (
  id uuid,
  name text,
  timezone text,
  country_id uuid,
  country_name text,
  country_code text
)
language sql
stable
security definer
set search_path = public
as $$
  with needle as (
    select unaccent(lower(coalesce(q, ''))) as n
  )
  select c.id,
         c.name,
         c.timezone,
         co.id   as country_id,
         co.name as country_name,
         co.code as country_code
  from public.cities c
  join public.countries co on co.id = c.country_id,
       needle
  where length(needle.n) >= 2
    and (
      unaccent(lower(c.name)) like needle.n || '%'
      or unaccent(lower(c.name)) like '%' || needle.n || '%'
    )
  order by
    (unaccent(lower(c.name)) like needle.n || '%') desc,
    c.name asc
  limit greatest(1, least(coalesce(max_results, 8), 50));
$$;

grant execute on function public.search_cities(text, int) to anon, authenticated;
