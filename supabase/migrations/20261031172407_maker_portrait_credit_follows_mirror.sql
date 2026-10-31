-- Maker portrait credits went dark when the logos were mirrored.
--
-- get_marketplace_brand() (20261030085838, #4953) returns
-- profile_resolution.portrait_credit only when the credit's image_url equals
-- the brand's logo_url, so a credit is never shown under a different photo.
-- 20261031102733 then moved every logo to our mirrored copy on
-- img.queer.guide and recorded the original in logo_origin_url. The equality
-- failed for all of them: measured 2026-10-31, 0 of 127 credits were shown,
-- and 126 of them name exactly the image the mirror recorded in
-- logo_origin_url.
--
-- 1. The guard now accepts logo_origin_url as well. That column is written
--    only by the mirror (marketplace-brand-logo-mirror) and by the trigger that
--    diverts a hotlink into it, so it is the image the shown copy was made
--    from. A photo replaced by an unrelated one still hides the credit.
-- 2. Carol Ann Duffy's credit described the mmu.ac.uk photo she no longer
--    shows; her portrait is now the Commons file "Carol Ann Duffy (cropped)".
--    Rewritten for that file, guarded on the old image_url so a later manual
--    edit is not overwritten.

-- Applied live via MCP apply_migration (which stamped this version), so
-- `db push` skips it.
set local lock_timeout = '10s';

create or replace function api_private.get_marketplace_brand(p_slug text)
 returns table(slug text, display_name text, brand_key text, product_count integer, website text, logo_url text, logo_on_ink boolean, story text, ownership_tags text[], is_approved boolean, logo_credit jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
      and t.profile_resolution->'portrait_credit'->>'image_url' in (t.logo_url, t.logo_origin_url)
    then jsonb_build_object(
      'attribution',t.profile_resolution->'portrait_credit'->>'attribution',
      'license',t.profile_resolution->'portrait_credit'->>'license',
      'source_url',t.profile_resolution->'portrait_credit'->>'source_url',
      'license_url',t.profile_resolution->'portrait_credit'->>'license_url'
    ) end
  from target t;
$function$;

update public.marketplace_brands
set profile_resolution = jsonb_set(
      profile_resolution,
      '{portrait_credit}',
      jsonb_build_object(
        'image_url', 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Carol_Ann_Duffy_%28cropped%29.jpg',
        'source_url', 'https://commons.wikimedia.org/wiki/File:Carol_Ann_Duffy_(cropped).jpg',
        'attribution', 'walnut whippet from Hull, UK',
        'license', 'CC BY 2.0',
        'license_url', 'https://creativecommons.org/licenses/by/2.0'
      ))
where slug = 'carol-ann-duffy-dbe'
  and profile_resolution->'portrait_credit'->>'image_url' like 'https://www.mmu.ac.uk/%';

do $verify$
declare
  v_orphaned int;
  v_shown int;
begin
  -- No published maker may carry a credit describing an image it does not show.
  select count(*) into v_orphaned
  from public.marketplace_brands
  where publication_status = 'published'
    and profile_resolution->'portrait_credit' is not null
    and profile_resolution->'portrait_credit'->>'image_url' is distinct from logo_url
    and profile_resolution->'portrait_credit'->>'image_url' is distinct from logo_origin_url;
  if v_orphaned <> 0 then
    raise exception 'maker portrait credits: % published credits describe an image the maker does not show', v_orphaned;
  end if;

  -- And the function must actually return them: count through the RPC itself.
  select count(*) into v_shown
  from public.marketplace_brands b
  cross join lateral api_private.get_marketplace_brand(b.slug) g
  where b.publication_status = 'published'
    and b.profile_resolution->'portrait_credit' is not null
    and g.logo_credit is not null;
  if v_shown = 0 then
    raise exception 'maker portrait credits: get_marketplace_brand returns no credit for any maker';
  end if;
  raise notice 'maker portrait credits shown: %', v_shown;
end
$verify$;
