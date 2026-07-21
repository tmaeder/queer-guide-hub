-- Timeline payload trim + cap raise. A concurrent bulk import grew milestones
-- 128 -> 3200+; to_jsonb(m) with full descriptions at a 500-row cap both
-- truncated the timeline (recent history fell out of the date-asc window) and
-- would have shipped multi-MB payloads. Slim explicit projection (240-char
-- description excerpt), cap 4000. Same signature -> in-place replace.
create or replace function public.milestones_timeline(
  p_from date default null,
  p_to date default null,
  p_country uuid default null,
  p_category text default null,
  p_impact text default null,
  p_significance_min int default null,
  p_limit int default 100,
  p_offset int default 0,
  p_lang text default null
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
  from (
    select m.date as ord,
      jsonb_build_object(
        'id', m.id, 'slug', m.slug,
        'title', coalesce(ct_t.value, m.title),
        'description', left(coalesce(ct_d.value, m.description), 240),
        'date', m.date, 'date_precision', m.date_precision,
        'date_end', m.date_end, 'date_end_precision', m.date_end_precision,
        'category', m.category, 'impact', m.impact, 'significance', m.significance,
        'country_name', m.country_name, 'city_name', m.city_name,
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
      and (p_category is null or m.category = p_category)
      and (p_impact is null or m.impact = p_impact)
      and (p_significance_min is null or m.significance >= p_significance_min)
    order by m.date asc, m.significance desc, m.title
    limit least(coalesce(p_limit, 100), 4000)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;

revoke all on function public.milestones_timeline(date, date, uuid, text, text, int, int, int, text) from public;
grant execute on function public.milestones_timeline(date, date, uuid, text, text, int, int, int, text)
  to anon, authenticated, service_role;
