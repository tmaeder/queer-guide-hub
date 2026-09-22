-- Businesses + brands: role-aware quality contracts, independent brand
-- publication/ownership state, reversible identity changes, and one admin
-- findings queue. See docs/plans/2026-09-22-business-brand-data-quality-design.md.

set lock_timeout = '15s';
set statement_timeout = '300s';

-- ---------------------------------------------------------------------------
-- 1. Durable per-entity outcomes and reversible change history
-- ---------------------------------------------------------------------------

create table if not exists public.entity_quality_findings (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('organization','marketplace_brand')),
  entity_id uuid not null,
  dimension text not null check (dimension in (
    'identity','editorial','contact','location','media','categorization',
    'linkage','provenance','freshness','ownership','product_linkage'
  )),
  state text not null check (state in (
    'pass','fail','pending','not_applicable','source_unavailable'
  )),
  reason_code text not null,
  evidence jsonb not null default '{}'::jsonb,
  source text not null default 'business-brand-quality-v1',
  first_seen_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  waived_at timestamptz,
  waived_by uuid references auth.users(id) on delete set null,
  waiver_note text,
  unique(entity_type,entity_id,dimension)
);
create index if not exists entity_quality_findings_open_idx
  on public.entity_quality_findings(entity_type,state,dimension,checked_at)
  where state in ('fail','pending') and waived_at is null;
alter table public.entity_quality_findings enable row level security;
drop policy if exists entity_quality_findings_admin_read on public.entity_quality_findings;
create policy entity_quality_findings_admin_read on public.entity_quality_findings
  for select to authenticated using (public.has_role_jwt('admin'::public.app_role));
revoke all on public.entity_quality_findings from public,anon,authenticated;
grant select on public.entity_quality_findings to authenticated;
grant all on public.entity_quality_findings to service_role;

create table if not exists public.business_brand_quality_events (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('organization','marketplace_brand')),
  entity_id uuid not null,
  dimension text not null,
  previous_value jsonb,
  new_value jsonb,
  reason_code text not null,
  actor_id uuid references auth.users(id) on delete set null,
  rollback_of bigint references public.business_brand_quality_events(id),
  rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists business_brand_quality_events_entity_idx
  on public.business_brand_quality_events(entity_type,entity_id,created_at desc);
alter table public.business_brand_quality_events enable row level security;
drop policy if exists business_brand_quality_events_admin_read on public.business_brand_quality_events;
create policy business_brand_quality_events_admin_read on public.business_brand_quality_events
  for select to authenticated using (public.has_role_jwt('admin'::public.app_role));
revoke all on public.business_brand_quality_events from public,anon,authenticated;
grant select on public.business_brand_quality_events to authenticated;
grant all on public.business_brand_quality_events to service_role;

-- Extend the marketplace snapshot stream instead of creating a parallel
-- monitoring system. Existing listing consumers continue reading `stats`.
alter table public.marketplace_quality_snapshots
  add column if not exists business_brand_stats jsonb,
  add column if not exists business_brand_by_role jsonb,
  add column if not exists business_brand_by_brand_state jsonb;

-- ---------------------------------------------------------------------------
-- 2. Role-aware organization state and normalized producers
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists linkage_disposition text not null default 'pending',
  add column if not exists last_verified_at timestamptz,
  add column if not exists quality_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists quality_checked_at timestamptz;

alter table public.organizations drop constraint if exists organizations_linkage_disposition_known;
alter table public.organizations add constraint organizations_linkage_disposition_known
  check (linkage_disposition in ('pending','linked','standalone','not_applicable','needs_review')) not valid;

create or replace function public.organizations_normalize_quality_fields()
returns trigger language plpgsql set search_path=public as $$
begin
  new.name := btrim(new.name);
  new.website := nullif(btrim(new.website),'');
  new.website_domain := public.org_normalize_domain(coalesce(new.website_domain,new.website));
  new.email := lower(nullif(btrim(new.email),''));
  new.phone := nullif(btrim(new.phone),'');
  return new;
end;
$$;
drop trigger if exists organizations_normalize_quality_fields_trg on public.organizations;
create trigger organizations_normalize_quality_fields_trg
before insert or update of name,website,website_domain,email,phone on public.organizations
for each row execute function public.organizations_normalize_quality_fields();

update public.organizations
set website_domain=public.org_normalize_domain(coalesce(website_domain,website))
where website_domain is distinct from public.org_normalize_domain(coalesce(website_domain,website));

with linked as (
  select o.id,
    exists(select 1 from public.venues v where v.organization_id=o.id and v.duplicate_of_id is null)
    or exists(select 1 from public.hotels h where h.organization_id=o.id and h.duplicate_of_id is null)
    or exists(select 1 from public.marketplace_merchants m where m.organization_id=o.id)
    or exists(select 1 from public.marketplace_brands b where b.organization_id=o.id)
    or exists(select 1 from public.affiliate_partners a where a.organization_id=o.id)
    or exists(select 1 from public.news_sources n where n.organization_id=o.id) has_link
  from public.organizations o where o.duplicate_of_id is null
)
update public.organizations o set linkage_disposition=case
  when l.has_link then 'linked'
  when o.roles && array['support','advocacy','community']::text[] then 'standalone'
  when o.roles && array['venue','hotel','seller','brand','publisher','affiliate_partner']::text[] then 'needs_review'
  else 'not_applicable' end
