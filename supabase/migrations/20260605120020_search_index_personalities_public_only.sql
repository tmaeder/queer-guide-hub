-- C-2 (audit 2026-06-05) — demotion must actually remove a person from public
-- search. search_documents_index_personalities indexed every non-duplicate row
-- regardless of visibility, so the 5,096 demoted (and all pre-existing draft)
-- personalities were still publicly searchable. Restrict the index to
-- visibility='public'. The search_documents_sync trigger DELETEs then re-indexes
-- on every write, so a demote-to-draft now removes the doc automatically.
--
-- Existing non-public docs are purged by a batched delete (see
-- scripts/data-quality/purge-nonpublic-personality-docs.sql) because the table
-- is large (vector embeddings) and a single delete exceeds the statement timeout.

create or replace function public.search_documents_index_personalities(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
  where p.duplicate_of_id is null
    and p.visibility = 'public'
    and (p_id is null or p.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    embedding=excluded.embedding, facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url,
    country=excluded.country, updated_at=now();
$function$;
