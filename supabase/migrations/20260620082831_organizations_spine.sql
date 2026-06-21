-- Organizations spine: one brand identity unifying venues, news outlets, and marketplace sellers.
-- A lightweight identity table; existing entities link UP via nullable organization_id.
-- Roles (publisher/seller/venue/organizer/community) hang off the spine — no destructive merge.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  description text,
  editorial_hook text,
  editorial_long text,
  logo_url text,
  cover_image_url text,
  images text[] not null default '{}',
  roles text[] not null default '{}',
  primary_venue_id uuid references public.venues(id) on delete set null,
  website text,
  website_domain text,
  email text,
  phone text,
  social jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  target_groups text[] not null default '{}',
  city_id uuid references public.cities(id) on delete set null,
  country_id uuid references public.countries(id) on delete set null,
  completeness_score smallint not null default 0,
  trust_score smallint,
  needs_attention boolean not null default false,
  field_provenance jsonb not null default '{}'::jsonb,
  enrichment_status jsonb not null default '{}'::jsonb,
  claimed_by uuid,
  claim_status text not null default 'unclaimed',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organizations_website_domain on public.organizations(lower(website_domain));
create index if not exists idx_organizations_primary_venue on public.organizations(primary_venue_id);
create index if not exists idx_organizations_city on public.organizations(city_id);
create index if not exists idx_organizations_country on public.organizations(country_id);
create index if not exists idx_organizations_roles on public.organizations using gin(roles);
create index if not exists idx_organizations_tags on public.organizations using gin(tags);
create index if not exists idx_organizations_status on public.organizations(status);

-- Link columns (additive, nullable: ADD COLUMN with no default does not rewrite rows)
alter table public.venues add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.news_sources add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.marketplace_merchants add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_venues_organization_id on public.venues(organization_id);
create index if not exists idx_news_sources_organization_id on public.news_sources(organization_id);
create index if not exists idx_marketplace_merchants_organization_id on public.marketplace_merchants(organization_id);

-- updated_at touch
create or replace function public.organizations_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_organizations_touch on public.organizations;
create trigger trg_organizations_touch before update on public.organizations
  for each row execute function public.organizations_touch_updated_at();

-- RLS: public reads active orgs; admins manage; service_role bypasses.
alter table public.organizations enable row level security;
grant select on public.organizations to anon, authenticated;
grant all on public.organizations to service_role;
drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read on public.organizations for select using (status = 'active');
drop policy if exists organizations_admin_all on public.organizations;
create policy organizations_admin_all on public.organizations for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_organization(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object(
    'article_count', (select count(*) from news_articles a join news_sources s on s.id = a.source_id
                      where s.organization_id = o.id and a.duplicate_of_id is null),
    'product_count', (select count(*) from marketplace_listings l
                      where o.website_domain is not null and lower(l.merchant_domain) = lower(o.website_domain)
                        and l.status = 'active'),
    'venue_count', (select count(*) from venues v where v.organization_id = o.id and v.duplicate_of_id is null),
    'venues', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', v.id, 'slug', v.slug, 'name', v.name, 'city', v.city,
                  'latitude', v.latitude, 'longitude', v.longitude, 'image_url',
                  case when array_length(v.images,1) > 0 then v.images[1] else v.logo_url end)
                  order by (v.id = o.primary_venue_id) desc, v.name)
                from venues v where v.organization_id = o.id and v.duplicate_of_id is null), '[]'::jsonb)
  )
  from organizations o
  where o.slug = p_slug and o.status = 'active';
$$;

create or replace function public.organization_articles(p_org_id uuid, p_limit int default 24, p_offset int default 0)
returns setof news_articles language sql stable security definer set search_path = public as $$
  select a.* from news_articles a
  join news_sources s on s.id = a.source_id
  where s.organization_id = p_org_id and a.duplicate_of_id is null
  order by a.published_at desc nulls last
  limit greatest(0, least(coalesce(p_limit,24), 60)) offset greatest(0, coalesce(p_offset,0));
$$;

