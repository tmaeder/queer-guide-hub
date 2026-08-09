-- The organization RPCs bypassed the safety layer.
--
-- `list_organizations` and `get_organization` are both SECURITY DEFINER, which
-- means RLS on `public.organizations` does not apply to them, and neither one
-- filtered `safety_gated` or looked at `auth.uid()`. So the safety layer held
-- on the table and leaked through the two functions the product actually reads
-- from -- /support's "Near you" section and every /organizations/:slug page.
--
-- Measured against production 2026-08-08, as `anon` with no auth header:
--
--   GET  /rest/v1/organizations?name=eq.Helem...   -> 0 rows      (RLS works)
--   POST /rest/v1/rpc/list_organizations {LB}      -> Helem       (LEAKED)
--   POST /rest/v1/rpc/get_organization  {slug}     -> full record (LEAKED)
--   GET  /organizations/helem-lgbtq-community-center -> renders   (LEAKED)
--
-- Helem is a real LGBTQ+ community centre in Beirut. Lebanon criminalises
-- same-sex acts, `countries.lgbti_criminalization->>'legal'` is false, and the
-- row is correctly flagged `safety_gated = true`. Hiding exactly this from
-- signed-out visitors is the entire purpose of the safety layer: browsing it is
-- a risk to the reader, and its public listing is a risk to the organization.
-- One org today, but the count grows with every org added in a criminalising
-- country, and the same two functions serve all of them.
--
-- The fix mirrors `rpc_venues_ranked`, which is the existing precedent for a
-- SECURITY DEFINER reader gating itself:
--
--   v_show_gated boolean := (SELECT auth.uid()) IS NOT NULL;
--   ... AND (v_show_gated OR v.safety_gated IS NOT TRUE)
--
-- `IS NOT TRUE` rather than `= false` because the column is nullable and a null
-- gate means "not gated"; `safety_gated = false` would drop those rows.
--
-- `get_organization` returning NULL is the correct outcome, not a regression:
-- EntityDetail.tsx:118 already renders `GatedDetailFallback` on not-found, which
-- distinguishes "hidden, sign in" from "genuinely missing" via
-- `gated_entity_exists`. So the detail page degrades to the sign-in gate that
-- was always meant to be there.

create or replace function public.list_organizations(
  p_role text default null,
  p_q text default null,
  p_country_id uuid default null,
  p_limit integer default 60,
  p_offset integer default 0,
  p_country_code text default null
)
returns setof organizations
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select * from public.organizations o
  where o.status = 'active'
    -- Safety layer: signed-out callers never see gated rows.
    and ((select auth.uid()) is not null or o.safety_gated is not true)
    and (p_role is null or o.roles @> array[p_role])
    and (p_country_id is null or o.country_id = p_country_id)
    and (p_country_code is null or p_country_code = 'ALL'
         or o.country_id = (select id from public.countries where upper(code) = upper(p_country_code) limit 1))
    and (p_q is null or p_q = '' or o.name ilike '%'||p_q||'%')
  order by (o.logo_url is not null) desc, o.completeness_score desc nulls last, o.name
  limit greatest(0, least(coalesce(p_limit,60), 100)) offset greatest(0, coalesce(p_offset,0));
$function$;

create or replace function public.get_organization(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select to_jsonb(o) || jsonb_build_object(
    'article_count', (select count(*) from news_articles a join news_sources s on s.id = a.source_id
                      where s.organization_id = o.id and a.duplicate_of_id is null),
    'product_count', (select count(*) from marketplace_listings l
                      where o.website_domain is not null and lower(l.merchant_domain) = lower(o.website_domain)
                        and l.status = 'active'),
    -- The nested venue list is gated independently of the org. A non-gated org
    -- can own a venue in a criminalising country, and enumerating it here would
    -- leak the venue through the org page even though /venues/:slug hides it.
    'venue_count', (select count(*) from venues v where v.organization_id = o.id and v.duplicate_of_id is null
                      and ((select auth.uid()) is not null or v.safety_gated is not true)),
    'venues', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', v.id, 'slug', v.slug, 'name', v.name, 'city', v.city,
                  'latitude', v.latitude, 'longitude', v.longitude, 'image_url',
                  case when array_length(v.images,1) > 0 then v.images[1] else v.logo_url end)
                  order by (v.id = o.primary_venue_id) desc, v.name)
                from venues v where v.organization_id = o.id and v.duplicate_of_id is null
                  and ((select auth.uid()) is not null or v.safety_gated is not true)), '[]'::jsonb)
  )
  from organizations o
  where o.slug = p_slug and o.status = 'active'
    and ((select auth.uid()) is not null or o.safety_gated is not true);
$function$;

comment on function public.list_organizations(text, text, uuid, integer, integer, text) is
  'Active organizations. SECURITY DEFINER, so it gates safety_gated on auth.uid() itself -- RLS does not apply here.';
comment on function public.get_organization(text) is
  'One organization by slug, with counts and gated venue list. SECURITY DEFINER, so it gates safety_gated on auth.uid() itself.';
