-- ============================================================================
-- Multilingual full-text search — index translated content into search_documents
-- ----------------------------------------------------------------------------
-- The 9 search_documents_index_<type>() functions built their tsvector from the
-- ENGLISH base columns only, so a query in German/French/etc never matched the
-- translated content populated by translate-i18n-batch (the *_i18n JSONB maps).
--
-- This adds the translated text to each function's tsvector via the helper
-- i18n_to_tsv(jsonb, weight): all locale values concatenated, to_tsvector('simple',
-- unaccent(...)) so there is no single-language stemming mismatch across the 10
-- UI locales. Names/titles enter at weight A, descriptions at D — same weights as
-- their English base columns.
--
-- NO bulk re-index is performed (the DB is near its disk limit). Existing rows
-- re-index incrementally: every entity table has an AFTER INSERT/UPDATE trigger
-- (trg_search_documents_*) → search_documents_sync → the index function, and the
-- translation backfill UPDATEs entity rows as it writes each locale, so each doc
-- is re-indexed with the multilingual tsvector the next time its row is touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.i18n_to_tsv(p jsonb, weight "char")
RETURNS tsvector
LANGUAGE sql IMMUTABLE
SET search_path TO 'public','extensions','pg_temp'
AS $$
  SELECT coalesce(
    setweight(
      to_tsvector('simple', extensions.unaccent(
        coalesce((SELECT string_agg(value, ' ') FROM jsonb_each_text(p)), '')
      )),
      weight
    ),
    ''::tsvector
  )
$$;

