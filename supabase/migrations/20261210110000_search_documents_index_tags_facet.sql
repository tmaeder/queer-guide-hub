-- search_documents_index_tags was the one indexer emitting NO tags facet at all.
--
-- Found by investigating 20260619180000_search_documents_tags_facet_all_types, a
-- migration that never ran (its version was claimed by another file — see the
-- collision entry in CLAUDE.md). Measuring before rebuilding it showed the "all
-- types" goal is already met by other means: among entities that are indexed AND
-- carry tag assignments, the facet is present for event and marketplace at 100%,
-- venue 99.97%, news 99.4% (the handfuls are ordinary reindex lag, and the queue
-- drains every minute). So that migration is NOT re-applied here.
--
-- Two residuals were real, and only one of them is fixable as a migration:
--
--  * tags: 18 of 18 indexed-and-tagged rows had no facet, because this function
--    never built one. That is this change.
--
--  * personalities: 269 of 680 (39.6%) — deliberately NOT touched. That indexer
--    emits `to_jsonb(p.tags)`, a denormalised free-text column: 835 distinct
--    values of which only 237 match a `unified_tags.slug`, holding things like
--    'tanzer', 'Sexualität', 'barkeeper', 'bischof'. It is not a missing facet,
--    it is a DIFFERENT VOCABULARY. Switching that indexer to the assignment view
--    would lose facets for 4,777 personalities (column tags, no assignment rows)
--    to gain 342, and unioning the two without normalising would pour 598
--    free-text, partly-German values into a slug-vocabulary facet. Making it
--    correct means deciding the vocabulary and normalising 835 values — a data
--    decision, not a migration.
--
-- The expression is copied in shape from search_documents_index_marketplace, the
-- one indexer that already reads the view, so the facet speaks the same
-- vocabulary everywhere: `unified_tags.slug`, not names and not free text.
-- jsonb_strip_nulls drops the key when a tag has no assignments, which is also
-- what marketplace does — an absent key and an empty array must not both appear.

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
    jsonb_strip_nulls(jsonb_build_object(
      'category', t.category, 'entity_kind', t.entity_kind,
      -- Same shape as search_documents_index_marketplace: slugs, via the norm view.
      'tags', (select to_jsonb(array_agg(distinct t2.slug))
                 from public.tag_assignments_norm a2
                 join public.unified_tags t2 on t2.id = a2.tag_id
                where a2.entity_id = t.id
                  and a2.entity_type = 'tag'
                  and t2.slug is not null))),
    null::geography,
    null::smallint, 'live', false, null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    t.slug, t.image_url, null::text, null::text, null::text, now()
  from public.unified_tags t
  left join public.content_embeddings ce on ce.content_type='tag' and ce.content_id=t.id
  where t.merged_into_id is null and t.deprecated_at is null and (p_id is null or t.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- Re-index ONLY the tags that carry assignments, not all 4,391. Existing rows
-- take the ON CONFLICT branch, which is an UPDATE, so trg_sd_pull_embedding
-- (AFTER INSERT) does not fire and no embedding work is triggered.
do $$
declare r record;
begin
  for r in
    select distinct a.entity_id as id
      from public.tag_assignments_norm a
      join public.unified_tags t on t.id = a.entity_id
     where a.entity_type = 'tag'
       and t.merged_into_id is null and t.deprecated_at is null
  loop
    perform public.search_documents_index_tags(r.id);
  end loop;
end $$;

-- Assert the repair landed rather than trusting it: every indexed tag that has
-- assignments must now carry a non-empty tags facet.
do $$
declare n int;
begin
  select count(*) into n
    from public.search_documents sd
    join (select distinct entity_id from public.tag_assignments_norm where entity_type='tag') a
      on a.entity_id = sd.entity_id
   where sd.entity_type = 'tag'
     and jsonb_array_length(coalesce(sd.facets->'tags','[]'::jsonb)) = 0;
  if n <> 0 then
    raise exception 'tags facet still empty on % indexed tag row(s) that have assignments', n;
  end if;
end $$;
