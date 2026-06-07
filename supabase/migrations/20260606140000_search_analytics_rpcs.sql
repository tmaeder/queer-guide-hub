-- Search analytics RPCs for /admin/search-intelligence Analytics tab.
-- Reads the existing search_queries log (query, n_results, took_ms, had_rewrite,
-- clicked_entity_id, lang). Read-only aggregation; no new pipeline.

-- Summary KPIs over a window.
create or replace function public.search_analytics_summary(
  p_since timestamptz,
  p_until timestamptz default now()
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total',        count(*),
    'distinct_q',   count(distinct query_normalized),
    'zero_result',  count(*) filter (where n_results = 0),
    'zero_pct',     case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where n_results = 0) / count(*), 1) end,
    'clicked',      count(*) filter (where clicked_entity_id is not null),
    'ctr_pct',      case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where clicked_entity_id is not null) / count(*), 1) end,
    'rewritten',    count(*) filter (where had_rewrite),
    'rewrite_pct',  case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where had_rewrite) / count(*), 1) end,
    'p50_ms',       percentile_disc(0.5) within group (order by took_ms),
    'p95_ms',       percentile_disc(0.95) within group (order by took_ms),
    'langs',        coalesce((
                      select json_agg(l) from (
                        select coalesce(lang, 'unknown') as lang, count(*) as n
                        from search_queries
                        where created_at >= p_since and created_at < p_until
                        group by 1 order by 2 desc limit 12
                      ) l), '[]'::json)
  )
  from search_queries
  where created_at >= p_since and created_at < p_until;
$$;

-- Top queries by volume.
create or replace function public.search_analytics_top_queries(
  p_since timestamptz,
  p_limit int default 50,
  p_until timestamptz default now()
)
returns table (
  query_normalized text,
  n bigint,
  avg_results numeric,
  avg_ms numeric,
  zero_n bigint,
  ctr_pct numeric,
  lang text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    query_normalized,
    count(*) as n,
    round(avg(n_results), 1) as avg_results,
    round(avg(took_ms), 0) as avg_ms,
    count(*) filter (where n_results = 0) as zero_n,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where clicked_entity_id is not null) / count(*), 1) end as ctr_pct,
    (array_agg(lang order by created_at desc))[1] as lang
  from search_queries
  where created_at >= p_since and created_at < p_until
    and query_normalized is not null and query_normalized <> ''
  group by query_normalized
  order by n desc
  limit greatest(p_limit, 1);
$$;

-- Zero-result queries (actionable: candidates for synonyms / content gaps).
create or replace function public.search_analytics_zero_results(
  p_since timestamptz,
  p_limit int default 50,
  p_until timestamptz default now()
)
returns table (
  query_normalized text,
  n bigint,
  lang text,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    query_normalized,
    count(*) as n,
    (array_agg(lang order by created_at desc))[1] as lang,
    max(created_at) as last_seen
  from search_queries
  where created_at >= p_since and created_at < p_until
    and n_results = 0
    and query_normalized is not null and query_normalized <> ''
  group by query_normalized
  order by n desc, last_seen desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.search_analytics_summary(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.search_analytics_top_queries(timestamptz, int, timestamptz) to authenticated, service_role;
grant execute on function public.search_analytics_zero_results(timestamptz, int, timestamptz) to authenticated, service_role;
