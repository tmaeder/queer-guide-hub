-- Phase 1 (pilot: venues + events) of the Meili -> Postgres search migration.
-- See docs/search-intelligence/meili-to-postgres-migration-plan.md (§3, §5 Phase 1).
-- Additive only. Introduces a single denormalized search_documents table (Option B),
-- kept fresh by exception-safe triggers that can never abort a core venues/events write.

create extension if not exists fuzzystrmatch with schema extensions;

create table if not exists public.search_documents (
  doc_id           text primary key,
  entity_type      text not null,
  entity_id        uuid not null,
  title            text,
  description      text,
  search_tsv       tsvector,
  embedding        extensions.vector(1024),
  facets           jsonb not null default '{}'::jsonb,
  geog             extensions.geography(Point,4326),
  trust_score      smallint,
  liveness_status  text,
  is_featured      boolean not null default false,
  quality_score    smallint,
  closed_at        timestamptz,
  start_date       timestamptz,
  end_date         timestamptz,
  is_free          boolean,
  price_min        numeric,
  price_max        numeric,
  slug             text,
  image_url        text,
  city             text,
  country          text,
  content_language text,
  updated_at       timestamptz not null default now(),
  constraint search_documents_entity_uq unique (entity_type, entity_id)
);

create index if not exists search_documents_tsv_gin   on public.search_documents using gin (search_tsv);
create index if not exists search_documents_title_trgm on public.search_documents using gin (title extensions.gin_trgm_ops);
create index if not exists search_documents_geog_gix   on public.search_documents using gist (geog);
create index if not exists search_documents_embed_hnsw on public.search_documents using hnsw (embedding extensions.vector_cosine_ops) with (m=16, ef_construction=64);
create index if not exists search_documents_type_idx   on public.search_documents (entity_type);
create index if not exists search_documents_start_idx  on public.search_documents (start_date);
create index if not exists search_documents_live_idx   on public.search_documents (liveness_status);

alter table public.search_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='search_documents' and policyname='search_documents_public_read') then
    create policy search_documents_public_read on public.search_documents for select using (true);
  end if;
end $$;

-- ---- index builders (set-based; p_id null = full rebuild for that type) ----
create or replace function public.search_documents_index_venues(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select
    'venue:'||v.id, 'venue', v.id, v.name, v.description,
       setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.name,''))),'A')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.city,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.category,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(array_to_string(v.tags,' '),''))),'C')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(v.description,''))),'D'),
    ce.embedding,
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
    v.slug, coalesce(v.logo_url, v.images[1]), v.city, v.country, v.content_language, now()
  from public.venues v
  left join public.content_embeddings ce on ce.content_type='venue' and ce.content_id = v.id
  where v.duplicate_of_id is null and (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    liveness_status=excluded.liveness_status, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language, updated_at=now();
$$;

create or replace function public.search_documents_index_events(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select
    'event:'||e.id, 'event', e.id, e.title, e.description,
       setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.title,''))),'A')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.venue_name,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.city,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.event_type,''))),'B')
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.description,''))),'D'),
    ce.embedding,
    jsonb_strip_nulls(jsonb_build_object(
      'city', e.city, 'country', e.country, 'category', e.event_type,
      'event_type', e.event_type, 'is_featured', e.is_featured, 'is_free', e.is_free,
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
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    trust_score=excluded.trust_score, liveness_status=excluded.liveness_status,
    is_featured=excluded.is_featured, quality_score=excluded.quality_score,
    start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free,
    price_min=excluded.price_min, price_max=excluded.price_max,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language, updated_at=now();
$$;

create or replace function public.search_documents_rebuild()
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  delete from public.search_documents where entity_type in ('venue','event');
  perform public.search_documents_index_venues(null);
  perform public.search_documents_index_events(null);
end $$;

-- ---- exception-safe sync trigger (never aborts the core write) ----
create or replace function public.search_documents_sync()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  begin
    if (tg_op = 'DELETE') then
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = old.id;
    else
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = new.id;
      if tg_argv[0] = 'venue' then perform public.search_documents_index_venues(new.id);
      else perform public.search_documents_index_events(new.id); end if;
    end if;
  exception when others then
    -- swallow: search_documents freshness must never break a venues/events transaction
    null;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_search_documents_venue on public.venues;
create trigger trg_search_documents_venue
  after insert or update or delete on public.venues
  for each row execute function public.search_documents_sync('venue');

drop trigger if exists trg_search_documents_event on public.events;
create trigger trg_search_documents_event
  after insert or update or delete on public.events
  for each row execute function public.search_documents_sync('event');

-- After applying, populate with:  select public.search_documents_rebuild();
-- (run outside a short-timeout client; or drop the HNSW index, bulk-load, recreate it).
