-- Derived LGBTQ-relevance signal for venue search ranking (search_documents).
-- venues.lgbti_relevance_score is effectively dead (150/32756 populated). Derive a
-- graded score from provenance (queer-only sources vs generic completeness imports),
-- explicit queer terms, and curated tags/target_groups. Maintained by the venue
-- indexer so new/updated venues stay scored; non-venue entities are handled in
-- search_hybrid (treated as fully queer-relevant) so no other indexer changes.

create or replace function public.lgbti_source_score(p_src text)
returns real immutable language sql set search_path to 'public' as $$
  select case lower(coalesce(p_src,''))
    when 'spartacus' then 1.0 when 'spartacus_gpt' then 1.0 when 'gaypinkspots' then 1.0
    when 'patroc' then 1.0 when 'misterbandb' then 1.0 when 'bareinspiration' then 1.0
    when 'nude-places' then 0.9 when 'saunas-google' then 0.9
    when 'refuge-restrooms' then 0.6
    when 'manual-xlsx-upload-2026-04-07' then 0.8 when 'email_ingest' then 0.8
    when 'email-ingest' then 0.8 when 'event-import' then 0.8
    else 0.0 end::real;
$$;

alter table public.search_documents add column if not exists lgbtq_score real not null default 0.5;

create or replace function public.search_documents_index_venues(p_id uuid default null)
returns void language sql security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, embedding, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, lgbtq_score, updated_at)
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
    embedding=excluded.embedding, facets=excluded.facets, geog=excluded.geog,
    liveness_status=excluded.liveness_status, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, closed_at=excluded.closed_at,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, content_language=excluded.content_language,
    lgbtq_score=excluded.lgbtq_score, updated_at=now();
$function$;

-- one-time backfill of existing venue docs (best source across same name+city)
with srcscore as (
  select lower(btrim(name)) nm, lower(btrim(coalesce(city,''))) cty,
         max(public.lgbti_source_score(data_source)) best_src
  from public.venues group by 1,2
)
update public.search_documents sd
set lgbtq_score = greatest(
  coalesce(ss.best_src, 0::real),
  case when coalesce(v.name,'')||' '||coalesce(v.description,'')
            ~* '(gay|queer|lgbtiq?|lgbtq?|lesbian|sapphic|schwul|homosexual|transgender|two[- ]spirit|gaysauna)'
       then 0.6::real else 0::real end,
  case when coalesce(array_length(v.tags,1),0)>0 or coalesce(array_length(v.target_groups,1),0)>0
       then 0.5::real else 0::real end
)
from public.venues v
left join srcscore ss on ss.nm=lower(btrim(v.name)) and ss.cty=lower(btrim(coalesce(v.city,'')))
where sd.entity_type='venue' and sd.entity_id=v.id;
