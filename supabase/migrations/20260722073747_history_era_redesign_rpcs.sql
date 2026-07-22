-- /history editorial redesign (era chapters) — RPC support. Function DDL only,
-- zero table writes.
--
-- 1. milestones_timeline: + image_url/location in the projection (anchor cards)
--    and a new defaulted p_country_label param — the /history country filter
--    works in label space (bulk-imported rows may carry only country_name), so
--    server-side filtering must match coalesce(countries.name, country_name).
--    New arg list -> drop + recreate + re-grant.
-- 2. milestones_year_counts: tiny per-year histogram under the same filters, so
--    the client can sum era counts ("Show all N") without fetching rows.
-- 3. get_milestone: + prev/next (nearest significance>=4 neighbours by
--    (date, id)) for timeline navigation on the detail page.

drop function if exists public.milestones_timeline(date, date, uuid, text, text, int, int, int, text);

create or replace function public.milestones_timeline(
  p_from date default null,
  p_to date default null,
  p_country uuid default null,
  p_category text default null,
  p_impact text default null,
  p_significance_min int default null,
  p_limit int default 100,
  p_offset int default 0,
  p_lang text default null,
  p_country_label text default null
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json order by ord, ord_id), '[]'::jsonb)
  from (
    select m.date as ord, m.id as ord_id,
      jsonb_build_object(
        'id', m.id, 'slug', m.slug,
        'title', coalesce(ct_t.value, m.title),
        'description', left(coalesce(ct_d.value, m.description), 240),
        'date', m.date, 'date_precision', m.date_precision,
        'date_end', m.date_end, 'date_end_precision', m.date_end_precision,
        'category', m.category, 'impact', m.impact, 'significance', m.significance,
        'country_name', m.country_name, 'city_name', m.city_name,
        'location', m.location, 'image_url', m.image_url,
        'is_featured', m.is_featured,
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
    left join public.content_translations ct_t
      on p_lang is not null and ct_t.table_name = 'milestones' and ct_t.record_id = m.id
     and ct_t.field_name = 'title' and ct_t.language = p_lang
    left join public.content_translations ct_d
      on p_lang is not null and ct_d.table_name = 'milestones' and ct_d.record_id = m.id
     and ct_d.field_name = 'description' and ct_d.language = p_lang
    where m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
      and (p_from is null or m.date >= p_from)
      and (p_to is null or m.date <= p_to)
      and (p_country is null or m.country_id = p_country)
      and (p_country_label is null or coalesce(co.name, m.country_name) = p_country_label)
      and (p_category is null or m.category = p_category)
      and (p_impact is null or m.impact = p_impact)
      and (p_significance_min is null or m.significance >= p_significance_min)
    order by m.date asc, m.significance desc, m.title
    limit least(coalesce(p_limit, 100), 4000)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;

revoke all on function public.milestones_timeline(date, date, uuid, text, text, int, int, int, text, text) from public;
grant execute on function public.milestones_timeline(date, date, uuid, text, text, int, int, int, text, text)
  to anon, authenticated, service_role;

create or replace function public.milestones_year_counts(
  p_country_label text default null,
  p_category text default null,
  p_impact text default null
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('y', y, 'n', n) order by y), '[]'::jsonb)
  from (
    select extract(year from m.date)::int as y, count(*)::int as n
    from public.milestones m
    left join public.countries co on co.id = m.country_id
    where m.status = 'published'
      and m.duplicate_of_id is null
      and ((not m.safety_gated) or (select auth.uid()) is not null)
      and (p_country_label is null or coalesce(co.name, m.country_name) = p_country_label)
      and (p_category is null or m.category = p_category)
      and (p_impact is null or m.impact = p_impact)
    group by 1
  ) t;
$$;

revoke all on function public.milestones_year_counts(text, text, text) from public;
grant execute on function public.milestones_year_counts(text, text, text)
  to anon, authenticated, service_role;

create or replace function public.get_milestone(p_slug text, p_lang text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(m)
    || jsonb_build_object(
         'title', coalesce(ct_t.value, m.title),
         'description', coalesce(ct_d.value, m.description),
         'country', case when co.id is not null
           then jsonb_build_object('id', co.id, 'name', co.name, 'code', co.code, 'slug', co.slug)
           end,
         'city', case when ci.id is not null
           then jsonb_build_object('id', ci.id, 'name', ci.name, 'slug', ci.slug)
           end,
         -- Timeline neighbours: nearest major (significance>=4) milestone either
         -- side by (date, id) — powers prev/next navigation on the detail page.
         'prev', (
           select jsonb_build_object(
             'id', p.id, 'slug', p.slug, 'title', p.title,
             'date', p.date, 'date_precision', p.date_precision,
             'category', p.category, 'impact', p.impact, 'significance', p.significance)
           from public.milestones p
           where p.status = 'published' and p.duplicate_of_id is null
             and ((not p.safety_gated) or (select auth.uid()) is not null)
             and p.significance >= 4
             and (p.date, p.id) < (m.date, m.id)
           order by p.date desc, p.id desc
           limit 1
         ),
         'next', (
           select jsonb_build_object(
             'id', n.id, 'slug', n.slug, 'title', n.title,
             'date', n.date, 'date_precision', n.date_precision,
             'category', n.category, 'impact', n.impact, 'significance', n.significance)
           from public.milestones n
           where n.status = 'published' and n.duplicate_of_id is null
             and ((not n.safety_gated) or (select auth.uid()) is not null)
             and n.significance >= 4
             and (n.date, n.id) > (m.date, m.id)
           order by n.date asc, n.id asc
           limit 1
         ),
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
  left join public.content_translations ct_t
    on p_lang is not null and ct_t.table_name = 'milestones' and ct_t.record_id = m.id
   and ct_t.field_name = 'title' and ct_t.language = p_lang
  left join public.content_translations ct_d
    on p_lang is not null and ct_d.table_name = 'milestones' and ct_d.record_id = m.id
   and ct_d.field_name = 'description' and ct_d.language = p_lang
  where m.slug = p_slug
    and m.status = 'published'
    and m.duplicate_of_id is null
    and ((not m.safety_gated) or (select auth.uid()) is not null);
$$;

revoke all on function public.get_milestone(text, text) from public;
grant execute on function public.get_milestone(text, text) to anon, authenticated, service_role;
