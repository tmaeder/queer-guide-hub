-- Range variant of personalities_on_this_day for the /hub/plans unified
-- calendar's "queer history" layer: birth/death anniversaries of public
-- personalities across [p_from, p_to]. generate_series handles the Dec→Jan
-- year boundary for free; the range is hard-capped at 62 days (a month grid
-- shows at most 42 cells). Feb-29 anniversaries simply don't occur on
-- non-leap years — deliberate, no special-casing.
-- Unlike the older per-day RPC this filters visibility = 'public' so
-- soft-archived rows (personhood disposition sets visibility→draft) never
-- surface.
create or replace function public.personalities_anniversaries(
  p_from date,
  p_to date
) returns table (
  id uuid,
  name text,
  slug text,
  image_url text,
  profession text,
  anniversary text,
  occurs_on date,
  years_ago int,
  featured boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,
         p.name,
         p.slug,
         p.image_url,
         p.profession,
         a.kind,
         dd.d,
         (extract(year from dd.d) - extract(year from a.src))::int,
         coalesce(p.is_featured, false)
  from (
    select g::date as d
    from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') g
  ) dd
  cross join public.personalities p
  cross join lateral (
    values ('born', p.birth_date), ('died', p.death_date)
  ) a(kind, src)
  where p.duplicate_of_id is null
    and p.visibility = 'public'
    and a.src is not null
    and extract(month from a.src) = extract(month from dd.d)
    and extract(day   from a.src) = extract(day   from dd.d)
  order by dd.d,
           coalesce(p.is_featured, false) desc,
           (extract(year from dd.d) - extract(year from a.src)),
           p.name;
$$;

revoke all on function public.personalities_anniversaries(date, date) from public;
grant execute on function public.personalities_anniversaries(date, date)
  to anon, authenticated, service_role;
