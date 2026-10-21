-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261021184341 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- The existing Gays-Cruising importer intentionally exposes facts only. Its
-- CruisingSpot type excludes prose; contacts and licensed media are not supplied.
-- Preserve those absences as explicit source-unavailable outcomes instead of
-- asking staff to author/copy material outside the source contract.
-- Identity, location, safety, publication and actual supplied values are untouched.
create function public.organization_facts_only_source(p_id uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'contract','gays-cruising:facts-only:v1','outcome','source_unavailable',
  'source_table','venues','source_venue_id',v.id,
  'source_records',(select jsonb_agg(jsonb_build_object('id',s.id,'source_slug',s.source_slug,
    'source_entity_id',s.source_entity_id,'source_url',s.source_url,'payload_hash',s.payload_hash) order by s.id)
    from public.venue_sources s where s.venue_id=v.id),
  'explanation','The sole registered source intentionally supplies name, coordinates and backlink only; no verified business prose, contact or reusable media is supplied.',
  'human_reviewed',false)
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 where o.id=p_id and o.duplicate_of_id is null and v.duplicate_of_id is null
  and v.closed_at is null and o.roles=array['venue']::text[] and v.category='cruising'
  and o.field_provenance#>>'{identity,source}'='unified_location'
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.city_id is null or o.city_id=v.city_id) and (o.country_id is null or o.country_id=v.country_id)
  and exists(select 1 from public.venue_sources s where s.venue_id=v.id and s.source_slug='gays-cruising')
  and not exists(select 1 from public.venue_sources s where s.venue_id=v.id and s.source_slug<>'gays-cruising')
  -- Supplied extra facts must be enriched, not labelled unavailable, even if
  -- an older producer stored them under this source slug.
  and not exists(select 1 from public.venue_sources s where s.venue_id=v.id and (
    exists(select 1 from (values (s.payload->'raw'),(s.payload->'normalized'),(s.payload->'enriched')) sections(data)
     cross join lateral jsonb_each(case when jsonb_typeof(sections.data)='object' then sections.data else '{}'::jsonb end) fact
     where fact.key in ('description','website','email','phone','social','images','image_url','logo_url','cover_image_url')
       and fact.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb,'"[]"'::jsonb,'"{}"'::jsonb))
  ))
  and not exists(select 1 from public.venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
$$;
revoke all on function public.organization_facts_only_source(uuid) from public,anon,authenticated;
grant execute on function public.organization_facts_only_source(uuid) to service_role;

-- Apply the live source contract on every ordinary refresh. This is not a waiver:
-- another source, another role/location or a changed identity invalidates scope.
-- Existing values that already pass remain passes.
do $patch$
declare src text; target regprocedure;
 before_org text:='with org as (
    select o.*,';
 after_org text:='with org as (
    select o.*,public.organization_facts_only_source(o.id) source_contract,';
 before_rows text:='      v.state,v.reason_code,v.evidence
    from org o cross join lateral (values';
 after_rows text:='      case when v.state in (''fail'',''pending'') and v.dimension in (''editorial'',''contact'',''media'') and o.source_contract is not null
        then ''source_unavailable'' else v.state end as state,
      case when v.state in (''fail'',''pending'') and v.dimension in (''editorial'',''contact'',''media'') and o.source_contract is not null
        then ''facts_only_source_''||v.dimension else v.reason_code end as reason_code,
      case when v.state in (''fail'',''pending'') and v.dimension in (''editorial'',''contact'',''media'') and o.source_contract is not null
        then v.evidence||jsonb_build_object(''source_contract'',o.source_contract) else v.evidence end as evidence
    from org o cross join lateral (values';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),'public.refresh_business_brand_quality()'::regprocedure);
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,before_org,'')))/length(before_org)<>1 then raise exception 'Organization quality selector anchor changed'; end if;
 if (length(src)-length(replace(src,before_rows,'')))/length(before_rows)<>1 then raise exception 'Organization quality findings anchor changed'; end if;
 execute replace(replace(src,before_org,after_org),before_rows,after_rows);
end $patch$;

create function public.reconcile_facts_only_business_findings(p_batch integer default 500,p_dry_run boolean default true)
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
  ) select id,contract from eligible where contract is not null order by id limit greatest(0,least(coalesce(p_batch,500),2000))
 loop
  if not p_dry_run then
   perform 1 from public.organizations where id=r.id for update;
  end if;
  scope:=public.organization_facts_only_source(r.id);
  if scope is null then continue; end if;
  if p_dry_run then
   n:=n+(select count(*) from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
     and f.dimension in ('editorial','contact','media') and f.state in ('fail','pending') and f.waived_at is null
     and case f.dimension
      when 'editorial' then (select length(coalesce(btrim(o.description),''))<80 from public.organizations o where o.id=r.id)
      when 'contact' then (select coalesce(o.website,o.email,o.phone) is null and coalesce(o.social,'{}'::jsonb)='{}'::jsonb from public.organizations o where o.id=r.id)
      when 'media' then (select o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0 from public.organizations o where o.id=r.id)
     end);
  else
   with locked as materialized (
    select f.* from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=r.id
     and f.dimension in ('editorial','contact','media') and f.state in ('fail','pending') and f.waived_at is null
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

-- New registered evidence must invalidate the old source-unavailable outcome.
-- Only the quality-check cursor changes; no profile values or publication flags.
create function public.invalidate_business_source_contract()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.organizations o set quality_checked_at=null
 where o.id in(select v.organization_id from public.venues v where v.id=any(array[
  case when tg_op<>'DELETE' then new.venue_id end,case when tg_op<>'INSERT' then old.venue_id end]))
 and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
  and f.state='source_unavailable' and f.reason_code like 'facts_only_source_%');
 return coalesce(new,old);
end $$;
revoke all on function public.invalidate_business_source_contract() from public,anon,authenticated;
create trigger invalidate_business_source_contract after insert or update of payload_hash,source_slug,venue_id or delete
on public.venue_sources for each row execute function public.invalidate_business_source_contract();
;
