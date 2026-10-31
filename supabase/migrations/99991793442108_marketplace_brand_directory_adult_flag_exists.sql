-- get_marketplace_brand_directory(): compute `adult_only` with two EXISTS
-- probes instead of aggregating every listing of every brand.
--
-- /marketplace/brands answered HTTP 500 twice on 2026-10-31 (10:12 UTC), both
-- at 3.1-3.3 s: the anon role's statement_timeout is 3s. Measured the same
-- day, a cold run of this function took 2,476 ms, and 1,958 ms of it was the
-- `adult_only` lateral (added in 99991793435077), which read 54,175 buffers
-- (7,574 from disk) to bool_or over all ~54k listings of the 821 published
-- brands. Under any concurrent load that crossed 3s.
--
-- The question is only "does this brand have any adult/explicit listing, and
-- does it have any sfw/suggestive one", so each half is an EXISTS that stops at
-- the first matching row, and a (brand_key, content_rating) index answers both
-- probes from the index. Warm timings in one rolled-back transaction: 240 ms
-- (bool_or) -> 38 ms (EXISTS) -> 14 ms (EXISTS + index); index 712 kB.
--
-- Equivalence, measured over all 5,237 brands: 0 mismatches. The semantics are
-- identical by construction too: bool_or skips NULL ratings, so the old
-- expression is true exactly when an adult/explicit row exists and no
-- sfw/suggestive row does, and false (via coalesce) when the brand has no
-- rated listings, which is what the EXISTS pair returns.
--
-- Same RETURNS TABLE shape, so CREATE OR REPLACE keeps the existing grants
-- (anon/authenticated/service_role EXECUTE) and SECURITY INVOKER, so
-- marketplace_listings RLS still applies to anon. The cover lateral is
-- unchanged.

create index if not exists idx_marketplace_listings_brand_rating
  on public.marketplace_listings (brand_key, content_rating)
  where brand_key is not null;

create or replace function public.get_marketplace_brand_directory()
returns table(
  slug text,
  display_name text,
  logo_url text,
  logo_on_ink boolean,
  story text,
  product_count integer,
  ownership_tags text[],
  cover_url text,
  cover_thumb text,
  adult_only boolean
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  SELECT b.slug,b.display_name,b.logo_url,b.logo_on_ink,b.story,b.product_count,
    CASE WHEN b.ownership_review_status='verified' THEN b.ownership_tags ELSE '{}'::text[] END,
    c.url,c.thumb,
    (EXISTS (
       SELECT 1 FROM public.marketplace_listings l
       WHERE l.brand_key=b.brand_key AND l.content_rating IN('adult','explicit')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.marketplace_listings l
       WHERE l.brand_key=b.brand_key AND l.content_rating IN('sfw','suggestive')
     ))
  FROM public.marketplace_brands b
  LEFT JOIN LATERAL (
    SELECT ia.url,coalesce(ia.thumbnail_url,ia.optimized_url) AS thumb
    FROM public.marketplace_listings l
    JOIN public.image_assets ia ON ia.id=l.overview_image_asset_id
    WHERE l.brand_key=b.brand_key AND l.overview_eligible
      AND l.content_rating IN('sfw','suggestive')
    ORDER BY l.boutique_score DESC NULLS LAST,l.id
    LIMIT 1
  ) c ON true
  WHERE b.publication_status='published' AND b.slug IS NOT NULL AND b.product_count>0
  ORDER BY b.product_count DESC NULLS LAST,b.slug;
$function$;
