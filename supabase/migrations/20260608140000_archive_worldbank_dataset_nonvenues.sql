-- Soft-remove World Bank / open-data dataset rows mis-ingested as venues.
-- Reversible: mirrors the Personhood Disposition convention (review_status='archived'
-- + seo_indexable=false + a restore snapshot in enrichment_status), never hard-deletes.
-- Teaches the venue search index to honor review_status='archived' (additive: 0 venues
-- are archived today), so archiving a venue evicts it from search_documents and keeps it
-- out — self-maintaining.
-- Audit: docs/audits/2026-06-08-worldbank-nonvenue-disposition.md

-- 1) Venue search index excludes archived venues. Body is the live definition verbatim
--    plus one WHERE predicate.
create or replace function public.search_documents_index_venues(p_id uuid default null)
returns void language sql security definer set search_path = public, extensions, pg_temp as $function$
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
  where v.duplicate_of_id is null
    and v.review_status is distinct from 'archived'
    and (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    liveness_status=excluded.liveness_status, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language,
    lgbtq_score=excluded.lgbtq_score, updated_at=now();
$function$;

-- 2) Archive the World Bank / open-data dataset rows (precise filter) with a restore snapshot.
with wb as (
  select id, review_status, seo_indexable, needs_attention
  from public.venues
  where data_source = 'unknown'
    and (website ilike '%worldbank.org%'
         or description ilike '%world bank%'
         or website ilike '%haitidata.org%'
         or website ilike '%agidata.org%')
)
update public.venues v
set review_status = 'archived',
    seo_indexable = false,
    needs_attention = false,
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
      'disposition', jsonb_build_object(
        'state', 'archived_non_venue',
        'reason', 'World Bank / open-data dataset mis-ingested as a venue (not a physical place)',
        'archived_at', now(),
        'batch', 'worldbank-open-data-2026-06-08',
        'restore', jsonb_build_object(
          'review_status', wb.review_status,
          'seo_indexable', wb.seo_indexable,
          'needs_attention', wb.needs_attention
        )
      )
    ),
    updated_at = now()
from wb
where v.id = wb.id;

-- 3) Belt-and-suspenders: drop any residual search docs for archived rows.
--    (The per-row UPDATE trigger above already re-indexed via the archived-aware function.)
delete from public.search_documents sd
using public.venues v
where sd.entity_type = 'venue' and sd.entity_id = v.id
  and v.review_status = 'archived';
