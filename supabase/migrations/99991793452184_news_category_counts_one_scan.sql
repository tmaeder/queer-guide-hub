-- get_news_category_counts(): every news tab badge, and the total, in ONE scan.
--
-- useNewsCategoryCounts() (src/hooks/useNews.tsx) used to send one
-- `count: 'exact', head: true` request for the total plus one per active
-- category (13 on 2026-10-31), on every load of /news and /news/archive. Each
-- re-applied the visibility filters, and `content <> ''` makes every one read
-- the article bodies. Measured from pg_stat_statements on 2026-10-31: that
-- count shape had run 17,017 times at a mean of 908 ms (max 2,999 ms, the
-- anon role's 3s statement_timeout), about 4.3 hours of database time, and it
-- was the largest single source of statement timeouts (705 of ~1,600 in 24h).
-- A timed-out count reaches the client as HTTP 500 and the badge shows 0.
--
-- Semantics are the old per-tab filter exactly: an article counts for slug s
-- when category_canonical = s OR category = s. About 40k visible articles have
-- a legacy `category` that differs from `category_canonical`, so each article
-- is counted under BOTH of its values (once, when they are equal). A plain
-- GROUP BY on one column would change most badges.
--
-- The visibility filters mirror fetchNewsArticles / the old hook verbatim.
-- SECURITY INVOKER, so news_articles RLS applies to anon exactly as it did to
-- the per-tab PostgREST counts.

create or replace function public.get_news_category_counts()
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with v as (
    select a.category_canonical, a.category
    from public.news_articles a
    where a.published_at is not null
      and a.content is not null
      and a.content <> ''
      and (a.quality_status = 'passed'
           or (a.quality_status is null
               and (a.quality_score is null or a.quality_score >= 50)))
      and a.duplicate_of_id is null
  ),
  per_slug as (
    select s.slug, count(*) as n
    from v
    cross join lateral (
      select distinct x as slug
      from unnest(array[v.category_canonical, v.category]) as x
      where x is not null
    ) s
    group by s.slug
  )
  select jsonb_build_object(
    'total', (select count(*) from v),
    'counts', coalesce((select jsonb_object_agg(slug, n) from per_slug), '{}'::jsonb)
  );
$function$;

revoke all on function public.get_news_category_counts() from public;
grant execute on function public.get_news_category_counts() to anon, authenticated, service_role;
