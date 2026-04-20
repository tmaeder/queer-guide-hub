-- Consolidated homepage stats RPC.
-- Replaces 12 client-side `count: 'exact'` queries that returned null under
-- restrictive RLS (anon role) and collapsed to 0 on the homepage.
-- SECURITY DEFINER is safe here: only aggregate counts are returned, no rows.

create or replace function public.get_homepage_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'venues',        (select count(*) from venues),
    'profiles',      (select count(*) from profiles),
    'cities',        (select count(*) from cities),
    'countries',     (select count(*) from countries),
    'events',        (select count(*) from events),
    'posts',         (select count(*) from community_posts),
    'personalities', (select count(*) from personalities),
    'groups',        (select count(*) from community_groups),
    'tags',          (select count(*) from unified_tags),
    'marketplace',   (select count(*) from marketplace_listings),
    'news',          (select count(*) from news_articles),
    'cms',           (select count(*) from cms_content where deleted_at is null),
    'generated_at',  now()
  );
$$;

revoke all on function public.get_homepage_stats() from public;
grant execute on function public.get_homepage_stats() to anon, authenticated;
