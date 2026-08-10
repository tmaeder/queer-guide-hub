-- get_organization / list_organizations never filtered duplicate_of_id on the
-- org row itself (only on nested venues/news_articles), so a merged org stayed
-- fully visible at its own slug and in the directory. Same pattern already used
-- for the nested venue/article filters, just never applied to the org row.
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
  where o.slug = p_slug and o.status = 'active' and o.duplicate_of_id is null
    and ((select auth.uid()) is not null or o.safety_gated is not true);
$function$;

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
    and o.duplicate_of_id is null
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

comment on function public.get_organization(text) is
  'One organization by slug, with counts and gated venue list. SECURITY DEFINER, gates safety_gated on auth.uid() and excludes merged duplicates.';
comment on function public.list_organizations(text, text, uuid, integer, integer, text) is
  'Active, non-duplicate organizations. SECURITY DEFINER, so it gates safety_gated on auth.uid() itself -- RLS does not apply here.';
