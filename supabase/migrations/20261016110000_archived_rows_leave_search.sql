-- Archived rows must actually be invisible — part 1: search + marketplace RLS.
--
-- `search_documents_index_cities` tested only `duplicate_of_id`, so every
-- `shell_status='ghost'` city stayed in the search index. Measured on prod
-- before this migration: 1,022 of 5,436 city documents (18.8% of the city
-- index) were ghosts, and a query for "Padova" returned the ARCHIVED ghost as
-- the top hit, ranked above the real city Padua — plus two `tmp-` shells from
-- the `personality-birth-place` cohort.
--
-- `search_hybrid` reads `search_documents` and never rejoins `cities`, so the
-- indexer's WHERE clause IS search visibility. There is no query-time gate to
-- fall back on.
--
-- WHY `shell_status`, NOT `seo_indexable`: the two are not interchangeable
-- here. `seo_indexable` is false on 1,961 cities that are NOT archived — real
-- places we simply do not expose to crawlers — and those are still legitimate
-- on-site search results. Gating search on it would cut a further 36% of the
-- city index, which is a different (and unrequested) product decision. Every
-- ghost already carries `seo_indexable=false` (measured: 0 exceptions), so
-- `shell_status` is the narrower predicate and it is the one that means
-- "archived". This matches `cities_directory()` and `sitemap-places.xml.ts`,
-- which both use `shell_status not in ('ghost','merged')`.
--
-- 'merged' is listed for parity with those two call sites even though
-- `duplicate_of_id is null` already excludes it — a merged row without a
-- duplicate pointer would be a bug, and this makes the intent legible rather
-- than depending on that invariant holding.
--
-- The body below is a verbatim copy of the LIVE function (which had drifted
-- from 20260531164347 — it gained the two `i18n_to_tsv` terms and dropped the
-- `embedding` column) with one predicate added. Do not regenerate it from the
-- repo file.

create or replace function public.search_documents_index_cities(p_id uuid default null)
returns void language sql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'city:'||c.id, 'city', c.id, c.name, c.description,
       setweight(to_tsvector('simple', unaccent(coalesce(c.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.name_en,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.region_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(c.description,''))),'D')
    || public.i18n_to_tsv(c.name_i18n,'A') || public.i18n_to_tsv(c.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object('country', co.name, 'lgbt_friendly_rating', c.lgbt_friendly_rating, 'is_major_city', c.is_major_city)),
    case when c.latitude is not null and c.longitude is not null then st_setsrid(st_makepoint(c.longitude::float8, c.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(c.is_major_city,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    c.slug, coalesce(c.curated_image_url, c.image_url), c.name, co.name, c.local_language, now()
  from public.cities c
  left join public.countries co on co.id = c.country_id
  left join public.content_embeddings ce on ce.content_type='city' and ce.content_id=c.id
  where c.duplicate_of_id is null
    and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
    and (p_id is null or c.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- One-shot eviction. `search_reindex_drain` deletes-then-reindexes, so the
-- narrowed WHERE is self-evicting for any row that is written again — but a
-- city archived months ago is never written again, so nothing would ever
-- remove it. Delete directly rather than enqueueing: the drain would do the
-- same DELETE and then a no-op index pass, and 1,022 queue rows is a needless
-- lap through a batch-capped worker.
delete from public.search_documents sd
using public.cities c
where sd.entity_type = 'city'
  and sd.entity_id = c.id
  and coalesce(c.shell_status::text, 'real') in ('ghost', 'merged');

-- Marketplace RLS: the anon read policy is broken on its own terms.
--   status='active' OR (venue_id IS NULL OR EXISTS(venue)) OR admin
-- The middle disjunct is true whenever `venue_id IS NULL`, which makes the
-- status test a no-op — so every 'inactive' listing stays readable by anon.
-- 8,198 listings are currently non-active.
--
-- The venue disjunct is not merely redundant, it is DEAD: `venue_id` is NULL on
-- all 69,989 rows (measured). So dropping it changes nothing except the
-- intended fix, and there is no safety-gating consequence — the EXISTS was
-- there to keep a listing visible alongside its venue, and no listing has one.
--
-- The staff escape hatch WIDENS from `has_role_jwt('admin')` to admin/moderator/
-- editor deliberately. Because `venue_id IS NULL` was always true, this policy
-- has never actually hidden a row from anyone, so the admin CMS list for
-- marketplace has always shown inactive rows to editors and moderators.
-- Narrowing to admin-only here would take that away as a side effect of an
-- unrelated fix; this preserves the console while closing the anon hole.
drop policy if exists "Marketplace listings read access" on public.marketplace_listings;
create policy "Marketplace listings read access"
  on public.marketplace_listings
  for select
  using (
    coalesce(status, 'active') = 'active'
    or public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])
  );
