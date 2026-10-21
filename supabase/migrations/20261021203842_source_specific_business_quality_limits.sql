-- Explicit per-dimension contracts for already registered importers.
-- GayOut import-gayout.mjs deliberately excludes editorial descriptions/photos.
-- Planet Randy toNormalizedVenue emits identity/location/contact facts only;
-- source_image_url remains an unlicensed reference, not approved reusable media.
-- Both can supply contacts: do not exhaust contact research for them.
-- Supplied facts, multiple sources/locations and identity conflicts remain excluded.
-- No content, verification, publication or safety state is invented.
create or replace function public.organization_facts_only_source(p_id uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'contract',sl.source_slug||':registered-facts:v1','outcome','source_unavailable',
  'unavailable_dimensions',case when sl.source_slug='gays-cruising' then '["editorial","contact","media"]'::jsonb else '["editorial","media"]'::jsonb end,
  'source_table','venues','source_venue_id',v.id,
  'source_records',(select jsonb_agg(jsonb_build_object('id',s.id,'source_slug',s.source_slug,
    'source_entity_id',s.source_entity_id,'source_url',s.source_url,'payload_hash',s.payload_hash) order by s.id)
    from public.venue_sources s where s.venue_id=v.id),
  'explanation',case when sl.source_slug='gays-cruising'
   then 'The sole registered importer supplies identity/location facts and a backlink; no verified business prose, contact or reusable media is supplied.'
   else 'The sole registered importer supplies identity/location facts and may supply contact details. Editorial prose and reusable media are excluded from its import contract; contact work remains applicable.' end,
  'human_reviewed',false)
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 cross join lateral (select min(source_slug) source_slug,count(distinct source_slug) source_count
   from public.venue_sources where venue_id=v.id) sl
 where o.id=p_id and o.duplicate_of_id is null and v.duplicate_of_id is null
  and v.closed_at is null and o.roles=array['venue']::text[]
  and sl.source_count=1 and sl.source_slug in ('gays-cruising','gayout','planet-randy')
  and (sl.source_slug<>'gays-cruising' or v.category='cruising')
  and o.field_provenance#>>'{identity,source}'='unified_location'
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.city_id is null or o.city_id=v.city_id) and (o.country_id is null or o.country_id=v.country_id)
  -- Require the newer importer's actual structured payload and original URL;
  -- a legacy CSV's source label alone is not enough.
  and (sl.source_slug='gays-cruising' or not exists(
   select 1 from public.venue_sources s where s.venue_id=v.id and (
    s.payload#>>'{normalized,metadata,data_source}' is distinct from sl.source_slug
    or lower(btrim(s.payload#>>'{normalized,name}')) is distinct from lower(btrim(v.name))
    or s.source_url is null
    or (sl.source_slug='gayout' and s.source_url!~*'^https://(www\.)?gayout\.com/[^[:space:]]+$')
    or (sl.source_slug='planet-randy' and s.source_url!~*'^https://planet-randy\.com/[^[:space:]]+$'))))
  -- Supplied extra facts must be enriched, not labelled unavailable, even if
  -- an older producer stored them under this source slug.
  and not exists(select 1 from public.venue_sources s where s.venue_id=v.id and (
    exists(select 1 from (values (s.payload->'raw'),(s.payload->'normalized'),(s.payload->'enriched')) sections(data)
     cross join lateral jsonb_each(case when jsonb_typeof(sections.data)='object' then sections.data else '{}'::jsonb end) fact
     where (fact.key in ('description','images','image_url','logo_url','cover_image_url')
       or (sl.source_slug='gays-cruising' and fact.key in ('website','email','phone','social','contacts')))
       and fact.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb,'"[]"'::jsonb,'"{}"'::jsonb))
  ))
  and not exists(select 1 from public.venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
$$;
revoke all on function public.organization_facts_only_source(uuid) from public,anon,authenticated;
grant execute on function public.organization_facts_only_source(uuid) to service_role;


-- Apply per-dimension applicability in the ordinary quality producer.
do $patch$
declare src text; target regprocedure; before_text text:='and o.source_contract is not null';
 after_text text:='and o.source_contract->''unavailable_dimensions'' ? v.dimension';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),'public.refresh_business_brand_quality()'::regprocedure);
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,before_text,'')))/length(before_text)<>3 then
  raise exception 'Source contract producer anchor changed'; end if;
 execute replace(src,before_text,after_text);
end $patch$;

