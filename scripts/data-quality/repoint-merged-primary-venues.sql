-- Default dry run. Correct stale primary pointers only inside the same business
-- after an existing audited venue merge. Native triggers can fill empty location
-- fields from the canonical venue and strengthen its existing safety gate.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
with parameters as(select true dry_run,100 batch_size), eligible as materialized(
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
select (select dry_run from parameters) dry_run,(select count(*) from eligible) candidates,(select count(*) from changed) changed,
 (select coalesce(jsonb_agg(to_jsonb(e)-'field_provenance'),'[]') from eligible e) evidence;
commit;
