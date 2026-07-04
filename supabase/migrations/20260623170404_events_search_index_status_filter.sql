-- Existence Truth Engine — events search-index status filter (2026-06-23)
--
-- search_documents_index_events had NO status filter, so cancelled / completed /
-- de-indexed events stayed in search_documents and were only rank-penalized. The
-- existence engine now sets status='cancelled' + seo_indexable=false on dead events
-- and run_event_date_lifecycle marks past events 'completed' / de-indexes long-past
-- ones — but none of that removed them from search until now.
--
-- Add `status NOT IN ('cancelled','completed') AND seo_indexable` to the index WHERE.
-- The search_documents_sync trigger always DELETEs then re-INSERTs on every row
-- change, so when an event no longer matches this predicate the upsert selects 0
-- rows and the stale search_documents row is cleanly evicted — no trigger change
-- needed (trigger already fires AFTER INSERT OR UPDATE OR DELETE on events).
-- Postponed events are intentionally KEPT (still upcoming).

CREATE OR REPLACE FUNCTION public.search_documents_index_events(p_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
  where e.duplicate_of_id is null
    and coalesce(e.status,'active') not in ('cancelled','completed')
    and coalesce(e.seo_indexable, true)
    and (p_id is null or e.id = p_id)
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

-- One-time eviction of already-cancelled/completed/de-indexed events sitting in the
-- index (batched to avoid a search-sync storm). Re-runs are no-ops.
DO $$
DECLARE v_batch int;
BEGIN
  SET LOCAL statement_timeout = 0;
  LOOP
    WITH dead AS (
      SELECT sd.entity_id FROM public.search_documents sd
      JOIN public.events e ON e.id = sd.entity_id
      WHERE sd.entity_type='event'
        AND (coalesce(e.status,'active') IN ('cancelled','completed') OR NOT coalesce(e.seo_indexable,true))
      LIMIT 500
    ), del AS (
      DELETE FROM public.search_documents sd
      USING dead WHERE sd.entity_type='event' AND sd.entity_id=dead.entity_id
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM del;
    EXIT WHEN v_batch = 0;
  END LOOP;
END $$;