create or replace function public.organization_products(p_org_id uuid, p_limit int default 24, p_offset int default 0)
returns setof marketplace_listings language sql stable security definer set search_path = public as $$
  select l.* from marketplace_listings l
  join organizations o on o.id = p_org_id
  where o.website_domain is not null and lower(l.merchant_domain) = lower(o.website_domain)
    and l.status = 'active'
  order by l.featured desc nulls last, l.views_count desc nulls last
  limit greatest(0, least(coalesce(p_limit,24), 60)) offset greatest(0, coalesce(p_offset,0));
$$;

create or replace function public.organization_venues(p_org_id uuid)
returns setof venues language sql stable security definer set search_path = public as $$
  select v.* from venues v
  where v.organization_id = p_org_id and v.duplicate_of_id is null
  order by (v.id = (select primary_venue_id from organizations where id = p_org_id)) desc, v.name;
$$;

create or replace function public.link_organization_entity(p_org_id uuid, p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  if p_entity_type = 'venue' then
    update venues set organization_id = p_org_id where id = p_entity_id;
    update organizations set
      primary_venue_id = coalesce(primary_venue_id, p_entity_id),
      roles = (select array(select distinct unnest(roles || array['venue'])))
      where id = p_org_id;
  elsif p_entity_type = 'news_source' then
    update news_sources set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['publisher']))) where id = p_org_id;
  elsif p_entity_type = 'merchant' then
    update marketplace_merchants set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['seller']))) where id = p_org_id;
  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;
end; $$;

create or replace function public.unlink_organization_entity(p_org_id uuid, p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  if p_entity_type = 'venue' then
    update venues set organization_id = null where id = p_entity_id and organization_id = p_org_id;
    update organizations set primary_venue_id = null where id = p_org_id and primary_venue_id = p_entity_id;
  elsif p_entity_type = 'news_source' then
    update news_sources set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  elsif p_entity_type = 'merchant' then
    update marketplace_merchants set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;
end; $$;

grant execute on function public.get_organization(text) to anon, authenticated;
grant execute on function public.organization_articles(uuid,int,int) to anon, authenticated;
grant execute on function public.organization_products(uuid,int,int) to anon, authenticated;
grant execute on function public.organization_venues(uuid) to anon, authenticated;
grant execute on function public.link_organization_entity(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.unlink_organization_entity(uuid,text,uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: one org per news outlet + one per distinct marketplace seller domain.
-- Idempotent via organization_id guard (news) and website_domain NOT EXISTS (sellers).
-- ---------------------------------------------------------------------------
with candidates as (
  select 'news'::text as kind, ns.id as ref_id,
         coalesce(nullif(trim(ns.name), ''), 'Outlet') as name,
         lower(regexp_replace(coalesce(ns.url, ''), '^https?://(www\.)?([^/]+).*$', '\2')) as domain,
         array['publisher']::text[] as roles
  from public.news_sources ns
  where ns.organization_id is null
  union all
  select 'seller'::text as kind, null::uuid as ref_id,
         initcap(replace(split_part(d.merchant_domain, '.', 1), '-', ' ')) as name,
         lower(d.merchant_domain) as domain,
         array['seller']::text[] as roles
  from (select distinct merchant_domain from public.marketplace_listings
        where merchant_domain is not null and merchant_domain <> '') d
  where not exists (select 1 from public.organizations o where lower(o.website_domain) = lower(d.merchant_domain))
),
based as (
  select c.*, public.generate_slug(coalesce(nullif(c.name,''), nullif(c.domain,''), 'org')) as base_slug
  from candidates c
),
numbered as (
  select b.*, row_number() over (partition by base_slug order by kind, ref_id nulls last, domain) as rn
  from based b
),
ins as (
  insert into public.organizations (slug, name, roles, website, website_domain, enrichment_status)
  select
    case when rn = 1 then base_slug else base_slug || '-' || rn end,
    name, roles,
    case when domain <> '' then 'https://' || domain else null end,
    nullif(domain, ''),
    jsonb_build_object('org_backfill', jsonb_build_object('kind', kind, 'ref_id', ref_id, 'domain', domain))
  from numbered
  returning id,
    (enrichment_status->'org_backfill'->>'kind') as kind,
    (enrichment_status->'org_backfill'->>'ref_id') as ref_id
)
update public.news_sources ns
set organization_id = ins.id
from ins
where ins.kind = 'news' and ns.id = ins.ref_id::uuid;
