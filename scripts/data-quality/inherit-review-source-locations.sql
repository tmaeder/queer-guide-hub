-- Fill absent geography only; a conflicting known location must be adjudicated.
with eligible as materialized (
 select o.id,v.id source_id,o.city_id old_city,o.country_id old_country,v.city_id,v.country_id
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join public.cities c on c.id=v.city_id and c.country_id=v.country_id and c.duplicate_of_id is null
 where o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.country_id is null or o.country_id=v.country_id)
  and (o.city_id is null or o.city_id=v.city_id)
  and (o.city_id is null or o.country_id is null)
  and not exists(select 1 from public.venues x where x.organization_id=o.id and x.id<>v.id and x.duplicate_of_id is null)
 order by o.id limit 200 for update of o skip locked
), audit as (
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',id,'location',jsonb_build_object('city_id',old_city,'country_id',old_country),
  jsonb_build_object('city_id',city_id,'country_id',country_id),'primary_venue_source_location' from eligible returning entity_id
), changed as (
 update public.organizations o set city_id=coalesce(o.city_id,e.city_id),country_id=coalesce(o.country_id,e.country_id),updated_at=now(),
  field_provenance=coalesce(o.field_provenance,'{}'::jsonb)||jsonb_build_object('location_inheritance',jsonb_build_object(
   'source','primary_venue_source_location','source_id',e.source_id,'inherited_at',now(),'human_reviewed',false))
 from eligible e join audit a on a.entity_id=e.id where o.id=e.id
 returning o.id,o.city_id,o.country_id
), findings as (
 update public.entity_quality_findings f set state='pass',reason_code='location_complete',checked_at=now(),
  evidence=jsonb_build_object('city_id',c.city_id,'country_id',c.country_id,'repair_source','primary_venue_source_location')
 from changed c where f.entity_type='organization' and f.entity_id=c.id and f.dimension='location' returning f.id
)
select (select count(*) from changed) changed,(select count(*) from findings) findings_corrected;
