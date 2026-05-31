-- Expand search_documents from the venues+events pilot to the full canonical
-- corpus: cities, countries, news, marketplace, personalities, tags,
-- queer_villages. Additive; same exception-safe trigger + service_role lockdown
-- pattern as the pilot. See docs/search-intelligence/meili-to-postgres-migration-plan.md.

-- ---------- cities ----------
create or replace function public.search_documents_index_cities(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'city:'||c.id, 'city', c.id, c.name, c.description,
       setweight(to_tsvector('simple', unaccent(coalesce(c.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.name_en,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.region_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.description,''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, slug=excluded.slug, image_url=excluded.image_url,
    city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$$;

-- ---------- countries ----------
create or replace function public.search_documents_index_countries(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'country:'||c.id, 'country', c.id, c.name, c.description,
       setweight(to_tsvector('simple', unaccent(coalesce(c.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.code,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.description,''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    slug=excluded.slug, image_url=excluded.image_url, country=excluded.country, updated_at=now();
$$;

-- ---------- news ----------
create or replace function public.search_documents_index_news(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'news:'||n.id, 'news', n.id, n.title, n.excerpt,
       setweight(to_tsvector('simple', unaccent(coalesce(n.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(coalesce(n.category_canonical,n.category),''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(n.excerpt,''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, start_date=excluded.start_date,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$$;

-- ---------- marketplace ----------
create or replace function public.search_documents_index_marketplace(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'marketplace:'||m.id, 'marketplace', m.id, m.title, m.description,
       setweight(to_tsvector('simple', unaccent(coalesce(m.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.business_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.brand,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.subcategory,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.description,''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    price_min=excluded.price_min, price_max=excluded.price_max,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$$;

-- ---------- personalities ----------
create or replace function public.search_documents_index_personalities(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'personality:'||p.id, 'personality', p.id, p.name, coalesce(p.description, p.bio),
       setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.profession,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.nationality,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.lgbti_connection,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.description, p.bio, ''))),'D'),
    ce.embedding,
    jsonb_strip_nulls(jsonb_build_object('profession', p.profession, 'nationality', p.nationality, 'is_living', p.is_living, 'is_featured', p.is_featured)),
    null::geography,
    null::smallint, 'live', coalesce(p.is_featured,false), p.quality_score, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    p.slug, p.image_url, null::text, p.nationality, null::text, now()
  from public.personalities p
  left join public.content_embeddings ce on ce.content_type='personality' and ce.content_id=p.id
  where p.duplicate_of_id is null and (p_id is null or p.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    embedding=excluded.embedding, facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url,
    country=excluded.country, updated_at=now();
$$;

-- ---------- tags ----------
create or replace function public.search_documents_index_tags(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'tag:'||t.id, 'tag', t.id, t.name, coalesce(t.short_description, t.description),
       setweight(to_tsvector('simple', unaccent(coalesce(t.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.short_description, t.description, ''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, slug=excluded.slug,
    image_url=excluded.image_url, updated_at=now();
$$;

-- ---------- queer_villages ----------
create or replace function public.search_documents_index_villages(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'queer_village:'||v.id, 'queer_village', v.id, v.name, v.description,
       setweight(to_tsvector('simple', unaccent(coalesce(v.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(v.description,''))),'D'),
    ce.embedding,
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
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, slug=excluded.slug, image_url=excluded.image_url,
    city=excluded.city, country=excluded.country, updated_at=now();
$$;

-- ---------- full-corpus rebuild ----------
create or replace function public.search_documents_rebuild()
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  delete from public.search_documents;
  perform public.search_documents_index_venues(null);
  perform public.search_documents_index_events(null);
  perform public.search_documents_index_cities(null);
  perform public.search_documents_index_countries(null);
  perform public.search_documents_index_news(null);
  perform public.search_documents_index_marketplace(null);
  perform public.search_documents_index_personalities(null);
  perform public.search_documents_index_tags(null);
  perform public.search_documents_index_villages(null);
end $$;

-- ---------- triggers (exception-safe; reuse search_documents_sync) ----------
create or replace function public.search_documents_sync()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  begin
    if (tg_op = 'DELETE') then
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = old.id;
    else
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = new.id;
      case tg_argv[0]
        when 'venue'         then perform public.search_documents_index_venues(new.id);
        when 'event'         then perform public.search_documents_index_events(new.id);
        when 'city'          then perform public.search_documents_index_cities(new.id);
        when 'country'       then perform public.search_documents_index_countries(new.id);
        when 'news'          then perform public.search_documents_index_news(new.id);
        when 'marketplace'   then perform public.search_documents_index_marketplace(new.id);
        when 'personality'   then perform public.search_documents_index_personalities(new.id);
        when 'tag'           then perform public.search_documents_index_tags(new.id);
        when 'queer_village' then perform public.search_documents_index_villages(new.id);
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_search_documents_city on public.cities;
create trigger trg_search_documents_city after insert or update or delete on public.cities for each row execute function public.search_documents_sync('city');
drop trigger if exists trg_search_documents_country on public.countries;
create trigger trg_search_documents_country after insert or update or delete on public.countries for each row execute function public.search_documents_sync('country');
drop trigger if exists trg_search_documents_news on public.news_articles;
create trigger trg_search_documents_news after insert or update or delete on public.news_articles for each row execute function public.search_documents_sync('news');
drop trigger if exists trg_search_documents_marketplace on public.marketplace_listings;
create trigger trg_search_documents_marketplace after insert or update or delete on public.marketplace_listings for each row execute function public.search_documents_sync('marketplace');
drop trigger if exists trg_search_documents_personality on public.personalities;
create trigger trg_search_documents_personality after insert or update or delete on public.personalities for each row execute function public.search_documents_sync('personality');
drop trigger if exists trg_search_documents_tag on public.unified_tags;
create trigger trg_search_documents_tag after insert or update or delete on public.unified_tags for each row execute function public.search_documents_sync('tag');
drop trigger if exists trg_search_documents_village on public.queer_villages;
create trigger trg_search_documents_village after insert or update or delete on public.queer_villages for each row execute function public.search_documents_sync('queer_village');

-- ---------- lock down internals to service_role ----------
revoke all on function public.search_documents_index_cities(uuid)        from public, anon, authenticated;
revoke all on function public.search_documents_index_countries(uuid)     from public, anon, authenticated;
revoke all on function public.search_documents_index_news(uuid)          from public, anon, authenticated;
revoke all on function public.search_documents_index_marketplace(uuid)   from public, anon, authenticated;
revoke all on function public.search_documents_index_personalities(uuid) from public, anon, authenticated;
revoke all on function public.search_documents_index_tags(uuid)          from public, anon, authenticated;
revoke all on function public.search_documents_index_villages(uuid)      from public, anon, authenticated;
grant execute on function public.search_documents_index_cities(uuid)        to service_role;
grant execute on function public.search_documents_index_countries(uuid)     to service_role;
grant execute on function public.search_documents_index_news(uuid)          to service_role;
grant execute on function public.search_documents_index_marketplace(uuid)   to service_role;
grant execute on function public.search_documents_index_personalities(uuid) to service_role;
grant execute on function public.search_documents_index_tags(uuid)          to service_role;
grant execute on function public.search_documents_index_villages(uuid)      to service_role;

-- After applying: select public.search_documents_rebuild();
-- (or drop the HNSW index, load each type, recreate it — the single-txn rebuild
-- of ~74k vectors exceeds short client timeouts because of HNSW maintenance.)
