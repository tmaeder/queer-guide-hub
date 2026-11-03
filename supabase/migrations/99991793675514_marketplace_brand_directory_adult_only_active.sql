-- get_marketplace_brand_directory(): compute `adult_only` over ACTIVE listings.
--
-- `99991793435077` added `adult_only` over every listing on the brand_key, and
-- #4973 (`e58eb21c5`) rewrote it as EXISTS probes for speed. This keeps those
-- probes and only adds the status filter — restating an older body would bring
-- back the bool_or aggregate that timed out. The function is SECURITY INVOKER, so the listings RLS policy
--   coalesce(status, 'active') = 'active' OR has_any_role_jwt(admin, moderator, editor)
-- decides which rows each caller sees — and the section counts therefore
-- depended on who was looking. Measured 2026-11-03 (rolled-back txn, each role
-- simulated via request.jwt.claims):
--   anon / signed-in member : 258 adult_only, 1 "More makers"
--   admin                   : 253 adult_only, 6 "More makers"
-- The 5 makers that moved (Lovense, PNPPL zine, Asha International, Polymorphe
-- Latex, RodeoH & Nexus) carry sfw listings that are all INACTIVE: staff saw
-- them, the public did not.
--
-- Filtering both probes to active listings — with the exact predicate the policy uses —
-- makes the flag a property of the public range, identical for every role.
-- The cover lateral needs no change: no inactive listing is overview_eligible
-- (0 of 10,956 measured), so covers were already active-only.
--
-- Return type is unchanged, so CREATE OR REPLACE keeps the existing grants.

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
    -- EXISTS probes, never bool_or over every listing (#4973: the aggregate
    -- read ~54k rows per call and timed out under anon's 3s limit). Both
    -- probes filter with the listings RLS policy's own test, so the flag
    -- describes the public range and does not change with the caller's role.
    (EXISTS (
       SELECT 1 FROM public.marketplace_listings l
       WHERE l.brand_key=b.brand_key AND l.content_rating IN('adult','explicit')
         AND coalesce(l.status,'active')='active'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.marketplace_listings l
       WHERE l.brand_key=b.brand_key AND l.content_rating IN('sfw','suggestive')
         AND coalesce(l.status,'active')='active'
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

-- Postconditions. The point of this migration is that the answer no longer
-- depends on the caller, so assert exactly that: anon and an admin get the
-- same adult_only set. Plus the invariants 99991793435077 established.
do $verify$
declare
  v_anon text;
  v_admin text;
  v_true int;
  v_false int;
  v_overlap int;
begin
  if not has_function_privilege('anon', 'public.get_marketplace_brand_directory()', 'EXECUTE') then
    raise exception 'anon lost EXECUTE on get_marketplace_brand_directory';
  end if;

  set local role anon;
  select md5(coalesce(string_agg(slug, ',' order by slug) filter (where adult_only), ''))
    into v_anon from public.get_marketplace_brand_directory();
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","user_role":"admin"}', true);
  set local role authenticated;
  select md5(coalesce(string_agg(slug, ',' order by slug) filter (where adult_only), ''))
    into v_admin from public.get_marketplace_brand_directory();
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_anon is distinct from v_admin then
    raise exception 'adult_only still differs between anon and admin';
  end if;

  select count(*) filter (where adult_only),
         count(*) filter (where not adult_only),
         count(*) filter (where adult_only and cover_url is not null)
    into v_true, v_false, v_overlap
  from public.get_marketplace_brand_directory();

  if v_true + v_false > 0 and v_false = 0 then
    raise exception 'adult_only is true for every maker — predicate is broken';
  end if;
  if v_overlap <> 0 then
    raise exception 'adult_only makers with a cover: %', v_overlap;
  end if;

  raise notice 'ok: adult_only true=% false=%, identical for anon and admin', v_true, v_false;
end
$verify$;
