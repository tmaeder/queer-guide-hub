-- Default dry run. Follow existing, audited venue merges only. Never infer a
-- business merge from proximity or a similar name. Native merges remain undoable.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;result jsonb;results jsonb:='[]';reconciled jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic spine repairs require an internal actor';end if;
 if not pg_try_advisory_xact_lock(hashtext('merged_venue_business_spines')) then
  perform set_config('matching.merged_venue_business_spines','{"skipped":true,"reason":"already_running"}',false);return;
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
   result:=public.merge_entities(p_type=>'organization',p_keep_id=>r.keep_id,p_drop_id=>r.drop_id);
   update public.entity_merge_audit set details=details||jsonb_build_object('automatic_spine_repair',jsonb_build_object(
    'policy','audited_venue_merge_orphan:v1','venue_merge_audit_id',r.venue_merge_audit_id,
    'duplicate_venue_id',r.duplicate_venue_id,'canonical_venue_id',r.canonical_venue_id,'human_reviewed',false))
   where id=(result->>'audit_id')::uuid and actor is null and undone_at is null;
  end if;
  results:=results||jsonb_build_array(to_jsonb(r)||jsonb_build_object('result',result));
 end loop;
 if not dry_run then reconciled:=public.reconcile_superseded_business_findings(2000,false);end if;
 perform set_config('matching.merged_venue_business_spines',jsonb_build_object('dry_run',dry_run,
  'candidates',jsonb_array_length(results),'repairs',results,'superseded_findings',reconciled)::text,false);
end $repair$;
select current_setting('matching.merged_venue_business_spines')::jsonb result;
commit;