from linked l where l.id=o.id;

create or replace function public.reconcile_organization_link_roles()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_changed integer:=0;
begin
  with expected as (
    select o.id,o.roles,
      array_remove(array[
        case when exists(select 1 from venues v where v.organization_id=o.id and v.duplicate_of_id is null) then 'venue' end,
        case when exists(select 1 from hotels h where h.organization_id=o.id and h.duplicate_of_id is null) then 'hotel' end,
        case when exists(select 1 from marketplace_merchants m where m.organization_id=o.id) then 'seller' end,
        case when exists(select 1 from marketplace_brands b where b.organization_id=o.id) then 'brand' end,
        case when exists(select 1 from affiliate_partners a where a.organization_id=o.id) then 'affiliate_partner' end,
        case when exists(select 1 from news_sources n where n.organization_id=o.id) then 'publisher' end
      ],null)::text[] expected_roles
    from organizations o where o.duplicate_of_id is null
  ), changed as (
    select id,roles,(select array_agg(distinct role order by role)
      from unnest(roles||expected_roles) as r(role)) new_roles
    from expected where not roles @> expected_roles
  ), events as (
    insert into business_brand_quality_events
      (entity_type,entity_id,dimension,previous_value,new_value,reason_code)
    select 'organization',id,'categorization',to_jsonb(roles),to_jsonb(new_roles),'linked_entity_requires_role'
    from changed returning entity_id
  )
  update organizations o set roles=c.new_roles,updated_at=now()
  from changed c where c.id=o.id;
  get diagnostics v_changed=row_count;
  return jsonb_build_object('roles_reconciled',v_changed);
end;
$$;
revoke all on function public.reconcile_organization_link_roles() from public,anon,authenticated;
grant execute on function public.reconcile_organization_link_roles() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Independent brand publication and ownership review lifecycles
-- ---------------------------------------------------------------------------

alter table public.marketplace_brands
  add column if not exists publication_status text,
  add column if not exists ownership_review_status text,
  add column if not exists profile_resolution jsonb not null default '{}'::jsonb,
  add column if not exists quality_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists quality_checked_at timestamptz;

update public.marketplace_brands set
  publication_status=coalesce(publication_status,case status
    when 'approved' then 'published' when 'rejected' then 'rejected' else 'draft' end),
  ownership_review_status=coalesce(ownership_review_status,case
    when cardinality(ownership_tags)>0 and nullif(btrim(evidence),'') is not null
      and reviewer_id is not null and reviewed_at is not null then 'verified'
    when cardinality(ownership_tags)>0 then 'needs_review'
    when status='rejected' then 'rejected'
    when cardinality(suggested_tags)>0 then 'pending'
    when status='approved' then 'not_applicable'
    else 'pending' end);

alter table public.marketplace_brands alter column publication_status set default 'draft';
alter table public.marketplace_brands alter column publication_status set not null;
alter table public.marketplace_brands alter column ownership_review_status set default 'pending';
alter table public.marketplace_brands alter column ownership_review_status set not null;
alter table public.marketplace_brands drop constraint if exists marketplace_brands_publication_status_known;
alter table public.marketplace_brands add constraint marketplace_brands_publication_status_known
  check(publication_status in ('draft','published','rejected','retired')) not valid;
alter table public.marketplace_brands drop constraint if exists marketplace_brands_ownership_review_status_known;
alter table public.marketplace_brands add constraint marketplace_brands_ownership_review_status_known
  check(ownership_review_status in ('pending','verified','rejected','not_applicable','needs_review')) not valid;

create or replace function public.marketplace_brands_sync_legacy_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    -- The NOT NULL column default is already present in BEFORE INSERT. Treat a
    -- non-default legacy status as authoritative when old producers omit the
    -- new lifecycle column; otherwise project publication_status to status.
    if new.status in('approved','rejected') and new.publication_status='draft' then
      new.publication_status:=case new.status when 'approved' then 'published' when 'rejected' then 'rejected' else 'draft' end;
    else
      new.status:=case new.publication_status when 'published' then 'approved' when 'draft' then 'pending' else 'rejected' end;
    end if;
  elsif new.publication_status is distinct from old.publication_status then
    new.status:=case new.publication_status when 'published' then 'approved' when 'draft' then 'pending' else 'rejected' end;
  elsif new.status is distinct from old.status then
    new.publication_status:=case new.status when 'approved' then 'published' when 'pending' then 'draft' else 'rejected' end;
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_brands_sync_legacy_status_trg on public.marketplace_brands;
create trigger marketplace_brands_sync_legacy_status_trg
before insert or update of status,publication_status on public.marketplace_brands
for each row execute function public.marketplace_brands_sync_legacy_status();