create or replace function public.reconcile_facts_only_business_findings(p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; scope jsonb; n integer:=0; organizations_examined integer:=0;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('facts_only_business_findings')) then return jsonb_build_object('skipped',true,'reason','already_running'); end if;
 for r in
  with eligible as not materialized (
   select o.id,public.organization_facts_only_source(o.id) contract from public.organizations o
   where o.duplicate_of_id is null and o.roles=array['venue']::text[]
    and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
      and f.dimension in ('editorial','contact','media') and f.state in ('fail','pending') and f.waived_at is null
      and case f.dimension
       when 'editorial' then length(coalesce(btrim(o.description),''))<80
       when 'contact' then coalesce(o.website,o.email,o.phone) is null and coalesce(o.social,'{}'::jsonb)='{}'::jsonb
       when 'media' then o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0
      end)
  ), scoped as not materialized (
   select e.id,e.contract from eligible e join public.organizations o on o.id=e.id
   where e.contract is not null and exists(
    select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=e.id
     and e.contract->'unavailable_dimensions' ? f.dimension
     and f.state in ('fail','pending') and f.waived_at is null
     and case f.dimension
      when 'editorial' then length(coalesce(btrim(o.description),''))<80
      when 'contact' then coalesce(o.website,o.email,o.phone) is null and coalesce(o.social,'{}'::jsonb)='{}'::jsonb
      when 'media' then o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0 end)
  ) select id,contract from scoped order by id limit greatest(0,least(coalesce(p_batch,500),2000))
 loop
  if not p_dry_run then
   perform 1 from public.organizations where id=r.id for update;
  end if;
  scope:=public.organization_facts_only_source(r.id);
  if scope is null then continue; end if;
  if p_dry_run then
   n:=n+(select count(*) from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
     and scope->'unavailable_dimensions' ? f.dimension and f.state in ('fail','pending') and f.waived_at is null
     and case f.dimension
      when 'editorial' then (select length(coalesce(btrim(o.description),''))<80 from public.organizations o where o.id=r.id)
      when 'contact' then (select coalesce(o.website,o.email,o.phone) is null and coalesce(o.social,'{}'::jsonb)='{}'::jsonb from public.organizations o where o.id=r.id)
      when 'media' then (select o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0 from public.organizations o where o.id=r.id)
     end);
  else
   with locked as materialized (
    select f.* from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
     and scope->'unavailable_dimensions' ? f.dimension and f.state in ('fail','pending') and f.waived_at is null
     -- A successful direct fill during this pass must not be replaced by a limit.
     and case f.dimension
      when 'editorial' then (select length(coalesce(btrim(o.description),''))<80 from public.organizations o where o.id=r.id)
      when 'contact' then (select coalesce(o.website,o.email,o.phone) is null and coalesce(o.social,'{}'::jsonb)='{}'::jsonb from public.organizations o where o.id=r.id)
      when 'media' then (select o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0 from public.organizations o where o.id=r.id)
     end for update of f skip locked
   ), audited as (
    insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
    select 'organization',entity_id,dimension,jsonb_build_object('state',state,'reason_code',reason_code,'evidence',evidence),
     jsonb_build_object('state','source_unavailable','source_contract',scope),'facts_only_source_'||dimension from locked
    returning entity_id,dimension
   ), changed as (
    update public.entity_quality_findings f set state='source_unavailable',reason_code='facts_only_source_'||f.dimension,
     evidence=f.evidence||jsonb_build_object('source_contract',scope,'assessed_at',now()),checked_at=now()
    from audited a where f.entity_type='organization' and f.entity_id=a.entity_id and f.dimension=a.dimension
    returning f.entity_id,f.dimension,f.state,f.reason_code
   ), summary as (select entity_id,jsonb_object_agg(dimension,jsonb_build_object('state',state,'reason_code',reason_code,'waived',false)) dimensions,count(*) changed from changed group by entity_id),
   updated_profiles as (
    update public.organizations o set quality_dimensions=coalesce(o.quality_dimensions,'{}'::jsonb)||s.dimensions
    from summary s where o.id=s.entity_id returning o.id
   ) select n+coalesce(sum(changed),0) into n from summary;
  end if;
  organizations_examined:=organizations_examined+1;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'organizations_examined',organizations_examined,'source_limits_recorded',n);
end $$;
revoke all on function public.reconcile_facts_only_business_findings(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_facts_only_business_findings(integer,boolean) to service_role;

