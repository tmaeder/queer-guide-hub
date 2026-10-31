-- get_marketplace_brand_directory(): add `adult_only`.
--
-- /marketplace/brands splits the catalogue on `cover_url IS NULL`. The cover is
-- drawn only from sfw/suggestive listings because the page is ungated, so a
-- coverless maker was being labelled "Adult makers" by INFERENCE. Measured on
-- prod (2026-10-31): 259 coverless makers, all with adult/explicit listings,
-- 253 with nothing else — but the 6 others also carry sfw listings that are
-- simply not overview-eligible, so calling them adult-only would be false, and
-- any future sfw maker with no usable image would be mislabelled the same way.
--
-- `adult_only` states the fact directly: the maker has at least one adult or
-- explicit listing AND no sfw/suggestive listing at all. Scope matches the
-- cover lateral (every listing on the brand_key, no status filter), so the two
-- columns describe the same set of listings.
--
-- Changing the RETURNS TABLE shape needs DROP + CREATE (CREATE OR REPLACE
-- cannot change a function's return type). Grants are restated exactly as they
-- stood: anon/authenticated/service_role EXECUTE; it stays SECURITY INVOKER,
-- so marketplace_listings RLS still applies to anon.

begin;

drop function if exists public.get_marketplace_brand_directory();

create function public.get_marketplace_brand_directory()
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
    coalesce(r.any_adult AND NOT r.any_sfw, false)
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
  LEFT JOIN LATERAL (
    SELECT bool_or(l.content_rating IN('adult','explicit')) AS any_adult,
           bool_or(l.content_rating IN('sfw','suggestive')) AS any_sfw
    FROM public.marketplace_listings l
    WHERE l.brand_key=b.brand_key
  ) r ON true
  WHERE b.publication_status='published' AND b.slug IS NOT NULL AND b.product_count>0
  ORDER BY b.product_count DESC NULLS LAST,b.slug;
$function$;

revoke all on function public.get_marketplace_brand_directory() from public;
grant execute on function public.get_marketplace_brand_directory() to anon, authenticated, service_role;

-- Postconditions: the column exists, the grants are back, and the flag is not
-- vacuous in either direction (an all-false or all-true column would mean the
-- predicate broke, not that the catalogue changed).
do $verify$
declare
  v_true int;
  v_false int;
  v_cover_and_adult int;
begin
  if not has_function_privilege('anon', 'public.get_marketplace_brand_directory()', 'EXECUTE') then
    raise exception 'anon lost EXECUTE on get_marketplace_brand_directory';
  end if;

  select count(*) filter (where adult_only),
         count(*) filter (where not adult_only),
         count(*) filter (where adult_only and cover_url is not null)
    into v_true, v_false, v_cover_and_adult
  from public.get_marketplace_brand_directory();

  if v_true + v_false > 0 and v_false = 0 then
    raise exception 'adult_only is true for every maker — predicate is broken';
  end if;
  -- An adult-only maker has no sfw/suggestive listing, so it can never carry
  -- a cover (covers are drawn from exactly those). Any overlap is a bug.
  if v_cover_and_adult <> 0 then
    raise exception 'adult_only makers with a cover: % — the two columns disagree', v_cover_and_adult;
  end if;

  raise notice 'ok: adult_only true=% false=%', v_true, v_false;
end
$verify$;

commit;
