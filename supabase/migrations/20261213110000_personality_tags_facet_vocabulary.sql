-- The personality tags FACET spoke a different vocabulary from every other type.
--
-- search_documents_index_personalities emitted `to_jsonb(p.tags)` — the raw,
-- denormalised free-text column — while every other indexer emits
-- `unified_tags.slug`. Measured: 802 distinct column values, of which only 395
-- match a slug. The rest are names, aliases, and a long tail that is not tag
-- vocabulary at all: person names (`abdellah taïa`), literal leaked markup
-- (`<tags>christian scheuß`), decades (`1980s`), places (`ansbach`). The facet
-- is a user-facing SEARCH FILTER (SearchFiltersPanel tracks facet:'tags'), so
-- those were unusable filter options sitting beside real ones.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
-- Only the facet. `personalities.tags` is untouched, and it is RENDERED on the
-- profile page (PersonalityDetail.parts.tsx -> TagChipRow), so nothing becomes
-- invisible to a reader. That distinction is what makes this safe, and it is
-- worth stating because the raw column carries meaning the vocabulary cannot yet
-- express: Alan Turing is tagged `suizid #strafverfolgung`, and the Tepláreň
-- shooting victims Juraj Vankulič and Matúš Horváth carry
-- `teplaren #mordopfer #hassverbrechen`. Dropping those from a filter is not the
-- same as deleting them, and they still appear on their pages.
--
-- RESOLUTION IS slug OR name OR alias, and that width is the whole point.
-- An earlier read of this problem measured exact-slug matching only and
-- concluded that normalising would "lose 4,777 personalities to gain 342".
-- That was wrong because it under-measured the mapping. Resolving through name
-- and alias as well, and unioning the tag_assignments_norm rows:
--
--     have raw column tags   7,269
--     WOULD HAVE a facet     7,586   (a net GAIN of 317)
--     would lose it            25
--
-- The 25 are people whose every value is untranslated German (`bildhauer`,
-- `geistliche`, `eisschnelllauf`) or a `#`-compound the array never split. They
-- keep their profile chips; they lose only a filter entry that never worked.
-- Translating that residue, splitting the `#` compounds, and deciding whether
-- `mordopfer`/`hassverbrechen` deserve real tags is an editorial decision about
-- the tag vocabulary, and is deliberately NOT made here.
--
-- No text-search regression: the personality tsv indexes name, profession,
-- roles, nationality, lgbti_connection and description — never `tags` — so the
-- raw values were never text-searchable to begin with.
--
-- Cost: re-indexes public personalities (~1,633 docs). Existing rows take the
-- ON CONFLICT branch, an UPDATE, so trg_sd_pull_embedding (AFTER INSERT only)
-- never fires and no embedding work is triggered.

create or replace function public.search_documents_index_personalities(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'personality:'||p.id, 'personality', p.id, p.name, coalesce(p.description, p.bio),
       setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.profession,''))),'B')
    || setweight(to_tsvector('simple', unaccent(array_to_string(coalesce(p.roles,'{}'::text[]),' '))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.nationality,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.lgbti_connection,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.description, p.bio, ''))),'D')
    || public.i18n_to_tsv(p.name_i18n,'A') || public.i18n_to_tsv(p.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'profession', p.profession, 'roles', to_jsonb(p.roles), 'nationality', p.nationality,
      'is_living', p.is_living, 'is_featured', p.is_featured,
      -- One vocabulary: unified_tags.slug, same shape as the marketplace indexer.
      -- jsonb_strip_nulls drops the key when nothing resolves, so an absent key
      -- and an empty array cannot both mean "no tags".
      'tags', (
        select to_jsonb(array_agg(distinct s.slug))
          from (
            select t.slug
              from unnest(coalesce(p.tags,'{}'::text[])) as raw(v)
              join public.unified_tags t
                on lower(t.slug) = lower(btrim(raw.v))
                or lower(t.name) = lower(btrim(raw.v))
            union
            select t.slug
              from unnest(coalesce(p.tags,'{}'::text[])) as raw(v)
              join public.tag_aliases a on lower(a.alias_name) = lower(btrim(raw.v))
              join public.unified_tags t on t.id = a.canonical_tag_id
            union
            select t.slug
              from public.tag_assignments_norm asg
              join public.unified_tags t on t.id = asg.tag_id
             where asg.entity_id = p.id and asg.entity_type = 'personality'
          ) s
         where s.slug is not null))),
    null::geography,
    null::smallint, 'live', coalesce(p.is_featured,false), p.quality_score, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    p.slug, p.image_url, null::text, p.nationality, null::text, now()
  from public.personalities p
  left join public.content_embeddings ce on ce.content_type='personality' and ce.content_id=p.id
  where p.duplicate_of_id is null
    and p.visibility = 'public'
    and (p_id is null or p.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

select public.search_documents_index_personalities(null);

-- Every value the personality facet now publishes must be a real slug. This is
-- the condition the migration exists to establish, so it fails loudly rather
-- than recording a green that nobody checked.
do $$
declare n bigint;
begin
  select count(*) into n
    from public.search_documents sd
    cross join lateral jsonb_array_elements_text(coalesce(sd.facets->'tags','[]'::jsonb)) as f(v)
   where sd.entity_type = 'personality'
     and not exists (select 1 from public.unified_tags t where t.slug = f.v);
  if n <> 0 then
    raise exception 'personality tags facet still publishes % non-slug value(s)', n;
  end if;
end $$;
