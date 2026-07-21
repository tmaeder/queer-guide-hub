-- Milestones spine (2/3): public read RPCs.
--
-- All SECURITY DEFINER (bypass RLS) → every function filters visibility itself:
-- status='published' AND duplicate_of_id IS NULL AND (NOT safety_gated OR
-- (select auth.uid()) IS NOT NULL). Explicit grants required (this project
-- revokes default EXECUTE — missing grants surface as 403s in the frontend).

-- ---------------------------------------------------------------------------
-- milestones_timeline — the /history timeline + country strips
-- ---------------------------------------------------------------------------
create or replace function public.milestones_timeline(
  p_from date default null,
  p_to date default null,
  p_country uuid default null,
  p_category text default null,
  p_impact text default null,
  p_significance_min int default null,
  p_limit int default 100,
  p_offset int default 0
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
  from (
    select m.date as ord,
      to_jsonb(m)
        || jsonb_build_object(
             'country', case when co.id is not null
               then jsonb_build_object('id', co.id, 'name', co.name, 'code', co.code, 'slug', co.slug)
               end,
             'city', case when ci.id is not null
               then jsonb_build_object('id', ci.id, 'name', ci.name, 'slug', ci.slug)
               end
           ) as row_json
    from public.milestones m
    left join public.countries co on co.id = m.country_id
    left join public.cities ci on ci.id = m.city_id
    where m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
      and (p_from is null or m.date >= p_from)
      and (p_to is null or m.date <= p_to)
      and (p_country is null or m.country_id = p_country)
      and (p_category is null or m.category = p_category)
      and (p_impact is null or m.impact = p_impact)
      and (p_significance_min is null or m.significance >= p_significance_min)
    order by m.date asc, m.significance desc, m.title
    limit least(coalesce(p_limit, 100), 500)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;

revoke all on function public.milestones_timeline(date, date, uuid, text, text, int, int, int) from public;
grant execute on function public.milestones_timeline(date, date, uuid, text, text, int, int, int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- milestones_on_this_day — homepage rail + DayView
-- ---------------------------------------------------------------------------
create or replace function public.milestones_on_this_day(
  p_today date default current_date,
  p_limit int default 12
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id, 'slug', m.slug, 'title', m.title,
      'date', m.date, 'category', m.category, 'impact', m.impact,
      'significance', m.significance,
      'country_name', coalesce(co.name, m.country_name),
      'city_name', coalesce(ci.name, m.city_name),
      'years_ago', (extract(year from p_today) - extract(year from m.date))::int,
      'is_featured', m.is_featured
    ) as row_json
    from public.milestones m
    left join public.countries co on co.id = m.country_id
    left join public.cities ci on ci.id = m.city_id
    where m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
      and m.date_precision = 'day'
      and extract(month from m.date) = extract(month from p_today)
      and extract(day from m.date) = extract(day from p_today)
      and m.date < p_today
    order by m.is_featured desc, m.significance desc, m.date
    limit least(coalesce(p_limit, 12), 50)
  ) t;
$$;

revoke all on function public.milestones_on_this_day(date, int) from public;
grant execute on function public.milestones_on_this_day(date, int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- milestones_anniversaries — unified-calendar "queer history" layer
-- (mirror of personalities_anniversaries: 62-day cap, day-precision only —
-- month/year-precision dates on a specific calendar day would be false precision)
-- ---------------------------------------------------------------------------
create or replace function public.milestones_anniversaries(
  p_from date,
  p_to date
) returns table (
  id uuid,
  title text,
  slug text,
  category text,
  impact text,
  significance smallint,
  occurs_on date,
  years_ago int,
  featured boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select m.id,
         m.title,
         m.slug,
         m.category,
         m.impact,
         m.significance,
         dd.d,
         (extract(year from dd.d) - extract(year from m.date))::int,
         m.is_featured
  from (
    select g::date as d
    from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') g
  ) dd
  cross join public.milestones m
  where m.status = 'published'
    and m.duplicate_of_id is null
    and ((not m.safety_gated) or (select auth.uid()) is not null)
    and m.date_precision = 'day'
    and m.date < dd.d
    and extract(month from m.date) = extract(month from dd.d)
    and extract(day   from m.date) = extract(day   from dd.d)
  order by dd.d, m.is_featured desc, m.significance desc, m.title;
$$;

revoke all on function public.milestones_anniversaries(date, date) from public;
grant execute on function public.milestones_anniversaries(date, date)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_milestone — detail aggregation with resolved links
-- ---------------------------------------------------------------------------
create or replace function public.get_milestone(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(m)
    || jsonb_build_object(
         'country', case when co.id is not null
           then jsonb_build_object('id', co.id, 'name', co.name, 'code', co.code, 'slug', co.slug)
           end,
         'city', case when ci.id is not null
           then jsonb_build_object('id', ci.id, 'name', ci.name, 'slug', ci.slug)
           end,
         'links', coalesce((
           select jsonb_agg(l order by (l->>'sort_order')::int, l->>'name')
           from (
             select jsonb_build_object(
               'entity_type', ml.entity_type, 'entity_id', ml.entity_id,
               'role', ml.role, 'sort_order', ml.sort_order,
               'name', p.name, 'slug', p.slug, 'image_url', p.image_url) as l
             from public.milestone_links ml
             join public.personalities p on p.id = ml.entity_id
             where ml.milestone_id = m.id and ml.entity_type = 'personality'
               and p.duplicate_of_id is null and p.visibility = 'public'
             union all
             select jsonb_build_object(
               'entity_type', ml.entity_type, 'entity_id', ml.entity_id,
               'role', ml.role, 'sort_order', ml.sort_order,
               'name', e.title, 'slug', e.slug, 'image_url', coalesce(e.logo_url, e.images[1]))
             from public.milestone_links ml
             join public.events e on e.id = ml.entity_id
             where ml.milestone_id = m.id and ml.entity_type = 'event'
               and e.duplicate_of_id is null
             union all
             select jsonb_build_object(
               'entity_type', ml.entity_type, 'entity_id', ml.entity_id,
               'role', ml.role, 'sort_order', ml.sort_order,
               'name', v.name, 'slug', v.slug, 'image_url', v.images[1])
             from public.milestone_links ml
             join public.venues v on v.id = ml.entity_id
             where ml.milestone_id = m.id and ml.entity_type = 'venue'
               and v.duplicate_of_id is null
             union all
             select jsonb_build_object(
               'entity_type', ml.entity_type, 'entity_id', ml.entity_id,
               'role', ml.role, 'sort_order', ml.sort_order,
               'name', n.title, 'slug', n.slug, 'image_url', n.image_url)
             from public.milestone_links ml
             join public.news_articles n on n.id = ml.entity_id
             where ml.milestone_id = m.id and ml.entity_type = 'news'
             union all
             select jsonb_build_object(
               'entity_type', ml.entity_type, 'entity_id', ml.entity_id,
               'role', ml.role, 'sort_order', ml.sort_order,
               'name', o.name, 'slug', o.slug, 'image_url', coalesce(o.logo_url, o.cover_image_url))
             from public.milestone_links ml
             join public.organizations o on o.id = ml.entity_id
             where ml.milestone_id = m.id and ml.entity_type = 'organization'
               and o.status = 'active'
           ) links(l)
         ), '[]'::jsonb)
       )
  from public.milestones m
  left join public.countries co on co.id = m.country_id
  left join public.cities ci on ci.id = m.city_id
  where m.slug = p_slug
    and m.status = 'published'
    and m.duplicate_of_id is null
    and ((not m.safety_gated) or (select auth.uid()) is not null);
$$;

revoke all on function public.get_milestone(text) from public;
grant execute on function public.get_milestone(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- milestones_for_entity — entity-page embeds (personality detail etc.)
-- ---------------------------------------------------------------------------
create or replace function public.milestones_for_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_limit int default 12
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
  from (
    select m.date as ord,
      jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'title', m.title,
        'date', m.date, 'date_precision', m.date_precision,
        'category', m.category, 'impact', m.impact, 'significance', m.significance,
        'country_name', coalesce(co.name, m.country_name),
        'role', ml.role
      ) as row_json
    from public.milestone_links ml
    join public.milestones m on m.id = ml.milestone_id
    left join public.countries co on co.id = m.country_id
    where ml.entity_type = p_entity_type
      and ml.entity_id = p_entity_id
      and m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
    order by m.date asc
    limit least(coalesce(p_limit, 12), 50)
  ) t;
$$;

revoke all on function public.milestones_for_entity(text, uuid, int) from public;
grant execute on function public.milestones_for_entity(text, uuid, int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- milestones_for_country — country/city rights-tab "legal history" strip
-- (top by significance, capped; the full filtered timeline lives at /history)
-- ---------------------------------------------------------------------------
create or replace function public.milestones_for_country(
  p_country_id uuid,
  p_limit int default 20
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
  from (
    select m.date as ord,
      jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'title', m.title,
        'date', m.date, 'date_precision', m.date_precision,
        'category', m.category, 'impact', m.impact, 'significance', m.significance
      ) as row_json
    from public.milestones m
    where m.country_id = p_country_id
      and m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
    order by m.significance desc, m.date asc
    limit least(coalesce(p_limit, 20), 50)
  ) t;
$$;

revoke all on function public.milestones_for_country(uuid, int) from public;
grant execute on function public.milestones_for_country(uuid, int)
  to anon, authenticated, service_role;
