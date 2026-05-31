-- "On this day in queer history" (plan §14.5): LGBTQ+ personalities born or died
-- on today's month/day, for a daily editorial/engagement surface. Pure read over
-- personalities.birth_date / death_date. Public.
create or replace function public.personalities_on_this_day(
  p_today date default current_date,
  p_limit int  default 12
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(obj order by featured desc, years_ago, nm), '[]'::jsonb)
  from (
    select obj, nm, featured, years_ago
    from (
      select jsonb_build_object(
               'id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url,
               'profession', p.profession, 'nationality', p.nationality,
               'anniversary', 'born', 'date', p.birth_date,
               'years_ago', (extract(year from p_today) - extract(year from p.birth_date))::int,
               'featured', coalesce(p.is_featured, false)
             ) as obj,
             p.name as nm, coalesce(p.is_featured, false) as featured,
             (extract(year from p_today) - extract(year from p.birth_date))::int as years_ago
      from public.personalities p
      where p.duplicate_of_id is null and p.birth_date is not null
        and extract(month from p.birth_date) = extract(month from p_today)
        and extract(day   from p.birth_date) = extract(day   from p_today)
      union all
      select jsonb_build_object(
               'id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url,
               'profession', p.profession, 'nationality', p.nationality,
               'anniversary', 'died', 'date', p.death_date,
               'years_ago', (extract(year from p_today) - extract(year from p.death_date))::int,
               'featured', coalesce(p.is_featured, false)
             ),
             p.name, coalesce(p.is_featured, false),
             (extract(year from p_today) - extract(year from p.death_date))::int
      from public.personalities p
      where p.duplicate_of_id is null and p.death_date is not null
        and extract(month from p.death_date) = extract(month from p_today)
        and extract(day   from p.death_date) = extract(day   from p_today)
    ) u
    order by featured desc, years_ago, nm
    limit greatest(p_limit, 0)
  ) lim;
$$;

grant execute on function public.personalities_on_this_day(date, int) to anon, authenticated, service_role;
