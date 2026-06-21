-- Support organizations: promote community-center / organization venues to org profiles
-- with a 'support' role, so help & advocacy orgs are first-class and discoverable.

create or replace function public.run_promote_support_orgs()
returns integer language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
declare v_created integer;
begin
  -- 1) Venues already linked to an org → just add the 'support' role.
  with sv as (
    select distinct v.organization_id as org_id
    from public.venues v
    where v.category in ('community_center','organization')
      and v.organization_id is not null and v.duplicate_of_id is null
  )
  update public.organizations o
  set roles = (select array(select distinct unnest(o.roles || array['support'])))
  from sv where o.id = sv.org_id and not (o.roles @> array['support']);

  -- 2) Unlinked support venues → create an org (venue+support) and link it.
  with cand as (
    select v.id as venue_id, v.name, v.description,
           nullif(lower(v.website_domain),'') as domain, v.website, v.logo_url,
           v.city_id, v.country_id,
           (case when array_length(v.images,1) > 0 then v.images[1] else v.logo_url end) as cover,
           public.generate_slug(coalesce(nullif(trim(v.name),''),'support')) as base_slug,
           row_number() over (
             partition by public.generate_slug(coalesce(nullif(trim(v.name),''),'support'))
             order by v.id) as rn
    from public.venues v
    where v.category in ('community_center','organization')
      and v.organization_id is null and v.duplicate_of_id is null
  ),
  ins as (
    insert into public.organizations
      (slug, name, description, roles, website, website_domain, logo_url, cover_image_url,
       city_id, country_id, primary_venue_id, enrichment_status)
    select
      case when c.rn = 1 and not exists (select 1 from public.organizations o2 where o2.slug = c.base_slug)
           then c.base_slug else c.base_slug || '-' || left(md5(c.venue_id::text), 4) end,
      c.name, c.description, array['venue','support'], c.website, c.domain, c.logo_url, c.cover,
      c.city_id, c.country_id, c.venue_id,
      jsonb_build_object('org_backfill', jsonb_build_object('kind','support_venue','ref_id', c.venue_id))
    from cand c
    returning id, (enrichment_status->'org_backfill'->>'ref_id')::uuid as venue_id
  )
  update public.venues v set organization_id = ins.id from ins where v.id = ins.venue_id;
  get diagnostics v_created = row_count;
  return v_created;
end $$;

grant execute on function public.run_promote_support_orgs() to service_role;

select public.run_promote_support_orgs();

-- Directory listing for the org index page + the /help support section.
drop function if exists public.list_organizations(text,text,uuid,int,int);
create or replace function public.list_organizations(
  p_role text default null, p_q text default null, p_country_id uuid default null,
  p_limit int default 60, p_offset int default 0, p_country_code text default null)
returns setof public.organizations language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select * from public.organizations o
  where o.status = 'active'
    and (p_role is null or o.roles @> array[p_role])
    and (p_country_id is null or o.country_id = p_country_id)
    and (p_country_code is null or p_country_code = 'ALL'
         or o.country_id = (select id from public.countries where upper(code) = upper(p_country_code) limit 1))
    and (p_q is null or p_q = '' or o.name ilike '%'||p_q||'%')
  order by (o.logo_url is not null) desc, o.completeness_score desc nulls last, o.name
  limit greatest(0, least(coalesce(p_limit,60), 100)) offset greatest(0, coalesce(p_offset,0));
$$;
grant execute on function public.list_organizations(text,text,uuid,int,int,text) to anon, authenticated;
