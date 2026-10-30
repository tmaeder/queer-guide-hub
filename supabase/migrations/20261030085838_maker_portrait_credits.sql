-- Expose only the visible portrait's attribution, with the maker's existing
-- publication guard. Replacing these read functions is transactional; no maker
-- or listing records are changed by this migration.
begin;
drop function public.get_marketplace_brand(text);
drop function api_private.get_marketplace_brand(text);
CREATE OR REPLACE FUNCTION api_private.get_marketplace_brand(p_slug text)
 RETURNS TABLE(slug text, display_name text, brand_key text, product_count integer, website text, logo_url text, logo_on_ink boolean, story text, ownership_tags text[], is_approved boolean, logo_credit jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target as (
    select b.* from marketplace_brands b where b.slug=p_slug
    union all
    select b.* from marketplace_brand_slug_redirects r
      join marketplace_brands b on b.id=r.brand_id
    where r.old_slug=p_slug and not exists(select 1 from marketplace_brands x where x.slug=p_slug)
    limit 1
  )
  select t.slug,t.display_name,t.brand_key,t.product_count,t.website,t.logo_url,
    coalesce(t.logo_on_ink,false),
    case when t.publication_status='published' then t.story end,
    case when t.ownership_review_status='verified' then t.ownership_tags else '{}'::text[] end,
    t.publication_status='published',
    case when t.publication_status='published'
      and t.profile_resolution->'portrait_credit'->>'image_url'=t.logo_url
    then jsonb_build_object(
      'attribution',t.profile_resolution->'portrait_credit'->>'attribution',
      'license',t.profile_resolution->'portrait_credit'->>'license',
      'source_url',t.profile_resolution->'portrait_credit'->>'source_url',
      'license_url',t.profile_resolution->'portrait_credit'->>'license_url'
    ) end
  from target t;
$function$
;
CREATE OR REPLACE FUNCTION public.get_marketplace_brand(p_slug text)
 RETURNS TABLE(slug text, display_name text, brand_key text, product_count integer, website text, logo_url text, logo_on_ink boolean, story text, ownership_tags text[], is_approved boolean, logo_credit jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$SELECT * FROM api_private.get_marketplace_brand(p_slug => $1)$function$
;
revoke all on function public.get_marketplace_brand(text) from public;
revoke all on function api_private.get_marketplace_brand(text) from public;
grant execute on function public.get_marketplace_brand(text) to anon,authenticated,service_role;
grant execute on function api_private.get_marketplace_brand(text) to anon,authenticated,service_role;
commit;
