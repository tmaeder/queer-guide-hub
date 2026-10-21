-- Compensating evidence for the initial recovery's source numbers rejected by
-- the existing canonical phone guard. Preserve the original attempt audit.
with settings as (select true dry_run), rejected as materialized (
 select e.id attempt_id,e.entity_id,o.field_provenance->'phone' provenance,
  e.new_value->>'phone' raw,public.canonicalize_phone(e.new_value->>'phone',c.code) verdict
 from public.business_brand_quality_events e join public.organizations o on o.id=e.entity_id
 left join public.countries c on c.id=o.country_id
 where e.reason_code='registered_venue_source_facts_phone' and o.phone is null
  and o.field_provenance#>>'{phone,source}'='registered_venue_source_facts'
  and public.canonicalize_phone(e.new_value->>'phone',c.code)->>'verdict'<>'ok'
  and not exists(select 1 from public.business_brand_quality_events reversal where reversal.rollback_of=e.id)
 for update of o skip locked
), audit as (
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code,rollback_of)
 select 'organization',entity_id,'contact',jsonb_build_object('attempted_phone',raw,'provenance',provenance),
  jsonb_build_object('phone',null,'outcome','rejected_by_canonical_phone_guard','validation',verdict),
  'registered_venue_source_fact_rejected',attempt_id from rejected where not(select dry_run from settings)
 returning entity_id
), changed as (
 update public.organizations o set field_provenance=jsonb_set(o.field_provenance,'{phone}',
  r.provenance||jsonb_build_object('outcome','rejected_by_canonical_phone_guard','validation',r.verdict,'assessed_at',now()))
 from rejected r join audit a on a.entity_id=r.entity_id where o.id=r.entity_id returning o.id
)
select (select dry_run from settings) dry_run,(select count(*) from rejected) rejected_attempts,
 (select count(*) from changed) evidence_corrected;
