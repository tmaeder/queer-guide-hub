-- Tags as a first-class discovery axis — Phase 3.
--
-- Extend the search_documents index builders so facets->'tags' is populated for
-- news, marketplace, personalities and queer_villages (venues/events/groups
-- already had it). This lets the existing tag filter + tag facet in
-- search_hybrid / search_facets work across every content type, not just
-- venues + events.
--
-- Reconciliation strategy (see CLAUDE.md): read-time UNION, no source-table
-- backfill. The tag→entity link lives in two systems — array columns
-- (news/personalities/villages) and the generic junction
-- unified_tag_assignments (marketplace). A normalizing view reconciles the
-- junction's dirty entity_type vocabulary so the marketplace builder can read it
-- with the canonical type name.
--
-- The facets backfill itself is run separately (per-type, off-peak, VACUUM
-- between) by calling these builders directly — they INSERT ... ON CONFLICT DO
-- UPDATE straight into search_documents, bypassing the entity-table reindex
-- triggers, and search_documents has no triggers of its own.

-- ── Normalizing view over the dirty junction entity_type vocabulary ──────────
create or replace view public.tag_assignments_norm as
select
  uta.tag_id,
  uta.entity_id,
  case uta.entity_type
    when 'venues'              then 'venue'
    when 'events'              then 'event'
    when 'news_article'        then 'news'
    when 'community_group'     then 'group'
    when 'marketplace_listing' then 'marketplace'
    else uta.entity_type
  end as entity_type
from public.unified_tag_assignments uta;

comment on view public.tag_assignments_norm is
  'unified_tag_assignments with entity_type normalized to the canonical search_documents vocabulary (venue/event/news/group/…). Read-only reconciliation point for tag→entity reads.';

-- ── News: array column news_articles.tags ────────────────────────────────────
create or replace function public.search_documents_index_news(p_id uuid default null)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp'
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
  where n.duplicate_of_id is null and (p_id is null or n.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, start_date=excluded.start_date,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$function$;

-- ── Personalities: array column personalities.tags ───────────────────────────
create or replace function public.search_documents_index_personalities(p_id uuid default null)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'personality:'||p.id, 'personality', p.id, p.name, coalesce(p.description, p.bio),
       setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.profession,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.nationality,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.lgbti_connection,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.description, p.bio, ''))),'D')
    || public.i18n_to_tsv(p.name_i18n,'A') || public.i18n_to_tsv(p.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'profession', p.profession, 'nationality', p.nationality,
      'is_living', p.is_living, 'is_featured', p.is_featured,
      'tags', to_jsonb(p.tags))),
    null::geography,
    null::smallint, 'live', coalesce(p.is_featured,false), p.quality_score, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    p.slug, p.image_url, null::text, p.nationality, null::text, now()
  from public.personalities p
  left join public.content_embeddings ce on ce.content_type='personality' and ce.content_id=p.id
  where p.duplicate_of_id is null
    and p.visibility = 'public'
    and (p_id is null or p.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url,
    country=excluded.country, updated_at=now();
$function$;

-- ── Queer villages: array column queer_villages.tags ─────────────────────────
create or replace function public.search_documents_index_villages(p_id uuid default null)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp'
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
  where (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, slug=excluded.slug, image_url=excluded.image_url,
    city=excluded.city, country=excluded.country, updated_at=now();
$function$;

-- ── Marketplace: no array column — read slugs from the junction ──────────────
create or replace function public.search_documents_index_marketplace(p_id uuid default null)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'marketplace:'||m.id, 'marketplace', m.id, m.title, m.description,
       setweight(to_tsvector('simple', unaccent(coalesce(m.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.business_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.brand,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.subcategory,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.description,''))),'D')
    || public.i18n_to_tsv(m.title_i18n,'A') || public.i18n_to_tsv(m.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object('category', m.category, 'subcategory', m.subcategory,
      'business_type', m.business_type, 'merchant_domain', m.merchant_domain, 'is_featured', m.featured,
      'tags', (select to_jsonb(array_agg(distinct t.slug))
               from public.tag_assignments_norm a
               join public.unified_tags t on t.id = a.tag_id
               where a.entity_id = m.id and a.entity_type = 'marketplace' and t.slug is not null))),
    null::geography,
    null::smallint, case when m.status='active' then 'live' else 'unknown' end, coalesce(m.featured,false), m.quality_score, m.deprecated_at,
    null::timestamptz, null::timestamptz, false, coalesce(m.price_usd, m.price), coalesce(m.price_usd, m.price),
    m.slug, (m.images)[1], null::text, null::text, null::text, now()
  from public.marketplace_listings m
  left join public.content_embeddings ce on ce.content_type='marketplace' and ce.content_id=m.id
  where coalesce(m.status,'active')='active' and (p_id is null or m.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    price_min=excluded.price_min, price_max=excluded.price_max,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$function$;
