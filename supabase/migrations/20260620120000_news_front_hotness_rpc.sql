-- get_news_front: time-decayed "hotness" ranking for the /news front page.
--
-- Replaces the stale `is_featured`-pinned headline (a manual flag that never
-- expired — a March article stayed the permanent headline for months). Ranking
-- is now structural: recency decay (24h half-life) × quality (trust/quality
-- score) × a soft featured boost that only counts while the pin is fresh (<48h)
-- × a mild trending term (views). A weeks-old article decays to ~0 and can never
-- headline again.
--
-- Personalization (optional, signed-in via auth.uid()):
--   tag match  (followed tags + profile interests vs article tags)  x1.4
--   geo match  (caller-supplied country/city ids vs article geo)    x1.25
--   already read (user_news_reads)                                  x0.4
-- Global front ordering uses pure hotness so the hero stays authoritative;
-- p_personalized_only=true filters to interest/geo matches and ranks by the
-- personalized score (powers a "For You" section).
create or replace function public.get_news_front(
  p_limit int default 60,
  p_country_ids uuid[] default null,
  p_city_ids uuid[] default null,
  p_window_days int default 21,
  p_personalized_only boolean default false
)
returns table (
  id uuid, slug text, title text, excerpt text, url text, image_url text,
  author text, published_at timestamptz, source_id uuid, views_count int,
  is_featured boolean, is_premium boolean, country_ids uuid[], city_ids uuid[],
  tags text[], category text, category_canonical text, publisher_name text,
  hotness numeric, personal_score numeric, matches_interest boolean, is_read boolean
)
language sql stable security definer set search_path = public as $$
with v as (select auth.uid() as uid),
followed as (
  select distinct lower(s) as slug from (
    select ut.slug as s from tag_follows tf join unified_tags ut on ut.id = tf.tag_id, v where tf.user_id = v.uid
    union all
    select ut.name as s from tag_follows tf join unified_tags ut on ut.id = tf.tag_id, v where tf.user_id = v.uid
    union all
    select jsonb_array_elements_text(p.interests) as s from profiles p, v
      where p.user_id = v.uid and jsonb_typeof(p.interests) = 'array'
  ) x where s is not null and btrim(s) <> ''
),
followed_arr as (select array_agg(slug) as slugs from followed),
reads as (select unr.article_id from user_news_reads unr, v where unr.user_id = v.uid),
base as (
  select na.id, na.slug, na.title, na.excerpt, na.url, na.image_url, na.author,
    na.published_at, na.source_id, na.views_count, na.is_featured, na.is_premium,
    na.country_ids, na.city_ids, na.tags, na.category, na.category_canonical,
    na.publisher_name, na.trust_score, na.quality_score,
    extract(epoch from (now() - na.published_at))/3600.0 as age_hours
  from news_articles na
  where na.published_at is not null
    and na.content is not null and na.content <> ''
    and na.duplicate_of_id is null
    and coalesce(na.is_premium,false) = false
    and (na.quality_status = 'passed'
         or (na.quality_status is null and (na.quality_score is null or na.quality_score >= 50)))
    and na.published_at > now() - make_interval(days => greatest(1, p_window_days))
),
scored as (
  select b.*,
    (coalesce(b.trust_score, b.quality_score, 50)/100.0)
      * power(0.5, b.age_hours / 24.0)
      * (case when b.is_featured and b.age_hours < 48 then 1.25 else 1.0 end)
      * (1 + least(0.3::numeric, ln(1 + coalesce(b.views_count,0)) / 30.0)) as hotness,
    coalesce(b.tags && (select slugs from followed_arr), false) as tag_match,
    ((p_country_ids is not null and b.country_ids && p_country_ids)
      or (p_city_ids is not null and b.city_ids && p_city_ids)) as geo_match,
    (b.id in (select article_id from reads)) as is_read
  from base b
)
select id, slug, title, excerpt, url, image_url, author, published_at, source_id,
  views_count::int, is_featured, is_premium, country_ids, city_ids, tags, category,
  category_canonical, publisher_name,
  round(hotness::numeric, 5) as hotness,
  round((hotness
    * (case when tag_match then 1.4 else 1.0 end)
    * (case when geo_match then 1.25 else 1.0 end)
    * (case when is_read then 0.4 else 1.0 end))::numeric, 5) as personal_score,
  (tag_match or geo_match) as matches_interest,
  is_read
from scored
where (not p_personalized_only) or tag_match or geo_match
order by (case when p_personalized_only then
    (hotness * (case when tag_match then 1.4 else 1.0 end) * (case when geo_match then 1.25 else 1.0 end) * (case when is_read then 0.4 else 1.0 end))
  else hotness end) desc nulls last
limit greatest(1, p_limit);
$$;

revoke all on function public.get_news_front(int, uuid[], uuid[], int, boolean) from public;
grant execute on function public.get_news_front(int, uuid[], uuid[], int, boolean) to anon, authenticated, service_role;
