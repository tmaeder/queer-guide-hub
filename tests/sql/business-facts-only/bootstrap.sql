create role anon; create role authenticated; create role service_role;
create table public.organizations(id uuid primary key,name text,primary_venue_id uuid,duplicate_of_id uuid,roles text[],
 field_provenance jsonb default '{}',city_id uuid,country_id uuid,description text,website text,email text,phone text,social jsonb default '{}',
 logo_url text,cover_image_url text,images text[] default '{}',quality_dimensions jsonb default '{}',quality_checked_at timestamptz default now(),safety_gated boolean default true,status text default 'active');
create table public.venues(id uuid primary key,name text,organization_id uuid,duplicate_of_id uuid,closed_at timestamptz,category text,city_id uuid,country_id uuid,safety_gated boolean default true);
create table public.venue_sources(id uuid primary key default gen_random_uuid(),venue_id uuid,source_slug text,source_entity_id text,source_url text,payload jsonb default '{}',payload_hash text);
create table public.entity_quality_findings(id bigint generated always as identity primary key,entity_type text,entity_id uuid,dimension text,state text,reason_code text,evidence jsonb default '{}',waived_at timestamptz,checked_at timestamptz default now());
create table public.business_brand_quality_events(id bigint generated always as identity primary key,entity_type text,entity_id uuid,dimension text,previous_value jsonb,new_value jsonb,reason_code text);
create function public.assert_admin_or_internal() returns void language plpgsql as $$ begin end $$;
create function public.refresh_business_brand_quality() returns jsonb language plpgsql as $$
declare result jsonb;
begin
  with org as (
    select o.*,false has_link from public.organizations o
  ), rows as (
    select 'organization'::text entity_type,o.id entity_id,v.dimension,
      v.state,v.reason_code,v.evidence
    from org o cross join lateral (values
      ('editorial',case when length(coalesce(o.description,''))>=80 then 'pass' else 'fail' end,'description_missing_or_thin','{}'::jsonb),
      ('contact',case when coalesce(o.website,o.email,o.phone) is not null or o.social<>'{}'::jsonb then 'pass' else 'fail' end,'contact_missing','{}'::jsonb),
      ('media',case when o.logo_url is not null or cardinality(o.images)>0 then 'pass' else 'fail' end,'media_missing','{}'::jsonb)
    ) v(dimension,state,reason_code,evidence)
  ) select jsonb_agg(to_jsonb(rows)) into result from rows;
  return result;
end $$;