CREATE OR REPLACE FUNCTION public.search_documents_index_venues(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, lgbtq_score, updated_at)
  select
    'venue:'||v.id, 'venue', v.id, v.name, v.description,
       setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.name,''))),'A')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.city,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.category,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(array_to_string(v.tags,' '),''))),'C')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.description,''))),'D')
    || public.i18n_to_tsv(v.name_i18n,'A') || public.i18n_to_tsv(v.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'city', v.city, 'country', v.country, 'category', v.category,
      'is_featured', v.is_featured, 'tags', to_jsonb(v.tags),
      'target_groups', to_jsonb(v.target_groups),
      'accessibility', to_jsonb(v.accessibility_attributes))),
    case when v.latitude is not null and v.longitude is not null
         then extensions.st_setsrid(extensions.st_makepoint(v.longitude::float8, v.latitude::float8),4326)::extensions.geography end,
    null::smallint,
    case when v.closed_at is not null then 'dead' else 'live' end,
    coalesce(v.is_featured,false), v.quality_score, v.closed_at,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    v.slug, coalesce(v.logo_url, v.images[1]), v.city, v.country, v.content_language,
    greatest(
      coalesce((select max(public.lgbti_source_score(v2.data_source)) from public.venues v2
                where lower(btrim(v2.name))=lower(btrim(v.name))
                  and lower(btrim(coalesce(v2.city,'')))=lower(btrim(coalesce(v.city,'')))),0::real),
      case when coalesce(v.name,'')||' '||coalesce(v.description,'')
                ~* '(gay|queer|lgbtiq?|lgbtq?|lesbian|sapphic|schwul|homosexual|transgender|two[- ]spirit|gaysauna)'
           then 0.6::real else 0::real end,
      case when coalesce(array_length(v.tags,1),0)>0 or coalesce(array_length(v.target_groups,1),0)>0
           then 0.5::real else 0::real end
    ),
    now()
  from public.venues v
  left join public.content_embeddings ce on ce.content_type='venue' and ce.content_id = v.id
  where v.duplicate_of_id is null and (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    liveness_status=excluded.liveness_status, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language,
    lgbtq_score=excluded.lgbtq_score, updated_at=now();
$function$;

CREATE OR REPLACE FUNCTION public.search_documents_index_events(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select
    'event:'||e.id, 'event', e.id, e.title, e.description,
       setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.title,''))),'A')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.venue_name,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.city,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.event_type,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.description,''))),'D')
    || public.i18n_to_tsv(e.title_i18n,'A') || public.i18n_to_tsv(e.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'city', e.city, 'country', e.country, 'category', e.event_type,
      'event_type', e.event_type, 'is_featured', e.is_featured, 'is_free', e.is_free,
      'tags', to_jsonb(e.tags),
      'target_groups', to_jsonb(e.target_groups),
      'accessibility', to_jsonb(e.accessibility_attributes))),
    case when e.latitude is not null and e.longitude is not null
         then extensions.st_setsrid(extensions.st_makepoint(e.longitude::float8, e.latitude::float8),4326)::extensions.geography end,
    e.trust_score,
    coalesce(e.liveness_status, 'unknown'),
    coalesce(e.is_featured,false), e.quality_score, null::timestamptz,
    e.start_date, e.end_date, e.is_free, e.price_min, e.price_max,
    e.slug, coalesce(e.logo_url, e.images[1]), e.city, e.country, e.content_language, now()
  from public.events e
  left join public.content_embeddings ce on ce.content_type='event' and ce.content_id = e.id
  where e.duplicate_of_id is null and (p_id is null or e.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    trust_score=excluded.trust_score, liveness_status=excluded.liveness_status,
    is_featured=excluded.is_featured, quality_score=excluded.quality_score,
    start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free,
    price_min=excluded.price_min, price_max=excluded.price_max,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

CREATE OR REPLACE FUNCTION public.search_documents_index_cities(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'city:'||c.id, 'city', c.id, c.name, c.description,
       setweight(to_tsvector('simple', unaccent(coalesce(c.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.name_en,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.region_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.description,''))),'D')
    || public.i18n_to_tsv(c.name_i18n,'A') || public.i18n_to_tsv(c.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object('country', co.name, 'lgbt_friendly_rating', c.lgbt_friendly_rating, 'is_major_city', c.is_major_city)),
    case when c.latitude is not null and c.longitude is not null then st_setsrid(st_makepoint(c.longitude::float8, c.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(c.is_major_city,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    c.slug, coalesce(c.curated_image_url, c.image_url), c.name, co.name, c.local_language, now()
  from public.cities c
  left join public.countries co on co.id = c.country_id
  left join public.content_embeddings ce on ce.content_type='city' and ce.content_id=c.id
  where c.duplicate_of_id is null and (p_id is null or c.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, slug=excluded.slug, image_url=excluded.image_url,
    city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

CREATE OR REPLACE FUNCTION public.search_documents_index_countries(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'country:'||c.id, 'country', c.id, c.name, c.description,
       setweight(to_tsvector('simple', unaccent(coalesce(c.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.code,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.description,''))),'D')
    || public.i18n_to_tsv(c.name_i18n,'A') || public.i18n_to_tsv(c.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object('code', c.code, 'equality_score', c.equality_score)),
    case when c.latitude is not null and c.longitude is not null then st_setsrid(st_makepoint(c.longitude::float8, c.latitude::float8),4326)::geography end,
    null::smallint, 'live', false, null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    c.slug, coalesce(c.curated_image_url, c.image_url), null::text, c.name, null::text, now()
  from public.countries c
  left join public.content_embeddings ce on ce.content_type='country' and ce.content_id=c.id
  where c.duplicate_of_id is null and (p_id is null or c.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    slug=excluded.slug, image_url=excluded.image_url, country=excluded.country, updated_at=now();
$function$;

CREATE OR REPLACE FUNCTION public.search_documents_index_tags(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'tag:'||t.id, 'tag', t.id, t.name, coalesce(t.short_description, t.description),
       setweight(to_tsvector('simple', unaccent(coalesce(t.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.short_description, t.description, ''))),'D')
    || public.i18n_to_tsv(t.name_i18n,'A') || public.i18n_to_tsv(t.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object('category', t.category, 'entity_kind', t.entity_kind)),
    null::geography,
    null::smallint, 'live', false, null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    t.slug, t.image_url, null::text, null::text, null::text, now()
  from public.unified_tags t
  left join public.content_embeddings ce on ce.content_type='tag' and ce.content_id=t.id
  where t.merged_into_id is null and t.deprecated_at is null and (p_id is null or t.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, slug=excluded.slug,
    image_url=excluded.image_url, updated_at=now();
$function$;

CREATE OR REPLACE FUNCTION public.search_documents_index_marketplace(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
      'business_type', m.business_type, 'merchant_domain', m.merchant_domain, 'is_featured', m.featured)),
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

CREATE OR REPLACE FUNCTION public.search_documents_index_news(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'news:'||n.id, 'news', n.id, n.title, n.excerpt,
       setweight(to_tsvector('simple', unaccent(coalesce(n.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(coalesce(n.category_canonical,n.category),''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(n.excerpt,''))),'D')
    || public.i18n_to_tsv(n.title_i18n,'A'),
    jsonb_strip_nulls(jsonb_build_object('category', coalesce(n.category_canonical, n.category), 'is_featured', n.is_featured)),
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

CREATE OR REPLACE FUNCTION public.search_documents_index_personalities(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    jsonb_strip_nulls(jsonb_build_object('profession', p.profession, 'nationality', p.nationality, 'is_living', p.is_living, 'is_featured', p.is_featured)),
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

CREATE OR REPLACE FUNCTION public.search_documents_index_villages(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    jsonb_strip_nulls(jsonb_build_object('city', ci.name, 'country', co.name, 'is_featured', v.featured)),
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
