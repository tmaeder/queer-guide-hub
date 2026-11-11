-- Contextual reporting for /rights. Legal status remains sourced exclusively
-- from the countries/ILGA dataset; this RPC only ranks already-public news.

create or replace function public.get_rights_news(
  p_topic_tags text[],
  p_country_id uuid default null,
  p_limit integer default 6,
  p_recent_days integer default 30,
  p_max_days integer default 180
)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  image_url text,
  published_at timestamptz,
  publisher_name text,
  source_id uuid,
  country_ids uuid[],
  tags text[],
  content_language text,
  title_i18n jsonb,
  matched_tags text[],
  relevance_tier text,
  is_local boolean,
  story_slug text,
  story_title text,
  story_article_count integer
)
language sql
stable
security invoker
set search_path = public
as $function$
  with candidates as (
    select
      a.id,
      a.slug,
      a.title,
      a.excerpt,
      a.image_url,
      a.published_at,
      a.publisher_name,
      a.source_id,
      coalesce(a.country_ids, '{}'::uuid[]) as country_ids,
      coalesce(a.tags, '{}'::text[]) as tags,
      a.content_language,
      a.title_i18n,
      array(
        select tag
        from unnest(coalesce(a.tags, '{}'::text[])) as tag
        where tag = any(coalesce(p_topic_tags, '{}'::text[]))
        order by tag
      ) as matched_tags,
      coalesce(a.country_ids, '{}'::uuid[]) @> array[p_country_id]::uuid[]
        and p_country_id is not null as is_local,
      story.slug as story_slug,
      story.title as story_title,
      coalesce(story.article_count, 1) as story_article_count,
      story.id as story_id,
      case
        when coalesce(a.tags, '{}'::text[]) && coalesce(p_topic_tags, '{}'::text[])
          and p_country_id is not null
          and coalesce(a.country_ids, '{}'::uuid[]) @> array[p_country_id]::uuid[]
          and a.published_at >= now() - make_interval(days => greatest(1, p_recent_days))
          then 1
        when coalesce(a.tags, '{}'::text[]) && coalesce(p_topic_tags, '{}'::text[])
          and a.published_at >= now() - make_interval(days => greatest(1, p_recent_days))
          then 2
        when coalesce(a.tags, '{}'::text[]) && coalesce(p_topic_tags, '{}'::text[])
          then 3
        else 4
      end as tier,
      coalesce(a.quality_score, 50)::numeric
        + coalesce(a.trust_score, 0)::numeric * 10
        + coalesce(a.lgbti_relevance_score, a.relevance_score, 0)::numeric * 10
        + least(ln(1 + greatest(coalesce(a.views_count, 0), 0)), 8)::numeric
        as quality_rank
    from public.news_articles a
    left join lateral (
      select s.id, s.slug, s.title, s.article_count
      from public.news_story_articles sa
      join public.news_stories s on s.id = sa.story_id
      where sa.article_id = a.id
      order by s.article_count desc, s.last_updated_at desc, s.id
      limit 1
    ) story on true
    where a.archived_at is null
      and a.duplicate_of_id is null
      and a.published_at >= now() - make_interval(days => greatest(p_recent_days, p_max_days, 1))
      and a.content is not null
      and a.content <> ''
      and (
        a.quality_status = 'passed'
        or (
          a.quality_status is null
          and (a.quality_score is null or a.quality_score >= 50)
        )
      )
      and (
        coalesce(a.tags, '{}'::text[]) && coalesce(p_topic_tags, '{}'::text[])
        or (
          a.category_canonical = 'rights-legal'
          and a.published_at >= now() - make_interval(days => greatest(1, p_recent_days))
        )
      )
  ),
  story_collapsed as (
    select c.*,
      row_number() over (
        partition by coalesce(c.story_id, c.id)
        order by c.tier, c.quality_rank desc, c.published_at desc, c.id
      ) as story_rank
    from candidates c
  ),
  publisher_ranked as (
    select c.*,
      row_number() over (
        partition by coalesce(nullif(lower(c.publisher_name), ''), c.source_id::text, c.id::text)
        order by c.tier, c.quality_rank desc, c.published_at desc, c.id
      ) as publisher_rank
    from story_collapsed c
    where c.story_rank = 1
  )
  select
    c.id,
    c.slug,
    c.title,
    c.excerpt,
    c.image_url,
    c.published_at,
    c.publisher_name,
    c.source_id,
    c.country_ids,
    c.tags,
    c.content_language,
    c.title_i18n,
    c.matched_tags,
    case c.tier
      when 1 then 'topic-local-recent'
      when 2 then 'topic-global-recent'
      when 3 then 'topic-global-older'
      else 'rights-general-recent'
    end as relevance_tier,
    c.is_local,
    c.story_slug,
    c.story_title,
    c.story_article_count
  from publisher_ranked c
  order by
    case when c.publisher_rank <= 2 then 0 else 1 end,
    c.tier,
    c.quality_rank desc,
    c.published_at desc,
    c.id
  limit least(greatest(p_limit, 1), 12);
$function$;

comment on function public.get_rights_news(text[], uuid, integer, integer, integer) is
  'Ranks public news as context for one /rights topic: topic/local/recent first, transparent rights-legal fallback last, one representative per story, and publisher diversity before same-source backfill.';

revoke all on function public.get_rights_news(text[], uuid, integer, integer, integer) from public;
grant execute on function public.get_rights_news(text[], uuid, integer, integer, integer) to anon, authenticated;
