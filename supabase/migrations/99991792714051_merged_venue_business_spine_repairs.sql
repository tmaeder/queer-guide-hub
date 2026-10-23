-- Follow only the existing native venue-merge ledger. These helpers neither
-- infer new duplicate pairs nor overwrite canonical business content.
create function public.repoint_merged_primary_venues(p_batch integer default 20,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $pointer$
declare result jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic primary repairs require an internal actor';end if;
 if not pg_try_advisory_xact_lock(hashtext('merged_primary_venue_pointers')) then return jsonb_build_object('skipped',true,'reason','already_running');end if;
with parameters as(select p_dry_run is distinct from false dry_run,greatest(0,least(coalesce(p_batch,20),100)) batch_size), eligible as materialized(
 select o.id,o.primary_venue_id previous_primary,k.id canonical_primary,va.id venue_merge_audit_id,o.field_provenance
 from public.organizations o join public.venues d on d.id=o.primary_venue_id and d.organization_id=o.id
 join public.venues k on k.id=d.duplicate_of_id and k.organization_id=o.id and k.duplicate_of_id is null and k.closed_at is null
 join lateral(select a.id from public.venue_merge_audit a where a.drop_id=d.id and a.keep_id=k.id and a.undone_at is null order by a.created_at desc limit 1 for share of a) va on true
 where o.status='active' and o.duplicate_of_id is null and o.roles=array['venue']::text[]
  and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null
  and (o.safety_gated is not true or k.safety_gated is true or public.location_is_high_risk(o.country_id,o.city_id))
  and o.city_id=k.city_id and o.country_id=k.country_id and d.city_id=k.city_id and d.country_id=k.country_id
  and o.field_provenance#>>'{identity,source}'='unified_location' and o.field_provenance#>>'{identity,venue_id}'=d.id::text
  and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
  and not exists(select 1 from jsonb_each(o.field_provenance) p where p.value->>'human_reviewed'='true' or nullif(p.value->>'reviewed_by','') is not null)
  and not(o.field_provenance?'primary_venue_id')
  and not exists(select 1 from public.venues other where other.organization_id=o.id and other.duplicate_of_id is null and other.id<>k.id)
 order by o.id limit(select batch_size from parameters) for update of o,d,k skip locked
), audited as(
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',id,'linkage',jsonb_build_object('primary_venue_id',previous_primary,'identity_provenance',field_provenance->'identity'),
  jsonb_build_object('primary_venue_id',canonical_primary,'venue_merge_audit_id',venue_merge_audit_id,'human_reviewed',false),'primary_venue_merge_followup'
 from eligible where not(select dry_run from parameters) returning entity_id
), changed as(
 update public.organizations o set primary_venue_id=e.canonical_primary,updated_at=now(),
  field_provenance=jsonb_set(o.field_provenance,'{identity}',(o.field_provenance->'identity')||jsonb_build_object(
   'venue_id',e.canonical_primary,'previous_venue_id',e.previous_primary,'venue_merge_audit_id',e.venue_merge_audit_id,'canonicalized_at',now(),'human_reviewed',false))
 from eligible e join audited a on a.entity_id=e.id where o.id=e.id returning o.id
)
select to_jsonb(outcome)-'evidence' into result from(select (select dry_run from parameters) dry_run,(select count(*) from eligible) candidates,(select count(*) from changed) changed,
 (select coalesce(jsonb_agg(to_jsonb(e)-'field_provenance'),'[]') from eligible e) evidence) outcome;
 return result;
end $pointer$;
revoke all on function public.repoint_merged_primary_venues(integer,boolean) from public,anon,authenticated;
grant execute on function public.repoint_merged_primary_venues(integer,boolean) to service_role;

create function public.reconcile_merged_venue_business_spines(p_batch integer default 20,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare dry_run boolean:=p_dry_run is distinct from false;batch_size integer:=greatest(0,least(coalesce(p_batch,20),100));r record;result jsonb;results jsonb:='[]';reconciled jsonb;canonical_before jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic spine repairs require an internal actor';end if;
 if not pg_try_advisory_xact_lock(hashtext('merged_venue_business_spines')) then
  return jsonb_build_object('skipped',true,'reason','already_running');
 end if;
 for r in
  select o.id drop_id,ko.id keep_id,d.id duplicate_venue_id,k.id canonical_venue_id,va.id venue_merge_audit_id
  from public.organizations o join public.venues d on d.id=o.primary_venue_id and d.organization_id=o.id
  join public.venues k on k.id=d.duplicate_of_id and k.duplicate_of_id is null and k.closed_at is null
  join public.organizations ko on ko.id=k.organization_id and ko.duplicate_of_id is null and ko.status='active'
  join lateral(select a.id from public.venue_merge_audit a where a.drop_id=d.id and a.keep_id=k.id and a.undone_at is null order by a.created_at desc limit 1) va on true
  where o.id<>ko.id and o.status='active' and o.duplicate_of_id is null
   and o.roles=array['venue']::text[] and ko.roles @> array['venue']::text[]
   and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null
   and o.field_provenance#>>'{identity,source}'='unified_location'
   and o.field_provenance#>>'{identity,venue_id}'=d.id::text
   and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
   and not exists(select 1 from jsonb_object_keys(o.field_provenance) key where key not in('identity','location_inheritance'))
   and not exists(select 1 from jsonb_each(o.field_provenance) p where p.value->>'human_reviewed'='true' or nullif(p.value->>'reviewed_by','') is not null)
   and o.city_id=ko.city_id and o.country_id=ko.country_id and d.city_id=k.city_id and d.country_id=k.country_id
   and o.city_id=d.city_id and o.country_id=d.country_id
   and public.merge_gap_patch('organization',to_jsonb(ko),to_jsonb(o))='{}'
   and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.state in('fail','pending') and f.waived_at is null)
   and not exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.waived_at is not null)
   and not exists(select 1 from public.venues other left join public.venues target on target.id=other.duplicate_of_id
    where other.organization_id=o.id and (other.duplicate_of_id is null or target.id is null or target.duplicate_of_id is not null or target.organization_id is distinct from ko.id))
   and not exists(select 1 from public.hotels h where h.organization_id=o.id)
   and not exists(select 1 from public.marketplace_brands b where b.organization_id=o.id)
   and not exists(select 1 from public.marketplace_merchants m where m.organization_id=o.id)
   and not exists(select 1 from public.affiliate_partners a where a.organization_id=o.id)
   and not exists(select 1 from public.news_sources n where n.organization_id=o.id)
   and not exists(select 1 from public.organizations child where child.duplicate_of_id=o.id)
   and not exists(select 1 from public.org_slug_redirects redirect where redirect.organization_id=o.id)
   and not exists(select 1 from public.org_link_suggestions suggestion where suggestion.organization_id=o.id)
  order by o.id limit greatest(0,least(batch_size,100)) for update of o,ko,d,k skip locked
 loop
  perform 1 from public.venue_merge_audit where id=r.venue_merge_audit_id and undone_at is null for share;
  if not found then continue;end if;
  if not dry_run then
   select to_jsonb(profile) into canonical_before from public.organizations profile where profile.id=r.keep_id;
   result:=public.merge_entities(p_type=>'organization',p_keep_id=>r.keep_id,p_drop_id=>r.drop_id);
   update public.entity_merge_audit set details=details||jsonb_build_object('automatic_spine_repair',jsonb_build_object(
    'policy','audited_venue_merge_orphan:v1','venue_merge_audit_id',r.venue_merge_audit_id,
    'duplicate_venue_id',r.duplicate_venue_id,'canonical_venue_id',r.canonical_venue_id,'human_reviewed',false))
   where id=(result->>'audit_id')::uuid and actor is null and undone_at is null;
   if canonical_before is distinct from (select to_jsonb(profile) from public.organizations profile where profile.id=r.keep_id) then
    raise exception 'Canonical organization unexpectedly changed';
   end if;
  end if;
  results:=results||jsonb_build_array(to_jsonb(r)||jsonb_build_object('result',result));
 end loop;
 if not dry_run and jsonb_array_length(results)>0 then reconciled:=public.reconcile_superseded_business_findings(2000,false);end if;
 return jsonb_build_object('dry_run',dry_run,'candidates',jsonb_array_length(results),
  'merged',case when dry_run then 0 else jsonb_array_length(results) end,'superseded_findings',reconciled);
end $repair$;

revoke all on function public.reconcile_merged_venue_business_spines(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_merged_venue_business_spines(integer,boolean) to service_role;

-- Keep the ordinary job's enabled/paused controls. Interactive refreshes retain
-- their previous behavior; this internal-only follow-up is never a human action.
do $patch$
declare target regprocedure;src text;anchor text:='  perform public.reconcile_superseded_business_findings(500,false);';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),to_regprocedure('public.refresh_business_brand_quality()'));
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Business spine repair hook changed';end if;
 execute replace(src,anchor,'  if auth.uid() is null then
    perform public.repoint_merged_primary_venues(20,false);
    perform public.reconcile_merged_venue_business_spines(20,false);
  end if;
'||anchor);
end $patch$;
