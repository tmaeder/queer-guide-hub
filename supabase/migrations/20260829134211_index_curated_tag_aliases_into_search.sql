-- Cross-language tag lookup: index curated aliases into the tag's own tsvector.
--
-- WHY THE SYNONYM TABLE COULD NOT DO THIS
--
-- search_synonyms feeds query expansion in workers/search-proxy, and the
-- expansion reaches exactly one arm of the hybrid search:
--
--   const embedText = allSynonyms.length ? `${effectiveQ} ${allSynonyms...}` : effectiveQ;
--   const pgArgs = { query: effectiveQ, queryVec: blendedVec, ... };
--
-- The expanded string is used to build the EMBEDDING. The keyword arm receives
-- `effectiveQ` — the original, unexpanded query. So a synonym can only ever
-- influence the vector side, and for a rare foreign token the vector alone does
-- not outrank a strong lexical match.
--
-- Measured on prod: "Xanax" returns xanadu/xana, not alprazolam. "Valoron"
-- returns tiburon. "Lachgas" returns a person named Lachgar. Meanwhile
-- "Naloxon" DOES return naloxone and "Dissoziativa" DOES return dissociatives —
-- not because expansion worked, but because those German words are close enough
-- to their English forms to match on trigram. That coincidence is what made the
-- synonym layer look like it was working; it never was, for keyword search.
--
-- WHAT THIS CHANGES
--
-- search_documents_index_tags already indexes name (A), category (B),
-- description (D) and the i18n name/description jsonb. It has never indexed
-- tag_aliases — zero occurrences of "alias" in the function. So 15k alias rows
-- across eleven languages, including every German term added for the
-- harm-reduction vocabulary, were absent from the keyword index entirely.
--
-- They are added at weight 'A', matching how name_i18n is already treated: an
-- alias is an alternative NAME, and the whole point is that it should match as
-- strongly as one.
--
-- THE SET IS CURATED BY CONSTRUCTION, WHICH IS THE SAFETY PROPERTY
--
-- Only aliases carrying an ACTIVE search_synonyms row are indexed. That set was
-- hand-vetted in 20260829124635 precisely to exclude ordinary words: "Pilze" is
-- German for mushrooms, "Gras" is grass, "Schnee" is snow, and in English
-- Speed, Pot, Acid, Ice and Blotter are ordinary too. Indexing all 15k aliases
-- would make a search for mushroom restaurants return a psychedelic — the same
-- hazard that governs auto-tagging and query expansion, arriving by a third
-- route. The join to search_synonyms is what keeps that impossible: an alias
-- has to have been deliberately activated to be indexed.
--
-- Nothing about query construction, ranking or the worker changes. This is a
-- data-shape change to tag documents only.
--
-- Also removes a duplicate active synonym row: "überdosis" -> "overdose"
-- existed twice, which fires the same expansion term twice and wastes a slot
-- against the 40-term expansion cap.

create or replace function public.search_documents_index_tags(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'tag:'||t.id, 'tag', t.id, t.name, coalesce(t.short_description, t.description),
       setweight(to_tsvector('simple', unaccent(coalesce(t.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(t.short_description, t.description, ''))),'D')
    || public.i18n_to_tsv(t.name_i18n,'A') || public.i18n_to_tsv(t.description_i18n,'D')
    -- Curated aliases only: an alias must carry an ACTIVE search_synonyms row,
    -- which is the hand-vetted, ordinary-word-free set. See header.
    || setweight(to_tsvector('simple', unaccent(coalesce(
         (select string_agg(a.alias_name, ' ')
            from public.tag_aliases a
            join public.search_synonyms s
              on s.tag_alias_id = a.id and s.status = 'active'
           where a.canonical_tag_id = t.id), ''))),'A'),
    jsonb_strip_nulls(jsonb_build_object('category', t.category, 'entity_kind', t.entity_kind)),
    null::geography,
    null::smallint, 'live', false, null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    t.slug, t.image_url, null::text, null::text, null::text, now()
  from public.unified_tags t
  left join public.content_embeddings ce on ce.content_type='tag' and ce.content_id=t.id
  where t.merged_into_id is null and t.deprecated_at is null and (p_id is null or t.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- Drop the duplicate "überdosis" row, keeping the oldest.
delete from public.search_synonyms s
 using public.search_synonyms k
 where s.status = 'active' and k.status = 'active'
   and s.terms = k.terms and s.replacements = k.replacements
   and s.id > k.id;