create table if not exists public.marketplace_brand_slug_redirects (
  old_slug text primary key,
  brand_id uuid not null references public.marketplace_brands(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.marketplace_brand_slug_redirects enable row level security;
drop policy if exists marketplace_brand_slug_redirects_public_read on public.marketplace_brand_slug_redirects;
create policy marketplace_brand_slug_redirects_public_read on public.marketplace_brand_slug_redirects
  for select using(true);
grant select on public.marketplace_brand_slug_redirects to anon,authenticated;
grant all on public.marketplace_brand_slug_redirects to service_role;

create or replace function public.get_marketplace_brand(p_slug text)
returns table(
  slug text,display_name text,brand_key text,product_count integer,website text,
  logo_url text,logo_on_ink boolean,story text,ownership_tags text[],is_approved boolean
)
language sql stable security definer set search_path=public as $$
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
    t.publication_status='published'
  from target t;
$$;
revoke all on function public.get_marketplace_brand(text) from public;
grant execute on function public.get_marketplace_brand(text) to anon,authenticated,service_role;

create or replace function public.get_marketplace_spotlight_brands(p_limit int default 8)
returns table(slug text,display_name text,product_count integer,logo_url text,
  logo_on_ink boolean,ownership_tags text[])
language sql stable security definer set search_path=public as $$
  select b.slug,b.display_name,b.product_count,b.logo_url,coalesce(b.logo_on_ink,false),b.ownership_tags
  from marketplace_brands b
  where b.publication_status='published'
    and b.ownership_review_status='verified'
    and b.ownership_tags && array['queer_owned','trans_owned']::text[]
    and b.slug is not null and b.product_count>0
  order by b.is_spotlight desc,b.product_count desc
  limit greatest(1,least(coalesce(p_limit,8),24));
$$;
revoke all on function public.get_marketplace_spotlight_brands(int) from public;
grant execute on function public.get_marketplace_spotlight_brands(int) to anon,authenticated,service_role;

create or replace function public.get_marketplace_brand_directory()
returns table(
  slug text,display_name text,logo_url text,logo_on_ink boolean,story text,
  product_count integer,ownership_tags text[],cover_url text,cover_thumb text
)
language sql stable set search_path to 'public','pg_temp' as $$
  select b.slug,b.display_name,b.logo_url,b.logo_on_ink,b.story,b.product_count,
    case when b.ownership_review_status='verified' then b.ownership_tags else '{}'::text[] end,
    c.url,
    (select ia.thumbnail_url from image_asset_links k join image_assets ia
      on ia.id=k.asset_id and ia.status='active'
      and ia.optimization_status in('optimized','cdn_optimized')
      where k.entity_type='marketplace_listing' and k.entity_id=c.id and k.sort_order=0 limit 1)
  from marketplace_brands b
  left join lateral (
    select l.id,l.images[1] url from marketplace_listings l
    where l.brand_key=b.brand_key and l.status='active'
      and l.content_rating in('sfw','suggestive') and coalesce(l.images[1],'')<>''
    order by l.boutique_score desc nulls last,l.images[1] limit 1
  ) c on true
  where b.publication_status='published' and b.slug is not null and b.product_count>0
  order by b.product_count desc nulls last,b.slug;
$$;
revoke all on function public.get_marketplace_brand_directory() from public;
grant execute on function public.get_marketplace_brand_directory() to anon,authenticated,service_role;

create or replace function public.get_marketplace_brand_covers(
  p_limit integer default 12,p_seed integer default null)
returns table(slug text,display_name text,logo_url text,logo_on_ink boolean,
  product_count integer,ownership_tags text[],covers jsonb)
language sql stable set search_path to 'public','pg_temp' as $$
  with pool as (
    select b.slug,b.brand_key,b.display_name,b.logo_url,b.logo_on_ink,b.product_count,
      case when b.ownership_review_status='verified' then b.ownership_tags else '{}'::text[] end ownership_tags
    from marketplace_brands b
    where b.publication_status='published' and b.slug is not null and b.product_count>0 and b.logo_url is not null
    order by hashtext(b.slug||coalesce(p_seed,(current_date-date '2026-01-01'))::text),b.slug limit 60
  ), picked as (
    select p.slug,p.display_name,p.logo_url,p.logo_on_ink,p.product_count,p.ownership_tags,c.covers
    from pool p join lateral (
      select jsonb_agg(jsonb_build_object('id',t.id,'url',t.url) order by t.score desc nulls last,t.url) covers
      from (
        select (array_agg(cand.id order by cand.boutique_score desc nulls last))[1] id,
          cand.url,max(cand.boutique_score) score
        from (
          select l.id,l.images[1] url,l.boutique_score from marketplace_listings l
          where l.brand_key=p.brand_key and l.status='active'
            and l.content_rating in('sfw','suggestive') and coalesce(l.images[1],'')<>''
          order by l.boutique_score desc nulls last,l.id limit 60
        ) cand group by cand.url order by max(cand.boutique_score) desc nulls last,cand.url limit 3
      ) t
    ) c on jsonb_array_length(c.covers)>=3
    limit greatest(1,least(coalesce(p_limit,12),24))
  )
  select p.slug,p.display_name,p.logo_url,p.logo_on_ink,p.product_count,p.ownership_tags,
    (select jsonb_agg(jsonb_build_object('url',e->>'url','thumb',
      (select ia.thumbnail_url from image_asset_links k join image_assets ia
        on ia.id=k.asset_id and ia.status='active' and ia.optimization_status in('optimized','cdn_optimized')
        where k.entity_type='marketplace_listing' and k.entity_id=(e->>'id')::uuid and k.sort_order=0 limit 1)) order by ord)
      from jsonb_array_elements(p.covers) with ordinality a(e,ord))
  from picked p;
$$;
revoke all on function public.get_marketplace_brand_covers(integer,integer) from public;
grant execute on function public.get_marketplace_brand_covers(integer,integer) to anon,authenticated,service_role;

create or replace function public.approve_marketplace_brand(
  p_brand_id uuid,p_tags text[],p_confirm boolean default false,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b marketplace_brands%rowtype; v_sensitive boolean;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into b from marketplace_brands where id=p_brand_id for update;
  if not found then raise exception 'brand not found' using errcode='22023'; end if;
  if not(coalesce(p_tags,'{}') <@ array['queer_owned','trans_owned','bipoc_owned','women_owned','disabled_owned','nonprofit']::text[])
    then raise exception 'ownership tag outside vocabulary' using errcode='22023'; end if;
  v_sensitive:=coalesce(p_tags,'{}') && array['queer_owned','trans_owned','bipoc_owned']::text[];
  if v_sensitive and not p_confirm then raise exception 'sensitive ownership claim requires explicit confirmation' using errcode='22023'; end if;
  if cardinality(coalesce(p_tags,'{}'))>0 and nullif(btrim(coalesce(p_note,b.evidence,'')),'') is null then
    raise exception 'ownership claim requires evidence' using errcode='22023';
  end if;
  update marketplace_brands set ownership_tags=coalesce(p_tags,'{}'),
    ownership_review_status=case when cardinality(coalesce(p_tags,'{}'))>0 then 'verified' else 'not_applicable' end,
    publication_status='published',confidence=1.0,detection_source='admin',
    evidence=case when cardinality(coalesce(p_tags,'{}'))>0 then coalesce(nullif(btrim(p_note),''),evidence) else evidence end,
    reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now(),updated_at=now()
  where id=p_brand_id;
  return jsonb_build_object('approved',true,'brand_id',p_brand_id,'tags',coalesce(p_tags,'{}'::text[]));
end;
$$;
revoke all on function public.approve_marketplace_brand(uuid,text[],boolean,text) from public,anon;
grant execute on function public.approve_marketplace_brand(uuid,text[],boolean,text) to authenticated,service_role;

create or replace function public.reject_marketplace_brand(p_brand_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  update marketplace_brands set ownership_tags='{}',ownership_review_status='rejected',
    reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now(),updated_at=now()
  where id=p_brand_id;
  if not found then raise exception 'brand not found' using errcode='22023'; end if;
  return jsonb_build_object('rejected',true,'brand_id',p_brand_id);
end;
$$;
revoke all on function public.reject_marketplace_brand(uuid,text) from public,anon;
grant execute on function public.reject_marketplace_brand(uuid,text) to authenticated,service_role;

create or replace function public.marketplace_brands_pending(p_limit int default 50)
returns setof public.marketplace_brands language sql stable security definer set search_path=public as $$
  select * from marketplace_brands
  where public.has_role_jwt('admin'::app_role)
    and ownership_review_status in('pending','needs_review')
  order by (cardinality(suggested_tags)>0) desc,product_count desc
  limit greatest(1,least(coalesce(p_limit,50),500));
$$;
revoke all on function public.marketplace_brands_pending(int) from public,anon;
grant execute on function public.marketplace_brands_pending(int) to authenticated,service_role;

-- Exact brand-domain matches are safe only when the normalized domain points
-- at one active organization. Names and retailer product URLs never auto-link.
create or replace function public.link_brand_organization_domain_matches(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_linked integer:=0;
begin
  with unique_org_domain as (
    select public.org_normalize_domain(website_domain) domain,min(id) id
    from organizations where status='active' and duplicate_of_id is null
      and public.org_normalize_domain(website_domain) is not null
    group by 1 having count(*)=1
  ), pick as (
    select b.id brand_id,o.id organization_id
    from marketplace_brands b join unique_org_domain o
      on o.domain=public.org_normalize_domain(b.website)
    where b.organization_id is null and b.product_count>0
    order by b.product_count desc,b.id limit greatest(1,least(coalesce(p_limit,500),2000))
  ), events as (
    insert into business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
    select 'marketplace_brand',brand_id,'linkage','null'::jsonb,to_jsonb(organization_id),'brand_domain_exact_unique'
    from pick returning entity_id
  )
  update marketplace_brands b set organization_id=p.organization_id,updated_at=now()
  from pick p where b.id=p.brand_id and b.organization_id is null;
  get diagnostics v_linked=row_count;
  update organizations o set roles=(select array_agg(distinct role order by role)
    from unnest(o.roles||array['brand']) as r(role))
  where exists(select 1 from marketplace_brands b where b.organization_id=o.id) and not('brand'=any(o.roles));
  return jsonb_build_object('linked',v_linked);
end;
$$;
revoke all on function public.link_brand_organization_domain_matches(int) from public,anon,authenticated;
grant execute on function public.link_brand_organization_domain_matches(int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. One refresh computes role-aware findings, compatibility scores and stats
-- ---------------------------------------------------------------------------

create or replace function public.refresh_business_brand_quality()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_findings integer:=0; v_batch integer:=0; v_orgs integer:=0; v_brands integer:=0;
  v_snapshot bigint; v_stats jsonb; v_by_role jsonb; v_by_brand_state jsonb;
begin
  perform public.reconcile_organization_link_roles();
  perform public.link_brand_organization_domain_matches(500);

  with org as (
    select o.*,
      exists(select 1 from venues v where v.organization_id=o.id and v.duplicate_of_id is null)
      or exists(select 1 from hotels h where h.organization_id=o.id and h.duplicate_of_id is null)
      or exists(select 1 from marketplace_merchants m where m.organization_id=o.id)
      or exists(select 1 from marketplace_brands b where b.organization_id=o.id)
      or exists(select 1 from affiliate_partners a where a.organization_id=o.id)
      or exists(select 1 from news_sources n where n.organization_id=o.id) has_link
    from organizations o where o.duplicate_of_id is null
  ), rows as (
    select 'organization'::text entity_type,o.id entity_id,v.dimension,
      v.state,v.reason_code,v.evidence
    from org o cross join lateral (values
      ('identity',case when nullif(btrim(o.name),'') is not null and nullif(btrim(o.slug),'') is not null then 'pass' else 'fail' end,
        case when nullif(btrim(o.name),'') is not null and nullif(btrim(o.slug),'') is not null then 'identity_complete' else 'identity_missing' end,jsonb_build_object('name',o.name,'slug',o.slug)),
      ('editorial',case when length(coalesce(btrim(o.description),''))>=80 then 'pass' else 'fail' end,
        case when length(coalesce(btrim(o.description),''))>=80 then 'description_usable' else 'description_missing_or_thin' end,jsonb_build_object('length',length(coalesce(btrim(o.description),'')))),
      ('contact',case when coalesce(o.website,o.email,o.phone) is not null or o.social<>'{}'::jsonb then 'pass' else 'fail' end,
        case when coalesce(o.website,o.email,o.phone) is not null or o.social<>'{}'::jsonb then 'contact_available' else 'contact_missing' end,jsonb_build_object('website',o.website is not null,'email',o.email is not null,'phone',o.phone is not null,'social',o.social<>'{}'::jsonb)),
      ('location',case when not(o.roles && array['venue','hotel','support','community','advocacy']::text[]) then 'not_applicable'
        when (o.city_id is not null and o.country_id is not null) or (o.latitude is not null and o.longitude is not null) then 'pass' else 'fail' end,
        case when not(o.roles && array['venue','hotel','support','community','advocacy']::text[]) then 'role_has_no_location_requirement'
          when (o.city_id is not null and o.country_id is not null) or (o.latitude is not null and o.longitude is not null) then 'location_complete' else 'location_missing' end,
        jsonb_build_object('city_id',o.city_id,'country_id',o.country_id,'coordinates',o.latitude is not null and o.longitude is not null)),
      ('media',case when o.logo_url is not null or o.cover_image_url is not null or cardinality(o.images)>0 then 'pass' else 'fail' end,
        case when o.logo_url is not null or o.cover_image_url is not null or cardinality(o.images)>0 then 'media_available' else 'media_missing' end,jsonb_build_object('logo',o.logo_url is not null,'cover',o.cover_image_url is not null,'images',cardinality(o.images))),
      ('categorization',case when cardinality(o.roles)>0 then 'pass' else 'fail' end,
        case when cardinality(o.roles)>0 then 'roles_present' else 'roles_missing' end,jsonb_build_object('roles',o.roles,'tags',o.tags,'target_groups',o.target_groups)),
      ('linkage',case when o.has_link or o.linkage_disposition in('standalone','not_applicable') then 'pass'
        when o.linkage_disposition='needs_review' then 'fail' else 'pending' end,
        case when o.has_link then 'linked_entity_present' when o.linkage_disposition='standalone' then 'verified_standalone'
          when o.linkage_disposition='not_applicable' then 'link_not_applicable' when o.linkage_disposition='needs_review' then 'expected_link_missing' else 'linkage_unresolved' end,
        jsonb_build_object('disposition',o.linkage_disposition)),
      ('provenance',case when o.field_provenance<>'{}'::jsonb then 'pass' else 'fail' end,
        case when o.field_provenance<>'{}'::jsonb then 'field_provenance_present' else 'field_provenance_missing' end,jsonb_build_object('fields',jsonb_object_length(o.field_provenance))),
      ('freshness',case when o.last_verified_at is null then 'pending' when o.last_verified_at>=now()-interval '365 days' then 'pass' else 'fail' end,
        case when o.last_verified_at is null then 'never_verified' when o.last_verified_at>=now()-interval '365 days' then 'verified_within_365d' else 'verification_stale' end,jsonb_build_object('last_verified_at',o.last_verified_at))
    ) v(dimension,state,reason_code,evidence)
  )
  insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code,evidence)
  select entity_type,entity_id,dimension,state,reason_code,evidence from rows
  on conflict(entity_type,entity_id,dimension) do update set
    state=excluded.state,reason_code=excluded.reason_code,evidence=excluded.evidence,
    source=excluded.source,checked_at=now(),waived_at=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_at end,
    waived_by=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_by end,
    waiver_note=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waiver_note end;
  get diagnostics v_findings=row_count;

  with actual as (
    select b.id,b.brand_key,count(l.id)::int n
    from marketplace_brands b left join marketplace_listings l
      on l.brand_key=b.brand_key and l.status='active' and l.duplicate_of_id is null
    group by b.id,b.brand_key
  ), rows as (
    select 'marketplace_brand'::text entity_type,b.id entity_id,v.dimension,v.state,v.reason_code,v.evidence
    from marketplace_brands b join actual a on a.id=b.id
    cross join lateral (values
      ('identity',case when b.slug is not null and nullif(btrim(b.display_name),'') is not null and b.product_count>0 then 'pass' else 'fail' end,
        case when b.slug is null then 'slug_missing' when b.product_count=0 then 'no_active_products' else 'identity_complete' end,jsonb_build_object('slug',b.slug,'display_name',b.display_name,'products',b.product_count)),
      ('editorial',case when length(coalesce(btrim(b.story),''))>=80 then 'pass'
        when b.profile_resolution->>'story'='source_unavailable' then 'source_unavailable' else 'fail' end,
        case when length(coalesce(btrim(b.story),''))>=80 then 'story_usable' when b.profile_resolution->>'story'='source_unavailable' then 'story_source_unavailable' else 'story_missing_or_thin' end,jsonb_build_object('length',length(coalesce(btrim(b.story),'')))),
      ('contact',case when b.website is not null then 'pass' when b.profile_resolution->>'website'='source_unavailable' then 'source_unavailable' else 'fail' end,
        case when b.website is not null then 'website_available' when b.profile_resolution->>'website'='source_unavailable' then 'website_source_unavailable' else 'website_missing' end,jsonb_build_object('website',b.website)),
      ('media',case when b.logo_url is not null then 'pass' when b.logo_fetched_at is not null or b.profile_resolution->>'logo'='source_unavailable' then 'source_unavailable' else 'pending' end,
        case when b.logo_url is not null then 'logo_available' when b.logo_fetched_at is not null then 'logo_lookup_exhausted' else 'logo_lookup_pending' end,jsonb_build_object('logo_url',b.logo_url,'logo_fetched_at',b.logo_fetched_at)),
      ('linkage',case when b.organization_id is not null then 'pass' when b.profile_resolution->>'organization'='source_unavailable' then 'source_unavailable' else 'pending' end,
        case when b.organization_id is not null then 'organization_linked' when b.profile_resolution->>'organization'='source_unavailable' then 'organization_source_unavailable' else 'organization_link_pending' end,jsonb_build_object('organization_id',b.organization_id)),
      ('ownership',case when b.ownership_review_status in('verified','not_applicable','rejected') then 'pass'
        when b.ownership_review_status='needs_review' then 'fail' else 'pending' end,
        'ownership_'||b.ownership_review_status,jsonb_build_object('status',b.ownership_review_status,'tags',b.ownership_tags,'evidence',b.evidence,'reviewed_at',b.reviewed_at)),
      ('product_linkage',case when b.product_count=a.n then 'pass' else 'fail' end,
        case when b.product_count=a.n then 'product_count_matches' else 'product_count_drift' end,jsonb_build_object('stored',b.product_count,'actual',a.n)),
      ('provenance',case when b.detection_source is not null and (cardinality(b.ownership_tags)=0 or nullif(btrim(b.evidence),'') is not null) then 'pass' else 'fail' end,
        case when cardinality(b.ownership_tags)>0 and nullif(btrim(b.evidence),'') is null then 'ownership_evidence_missing' else 'brand_provenance_present' end,jsonb_build_object('detection_source',b.detection_source,'evidence',b.evidence))
    ) v(dimension,state,reason_code,evidence)
    where b.product_count>0 or b.publication_status='published'
  )
  insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code,evidence)
  select entity_type,entity_id,dimension,state,reason_code,evidence from rows
  on conflict(entity_type,entity_id,dimension) do update set
    state=excluded.state,reason_code=excluded.reason_code,evidence=excluded.evidence,
    source=excluded.source,checked_at=now(),waived_at=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_at end,
    waived_by=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_by end,
    waiver_note=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waiver_note end;
  get diagnostics v_batch=row_count;
  v_findings:=v_findings+v_batch;

  with d as (
    select entity_id,jsonb_object_agg(dimension,jsonb_build_object('state',state,'reason_code',reason_code,'waived',waived_at is not null)) dimensions,
      round(100.0*count(*)filter(where state='pass' or waived_at is not null)/nullif(count(*)filter(where state<>'not_applicable'),0))::smallint score
    from entity_quality_findings where entity_type='organization' group by entity_id
  ) update organizations o set quality_dimensions=d.dimensions,quality_checked_at=now(),completeness_score=coalesce(d.score,0),needs_attention=coalesce(d.score,0)<60
    from d where d.entity_id=o.id;
  get diagnostics v_orgs=row_count;

  with d as (
    select entity_id,jsonb_object_agg(dimension,jsonb_build_object('state',state,'reason_code',reason_code,'waived',waived_at is not null)) dimensions
    from entity_quality_findings where entity_type='marketplace_brand' group by entity_id
  ) update marketplace_brands b set quality_dimensions=d.dimensions,quality_checked_at=now()
    from d where d.entity_id=b.id;
  get diagnostics v_brands=row_count;

  select jsonb_build_object(
      'organizations_total',(select count(*) from organizations where duplicate_of_id is null),
      'organizations_open',(select count(*) from entity_quality_findings where entity_type='organization' and state in('fail','pending') and waived_at is null),
      'brands_total',(select count(*) from marketplace_brands where product_count>0),
      'brands_open',(select count(*) from entity_quality_findings where entity_type='marketplace_brand' and state in('fail','pending') and waived_at is null),
      'ownership_needs_review',(select count(*) from marketplace_brands where ownership_review_status='needs_review'),
      'brand_product_count_drift',(select count(*) from entity_quality_findings where entity_type='marketplace_brand' and reason_code='product_count_drift' and state='fail'),
      'roles_link_mismatch',(select count(*) from organizations o where o.duplicate_of_id is null and (
        (exists(select 1 from venues v where v.organization_id=o.id and v.duplicate_of_id is null) and not('venue'=any(o.roles)))
        or (exists(select 1 from hotels h where h.organization_id=o.id and h.duplicate_of_id is null) and not('hotel'=any(o.roles)))
        or (exists(select 1 from marketplace_merchants m where m.organization_id=o.id) and not('seller'=any(o.roles)))
        or (exists(select 1 from marketplace_brands b where b.organization_id=o.id) and not('brand'=any(o.roles)))
        or (exists(select 1 from affiliate_partners a where a.organization_id=o.id) and not('affiliate_partner'=any(o.roles)))
        or (exists(select 1 from news_sources n where n.organization_id=o.id) and not('publisher'=any(o.roles))))),
      'findings_by_state',(select jsonb_object_agg(state,n) from(select state,count(*) n from entity_quality_findings group by state)x),
      'findings_by_reason',(select jsonb_object_agg(reason_code,n) from(select reason_code,count(*) n from entity_quality_findings group by reason_code)x),
      'brands_by_source',(select coalesce(jsonb_object_agg(source_name,n),'{}'::jsonb) from(
        select coalesce(nullif(detection_source,''),'unknown') source_name,count(*) n
        from marketplace_brands where product_count>0 group by 1)x)
    ),
    (select coalesce(jsonb_object_agg(role,n),'{}'::jsonb) from(select role,count(*) n from organizations o cross join lateral unnest(o.roles) role where o.duplicate_of_id is null group by role)x),
    (select coalesce(jsonb_object_agg(publication_status||'/'||ownership_review_status,n),'{}'::jsonb) from(select publication_status,ownership_review_status,count(*) n from marketplace_brands group by 1,2)x)
  into v_stats,v_by_role,v_by_brand_state;

  update marketplace_quality_snapshots set business_brand_stats=v_stats,
    business_brand_by_role=v_by_role,business_brand_by_brand_state=v_by_brand_state
  where id=(select id from marketplace_quality_snapshots order by taken_at desc limit 1)
  returning id into v_snapshot;
  if v_snapshot is null then
    perform public.run_marketplace_quality_snapshot();
    update marketplace_quality_snapshots set business_brand_stats=v_stats,
      business_brand_by_role=v_by_role,business_brand_by_brand_state=v_by_brand_state
    where id=(select id from marketplace_quality_snapshots order by taken_at desc limit 1)
    returning id into v_snapshot;
  end if;

  with keys(key) as (values('organizations_open'),('brands_open')),
  series as (
    select k.key,array_agg((q.business_brand_stats->>k.key)::numeric order by q.taken_at desc) values_desc
    from keys k cross join lateral (
      select business_brand_stats,taken_at from marketplace_quality_snapshots
      where business_brand_stats is not null order by taken_at desc limit 3
    ) q group by k.key
  ), growing as (
    select key,values_desc from series where cardinality(values_desc)=3
      and values_desc[1]>values_desc[2] and values_desc[2]>values_desc[3]
  )
  insert into marketplace_quality_alerts(alert_type,dedupe_key,severity,message,details)
  select 'business_brand_backlog_growth','business-brand:'||key,'warning',
    key||' grew for two consecutive snapshots',jsonb_build_object('values',values_desc)
  from growing on conflict(dedupe_key) where resolved_at is null do update
    set last_seen_at=now(),details=excluded.details,message=excluded.message;

  with keys(key) as (values('organizations_open'),('brands_open')),
  series as (
    select k.key,array_agg((q.business_brand_stats->>k.key)::numeric order by q.taken_at desc) values_desc
    from keys k cross join lateral (
      select business_brand_stats,taken_at from marketplace_quality_snapshots
      where business_brand_stats is not null order by taken_at desc limit 3
    ) q group by k.key
  )
  update marketplace_quality_alerts a set resolved_at=now()
  where a.alert_type='business_brand_backlog_growth' and a.resolved_at is null
    and not exists(select 1 from series s where a.dedupe_key='business-brand:'||s.key
      and cardinality(s.values_desc)=3 and s.values_desc[1]>s.values_desc[2]
      and s.values_desc[2]>s.values_desc[3]);

  return jsonb_build_object('findings_upserted',v_findings,'organizations_scored',v_orgs,'brands_scored',v_brands,'snapshot_id',v_snapshot);
end;
$$;
revoke all on function public.refresh_business_brand_quality() from public,anon,authenticated;
grant execute on function public.refresh_business_brand_quality() to service_role;

create or replace function public.business_brand_quality_stats()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role_jwt('admin'::app_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  return jsonb_build_object(
    'latest',(select jsonb_build_object('id',id,'taken_at',taken_at,'stats',business_brand_stats,
      'by_role',business_brand_by_role,'by_brand_state',business_brand_by_brand_state)
      from marketplace_quality_snapshots where business_brand_stats is not null order by taken_at desc limit 1),
    'previous',(select jsonb_build_object('id',id,'taken_at',taken_at,'stats',business_brand_stats,
      'by_role',business_brand_by_role,'by_brand_state',business_brand_by_brand_state)
      from marketplace_quality_snapshots where business_brand_stats is not null order by taken_at desc offset 1 limit 1),
    'open_findings',(select count(*) from entity_quality_findings where state in('fail','pending') and waived_at is null),
    'by_dimension',(select coalesce(jsonb_agg(to_jsonb(x) order by entity_type,dimension,state),'[]'::jsonb)
      from(select entity_type,dimension,state,count(*) n from entity_quality_findings group by 1,2,3)x)
  );
end;
$$;
revoke all on function public.business_brand_quality_stats() from public,anon;
grant execute on function public.business_brand_quality_stats() to authenticated,service_role;

create or replace function public.business_brand_quality_findings(
  p_entity_type text default null,p_state text default null,p_dimension text default null,
  p_resolution text default 'open',p_limit int default 200)
returns table(id bigint,entity_type text,entity_id uuid,entity_name text,dimension text,state text,reason_code text,evidence jsonb,checked_at timestamptz,waived_at timestamptz,waiver_note text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role_jwt('admin'::app_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  return query select f.id,f.entity_type,f.entity_id,
    case when f.entity_type='organization' then o.name else b.display_name end,
    f.dimension,f.state,f.reason_code,f.evidence,f.checked_at,f.waived_at,f.waiver_note
  from entity_quality_findings f
  left join organizations o on f.entity_type='organization' and o.id=f.entity_id
  left join marketplace_brands b on f.entity_type='marketplace_brand' and b.id=f.entity_id
  where (p_entity_type is null or f.entity_type=p_entity_type)
    and (p_state is null or f.state=p_state)
    and (p_dimension is null or f.dimension=p_dimension)
    and f.state in('fail','pending')
    and ((coalesce(p_resolution,'open')='open' and f.waived_at is null)
      or (p_resolution='waived' and f.waived_at is not null))
  order by case f.state when 'fail' then 0 else 1 end,f.checked_at,f.id
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;
revoke all on function public.business_brand_quality_findings(text,text,text,text,int) from public,anon;
grant execute on function public.business_brand_quality_findings(text,text,text,text,int) to authenticated,service_role;

create or replace function public.resolve_business_brand_quality_findings(
  p_ids bigint[],p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_changed integer;
begin
  if not public.has_role_jwt('admin'::app_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_action not in('waive','reopen') then raise exception 'unknown action' using errcode='22023'; end if;
  if p_action='waive' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'waiver note required' using errcode='22023'; end if;
  update entity_quality_findings set
    waived_at=case when p_action='waive' then now() else null end,
    waived_by=case when p_action='waive' then auth.uid() else null end,
    waiver_note=case when p_action='waive' then p_note else null end,
    checked_at=now()
  where id=any(p_ids);
  get diagnostics v_changed=row_count;
  return jsonb_build_object('action',p_action,'changed',v_changed);
end;
$$;
revoke all on function public.resolve_business_brand_quality_findings(bigint[],text,text) from public,anon;
grant execute on function public.resolve_business_brand_quality_findings(bigint[],text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5. Scheduled refresh and postconditions
-- ---------------------------------------------------------------------------

insert into public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
values('business_brand_quality_refresh','Business and brand quality refresh',
  'Nightly role-aware organization and brand findings, reconciliation and snapshots.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','business-brand-quality-refresh','command','select public.refresh_business_brand_quality();'),
  '35 5 * * *',3)
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=true,action=excluded.action,schedule=excluded.schedule,auto_pause_threshold=3,updated_at=now();

select public.refresh_business_brand_quality();
select public.sync_automations_to_cron(true);

alter table public.organizations validate constraint organizations_linkage_disposition_known;
alter table public.marketplace_brands validate constraint marketplace_brands_publication_status_known;
alter table public.marketplace_brands validate constraint marketplace_brands_ownership_review_status_known;

do $verify$
declare v_missing_org integer; v_missing_brand integer; v_bad_claim integer; v_role_drift integer;
begin
  select count(*) into v_missing_org from organizations o
  where o.duplicate_of_id is null and (select count(*) from entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id)<>9;
  select count(*) into v_missing_brand from marketplace_brands b
  where (b.product_count>0 or b.publication_status='published') and (select count(*) from entity_quality_findings f where f.entity_type='marketplace_brand' and f.entity_id=b.id)<>8;
  select count(*) into v_bad_claim from marketplace_brands
  where ownership_review_status='verified' and (cardinality(ownership_tags)=0 or nullif(btrim(evidence),'') is null or reviewer_id is null or reviewed_at is null);
  select count(*) into v_role_drift from organizations o
  where o.duplicate_of_id is null and (
    (exists(select 1 from venues v where v.organization_id=o.id and v.duplicate_of_id is null) and not('venue'=any(o.roles)))
    or (exists(select 1 from hotels h where h.organization_id=o.id and h.duplicate_of_id is null) and not('hotel'=any(o.roles)))
    or (exists(select 1 from marketplace_merchants m where m.organization_id=o.id) and not('seller'=any(o.roles)))
    or (exists(select 1 from marketplace_brands b where b.organization_id=o.id) and not('brand'=any(o.roles)))
    or (exists(select 1 from affiliate_partners a where a.organization_id=o.id) and not('affiliate_partner'=any(o.roles)))
    or (exists(select 1 from news_sources n where n.organization_id=o.id) and not('publisher'=any(o.roles)))
  );
  if v_missing_org>0 then raise exception '% organizations lack the 9-dimension contract',v_missing_org; end if;
  if v_missing_brand>0 then raise exception '% brands lack the 8-dimension contract',v_missing_brand; end if;
  if v_bad_claim>0 then raise exception '% verified ownership claims lack evidence/review provenance',v_bad_claim; end if;
  if v_role_drift>0 then raise exception '% linked organizations still lack a role',v_role_drift; end if;
end;
$verify$;

reset statement_timeout;
reset lock_timeout;
