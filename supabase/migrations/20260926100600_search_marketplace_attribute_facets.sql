-- Search facets learn the finer taxonomy + attributes (finer-categorisation
-- program, PR 5). Body from 20260704090000 with the facets object extended:
-- department / subcategory_group / subcategory_fine + sizes / colors /
-- genre / fit (from the attributes jsonb the variant backfill maintains).
-- The SFW gate and everything else are unchanged.
--
-- Rollout note: the one-time reindex below re-enqueues the active SFW corpus
-- (~60k rows, drained at the search_reindex_drain cadence). The variant
-- backfill's own listing UPDATEs keep re-enqueueing rows as attributes land,
-- so ordering this migration after the backfill has substantially completed
-- avoids paying a second full pass — but a partially-backfilled index is
-- only missing attribute facets it will regain within hours.

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
      'department', m.department, 'subcategory_group', m.subcategory_group,
      'subcategory_fine', m.subcategory_fine,
      'sizes', case when m.sizes is not null and cardinality(m.sizes) > 0 then to_jsonb(m.sizes) end,
      'colors', case when m.colors is not null and cardinality(m.colors) > 0 then to_jsonb(m.colors) end,
      'genre', case when jsonb_typeof(m.attributes->'genre') = 'array' then m.attributes->'genre' end,
      'fit', case when jsonb_typeof(m.attributes->'fit') = 'array' then m.attributes->'fit' end,
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
  where coalesce(m.status,'active')='active'
    and coalesce(m.content_rating,'sfw') in ('sfw','suggestive')
    and (p_id is null or m.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    price_min=excluded.price_min, price_max=excluded.price_max,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$function$;

-- One-time reindex: enqueue every active SFW listing so the extended facets
-- land without waiting for an incidental UPDATE. Queue-based (the drain
-- applies at its own cadence) — never an inline index pass over 60k rows.
insert into public.search_reindex_queue (entity_type, entity_id)
select 'marketplace', m.id
from public.marketplace_listings m
where coalesce(m.status,'active') = 'active'
  and coalesce(m.content_rating,'sfw') in ('sfw','suggestive');
