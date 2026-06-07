-- The whole event stack already assumes events.tags is a text[] column —
-- EventRow.tags, formData.tags + the pride-subtype selector, the admin Tags
-- column, the public filter's .overlaps('tags', …), and search_events' p_tags
-- param. But the column was never created and search_events silently ignored
-- p_tags, so the "Pride type" filter (and event tagging generally) never worked.
-- Add the column (sibling of accessibility_attributes/target_groups, both text[]
-- facets here) and wire the filter end-to-end. Constant default ⇒ metadata-only
-- add, no table rewrite.

alter table public.events add column if not exists tags text[] not null default '{}';
create index if not exists idx_events_tags_gin on public.events using gin (tags);

-- search_events accepted p_tags but never filtered on it. Add the && clause,
-- mirroring how p_accessibility_attributes / p_target_groups already work.
create or replace function public.search_events(
  p_city text default null, p_event_type text default null,
  p_start timestamptz default null, p_end timestamptz default null,
  p_tags text[] default null, p_accessibility_attributes text[] default null,
  p_target_groups text[] default null, p_search text default null,
  p_include_past boolean default false, p_limit integer default 24, p_offset integer default 0)
returns table(total bigint, event jsonb)
language sql stable set search_path to 'public'
as $function$
  WITH filtered AS (
    SELECT e.*
    FROM public.events e
    WHERE e.status = 'active'
      AND (CASE WHEN p_include_past THEN e.start_date <= now()
                ELSE COALESCE(e.end_date, e.start_date) >= now() END)
      AND (p_city IS NULL
           OR public.immutable_unaccent(lower(e.city))
              ILIKE '%' || public.immutable_unaccent(lower(p_city)) || '%')
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
      AND (p_end   IS NULL OR e.start_date                       <= p_end)
      AND (p_start IS NULL OR COALESCE(e.end_date, e.start_date) >= p_start)
      AND (p_tags IS NULL OR e.tags && p_tags)
      AND (p_accessibility_attributes IS NULL OR e.accessibility_attributes && p_accessibility_attributes)
      AND (p_target_groups IS NULL OR e.target_groups && p_target_groups)
      AND (p_search IS NULL
           OR e.title ILIKE '%' || p_search || '%'
           OR e.description ILIKE '%' || p_search || '%')
  ),
  counted AS (SELECT count(*)::BIGINT AS total FROM filtered),
  paged AS (
    SELECT f.* FROM filtered f
    ORDER BY f.is_featured DESC,
             CASE WHEN p_include_past THEN f.start_date END DESC,
             CASE WHEN NOT p_include_past THEN f.start_date END ASC
    LIMIT  GREATEST(COALESCE(p_limit, 24), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (SELECT total FROM counted) AS total,
    to_jsonb(p) || jsonb_build_object(
      'venues',
      CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v.id, 'name', v.name, 'address', v.address, 'city', v.city,
        'state', v.state, 'country', v.country, 'phone', v.phone,
        'website', v.website, 'email', v.email) END
    ) AS event
  FROM paged p
  LEFT JOIN public.venues v ON v.id = p.venue_id;
$function$;

-- Universal search: include tags in the event facet (consistent with
-- target_groups/accessibility). New/edited events pick it up via the sync trigger.
create or replace function public.search_documents_index_events(p_id uuid default null)
returns void
language sql security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
    || setweight(to_tsvector('simple', extensions.unaccent(coalesce(e.description,''))),'D'),
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
