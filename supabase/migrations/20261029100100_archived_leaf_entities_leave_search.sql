-- Archived hotels/news/groups leave search; and 45 ghost villages leave it too.
--
-- RLS (previous migration) covers every PostgREST read. It does NOT cover:
--   * SECURITY DEFINER functions, which is what the search indexers and the
--     anon-callable news RPCs are;
--   * the Cloudflare Pages Functions, which read with the service role.
-- The service-role half lives in functions/_lib/detail.ts and the sitemaps.
-- This migration is the SQL half.
--
-- `search_documents` visibility IS the indexer's WHERE clause — search_hybrid
-- never rejoins the source table, so a row that stays indexed stays findable no
-- matter what the source row says. `search_reindex_drain` deletes before it
-- reindexes, so narrowing a WHERE only evicts rows that get written again;
-- the existing archived/ghost rows have to be evicted explicitly.
--
-- Every function below is copied from the LIVE definition (pg_get_functiondef)
-- rather than from the repo file, because the repo copy has drifted from prod
-- before — 20261016110000 found the committed cities indexer missing
-- `i18n_to_tsv` and carrying an `embedding` column prod had dropped. The ONLY
-- edit in each is the added predicate, marked <<< ADDED.

-- ---------------------------------------------------------------------------
-- news
-- ---------------------------------------------------------------------------
create or replace function public.search_documents_index_news(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'news:'||n.id, 'news', n.id, n.title, n.excerpt,
       setweight(to_tsvector('simple', unaccent(coalesce(n.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(coalesce(n.category_canonical,n.category),''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(n.excerpt,''))),'D')
    || public.i18n_to_tsv(n.title_i18n,'A'),
    jsonb_strip_nulls(jsonb_build_object(
      'category', coalesce(n.category_canonical, n.category),
      'is_featured', n.is_featured,
      'tags', to_jsonb(n.tags))),
    null::geography,
    null::smallint, 'live', coalesce(n.is_featured,false), n.quality_score, null::timestamptz,
    n.published_at, null::timestamptz, null::boolean, null::numeric, null::numeric,
    n.slug, n.image_url, null::text, null::text, null::text, now()
  from public.news_articles n
  left join public.content_embeddings ce on ce.content_type='news' and ce.content_id=n.id
  where n.duplicate_of_id is null
    -- Same visibility predicate as the public news queries (useNews /
    -- get_news_front): rejected/review articles must not be searchable.
    and (n.quality_status = 'passed'
         or (n.quality_status is null and (n.quality_score is null or n.quality_score >= 50)))
    and n.archived_at is null                                        -- <<< ADDED
    and (p_id is null or n.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create or replace function public.search_documents_index_groups(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'group:'||g.id, 'group', g.id, g.name, g.description,
       setweight(to_tsvector('simple', unaccent(coalesce(g.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.city,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(g.tags,' '),''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.description,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'tags', to_jsonb(g.tags), 'is_featured', g.featured,
      'member_count', g.member_count, 'city', g.city)),
    null::geography,
    null::smallint, 'live', coalesce(g.featured,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    null::text, g.image_url, g.city, null::text, null::text, now()
  from public.community_groups g
  where g.is_private = false and g.duplicate_of_id is null
    and g.archived_at is null                                        -- <<< ADDED
    and (p_id is null or g.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- ---------------------------------------------------------------------------
-- villages — a PRE-EXISTING defect this work surfaced, not a consequence of it.
--
-- The indexer filtered `duplicate_of_id` and nothing else, so `shell_status`
-- never reached search. Measured on prod before this migration: 45 of the 176
-- villages in search_documents (26%) are ghosts. `sitemap-villages.xml` and the
-- crawler already exclude them and all 45 carry seo_indexable=false, so they
-- were invisible to Google and fully findable in site search — the reader-facing
-- half of the gate was the half that was missing.
--
-- This is character-for-character the cities defect fixed in 20261016110000,
-- one entity later, and it is also why archive_entity('queer_village', …) —
-- which writes exactly this shell_status='ghost' — did not remove a village
-- from search. 'merged' is included for symmetry with the cities predicate;
-- queer_villages_shell_status_check currently admits only ('real','ghost'), so
-- that arm is inert today and stays correct if the CHECK is ever widened.
-- ---------------------------------------------------------------------------
create or replace function public.search_documents_index_villages(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'queer_village:'||v.id, 'queer_village', v.id, v.name, v.description,
       setweight(to_tsvector('simple', unaccent(coalesce(v.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(v.description,''))),'D')
    || public.i18n_to_tsv(v.name_i18n,'A') || public.i18n_to_tsv(v.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'city', ci.name, 'country', co.name, 'is_featured', v.featured,
      'tags', to_jsonb(v.tags))),
    case when v.latitude is not null and v.longitude is not null then st_setsrid(st_makepoint(v.longitude::float8, v.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(v.featured,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    v.slug, coalesce(v.image_url, (v.images)[1]), ci.name, co.name, null::text, now()
  from public.queer_villages v
  left join public.cities ci on ci.id = v.city_id
  left join public.countries co on co.id = v.country_id
  left join public.content_embeddings ce on ce.content_type='queer_village' and ce.content_id=v.id
  where v.duplicate_of_id is null
    and coalesce(v.shell_status::text, 'real') not in ('ghost', 'merged')   -- <<< ADDED
    and (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- One-shot eviction. Narrowing a WHERE is self-healing only for rows that are
-- written again; nothing rewrites a row that no longer qualifies.
delete from public.search_documents sd
 using public.queer_villages v
 where sd.entity_type = 'queer_village'
   and v.id = sd.entity_id
   and coalesce(v.shell_status::text, 'real') in ('ghost', 'merged');

-- ---------------------------------------------------------------------------
-- ...and make the eviction self-healing, which it currently is NOT.
--
-- A narrowed WHERE only bites when something enqueues the row:
-- search_reindex_drain deletes the doc and re-runs the indexer, so a row that
-- no longer qualifies stays out. Two tables never enqueue:
--
--   * `queer_villages` has NO search trigger at all. That is why 45 ghosts
--     accumulated in the first place — `run_village_trust_recompute` routes a
--     village to 'ghost' nightly and nothing told search. Without this the
--     one-shot delete above would be undone by the next ghosting.
--   * `community_groups` has a COLUMN-SCOPED trigger whose list predates
--     `archived_at`, so archiving a group would change the row and enqueue
--     nothing — the archived group would stay searchable forever.
--
-- The village trigger is deliberately UNSCOPED. Its indexer reads fifteen
-- columns, and a scoped list is exactly the trap the groups trigger just
-- sprang: it is correct on the day it is written and silently wrong at the
-- next column. 190 villages make the cost of over-firing irrelevant.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_search_documents_village on public.queer_villages;
create trigger trg_search_documents_village
  after insert or delete or update on public.queer_villages
  for each row execute function public.search_documents_sync('queer_village');

drop trigger if exists trg_search_documents_group on public.community_groups;
create trigger trg_search_documents_group
  after insert or delete or update of
    name, description, image_url, tags, is_private, featured, city,
    duplicate_of_id, archived_at
  on public.community_groups
  for each row execute function public.search_documents_sync('group');

-- Assert the coupling rather than trusting the list above stays right: every
-- table that now carries `archived_at` must have a search trigger that fires on
-- it (or no search trigger at all, as with hotels, which are not indexed).
do $$
declare
  v_tbl text;
  v_ok  boolean;
begin
  foreach v_tbl in array array['news_articles', 'community_groups'] loop
    -- CASE, not `tgattr::text = '' OR exists(...)`. SQL does not guarantee OR
    -- short-circuits, and for an UNSCOPED trigger `tgattr::text` is '', so
    -- string_to_array('', ' ') yields {''} and ''::smallint raises 22P02. The
    -- OR form passed when tested, which is exactly the kind of accident a
    -- planner change takes away — inside a migration that gates the whole
    -- deploy queue.
    select bool_or(
             case
               when t.tgattr::text = '' then true   -- unscoped: fires on every column
               else exists (
                 select 1 from unnest(string_to_array(t.tgattr::text, ' ')) a
                 join pg_attribute att
                   on att.attrelid = t.tgrelid and att.attnum = a::smallint
                 where att.attname = 'archived_at'
               )
             end)
      into v_ok
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl
       and not t.tgisinternal
       and pg_get_triggerdef(t.oid) ~* 'search_documents_sync';

    if coalesce(v_ok, false) is false then
      raise exception
        '% has a search sync trigger that does not fire on archived_at — archiving a row there would leave it in search_documents forever', v_tbl;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The anon-callable news RPCs. All SECURITY DEFINER, so RLS does not apply and
-- each needs the predicate restated. Bodies are verbatim from prod; the only
-- edit is the archived clause.
-- ---------------------------------------------------------------------------

create or replace function public.news_authors_with_articles()
 returns table(author text, article_count bigint)
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select author, count(*) as article_count
  from public.news_articles
  where author is not null
    and author <> ''
    and quality_status = 'passed'
    and duplicate_of_id is null
    and archived_at is null                                          -- <<< ADDED
  group by author
  having count(*) >= 2
  order by article_count desc
  limit 200;
$function$;

create or replace function public.news_cities_with_articles()
 returns table(id uuid, name text, article_count bigint)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with city_counts as (
    select unnest(city_ids) as city_id, count(*)::bigint as n
      from public.news_articles
     where (quality_status is null or quality_status = 'passed')
       and city_ids is not null
       and array_length(city_ids, 1) > 0
       and archived_at is null                                       -- <<< ADDED
     group by 1
  )
  select c.id, c.name, cc.n as article_count
    from city_counts cc
    join public.cities c on c.id = cc.city_id
   order by c.name;
$function$;

create or replace function public.news_countries_with_articles()
 returns table(id uuid, name text, article_count bigint)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with country_counts as (
    select unnest(country_ids) as country_id, count(*)::bigint as n
      from public.news_articles
     where (quality_status is null or quality_status = 'passed')
       and country_ids is not null
       and array_length(country_ids, 1) > 0
       and archived_at is null                                       -- <<< ADDED
     group by 1
  )
  select c.id, c.name, cc.n as article_count
    from country_counts cc
    join public.countries c on c.id = cc.country_id
   order by c.name;
$function$;

create or replace function public.news_languages_with_articles()
 returns table(language text, article_count bigint)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select na.content_language as language, count(*) as article_count
  from public.news_articles na
  where na.content_language is not null
    and na.published_at is not null
    and na.content is not null and na.content <> ''
    and na.duplicate_of_id is null
    and na.archived_at is null                                       -- <<< ADDED
    and (na.quality_status = 'passed'
         or (na.quality_status is null and (na.quality_score is null or na.quality_score >= 50)))
  group by na.content_language
  order by count(*) desc;
$function$;

create or replace function public.organization_articles(p_org_id uuid, p_limit integer default 24, p_offset integer default 0)
 returns setof news_articles
 language sql stable security definer
 set search_path to 'public'
as $function$
  select a.* from news_articles a
  join news_sources s on s.id = a.source_id
  where s.organization_id = p_org_id and a.duplicate_of_id is null
    and a.archived_at is null                                        -- <<< ADDED
  order by a.published_at desc nulls last
  limit greatest(0, least(coalesce(p_limit,24), 60)) offset greatest(0, coalesce(p_offset,0));
$function$;

-- Counts on the homepage. Low stakes next to the reads above, but an archived
-- row that still counts is the same lie in miniature.
create or replace function public.get_homepage_stats()
 returns jsonb
 language sql stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'venues',          (select count(*) from venues where duplicate_of_id is null),
    'profiles',        (select count(*) from profiles),
    'cities',          (select count(*) from cities where duplicate_of_id is null and country_id is not null),
    'countries',       (select count(*) from countries),
    'events',          (select count(*) from events where duplicate_of_id is null),
    'events_upcoming', (select count(*) from events
                         where duplicate_of_id is null
                           and start_date >= now()),
    'posts',           (select count(*) from community_posts),
    'personalities',   (select count(*) from personalities where duplicate_of_id is null),
    'groups',          (select count(*) from community_groups where archived_at is null),  -- <<< ADDED
    'tags',            (select count(*) from unified_tags),
    'marketplace',     (select count(*) from marketplace_listings where status = 'active'),
    'news',            (select count(*) from news_articles where duplicate_of_id is null
                          and archived_at is null),                  -- <<< ADDED
    'cms',             (select count(*) from cms_content where deleted_at is null),
    'generated_at',    now()
  );
$function$;
