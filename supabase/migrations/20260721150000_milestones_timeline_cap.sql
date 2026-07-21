-- Raise milestones_timeline row cap 500 → 2500 ahead of the history-timeline
-- bulk import (~1200 new milestones from schwulengeschichte.ch + Wikipedia).
-- Function body otherwise identical to 20260721130712_milestones_rpcs.sql.
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
    limit least(coalesce(p_limit, 100), 2500)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;

revoke all on function public.milestones_timeline(date, date, uuid, text, text, int, int, int) from public;
grant execute on function public.milestones_timeline(date, date, uuid, text, text, int, int, int)
  to anon, authenticated, service_role;
