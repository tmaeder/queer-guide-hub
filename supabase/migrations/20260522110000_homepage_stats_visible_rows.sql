-- D7: Align get_homepage_stats with the rows the public actually sees.
-- The prior version counted every row in each table — including scraped
-- duplicates and orphan cities — which produced "32,720+ venues / 3,825+
-- cities" on the homepage stat band, contradicting /places (250 countries
-- / 1,000 cities) and the map layer counts (Cities 88 / Countries 250).
--
-- Filter each count by the same predicates the public list pages use:
--   - venues:        duplicate_of_id IS NULL
--   - cities:        duplicate_of_id IS NULL AND country_id IS NOT NULL
--   - events:        duplicate_of_id IS NULL
--   - personalities: duplicate_of_id IS NULL
--   - news_articles: duplicate_of_id IS NULL
--   - marketplace_listings: status = 'active'
--   - countries: unchanged (ISO list, stable at ~250)
-- Other counts (profiles, posts, groups, tags, cms) left untouched until a
-- specific divergence is reported.

create or replace function public.get_homepage_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'venues',        (select count(*) from venues where duplicate_of_id is null),
    'profiles',      (select count(*) from profiles),
    'cities',        (select count(*) from cities where duplicate_of_id is null and country_id is not null),
    'countries',     (select count(*) from countries),
    'events',        (select count(*) from events where duplicate_of_id is null),
    'posts',         (select count(*) from community_posts),
    'personalities', (select count(*) from personalities where duplicate_of_id is null),
    'groups',        (select count(*) from community_groups),
    'tags',          (select count(*) from unified_tags),
    'marketplace',   (select count(*) from marketplace_listings where status = 'active'),
    'news',          (select count(*) from news_articles where duplicate_of_id is null),
    'cms',           (select count(*) from cms_content where deleted_at is null),
    'generated_at',  now()
  );
$$;

revoke all on function public.get_homepage_stats() from public;
grant execute on function public.get_homepage_stats() to anon, authenticated;
