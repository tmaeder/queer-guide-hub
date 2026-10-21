-- Same-identity source inheritance, bounded and audited; never invent a handle.
with eligible as materialized (
 select o.id,v.id source_id,v.updated_at source_updated_at,
  (select jsonb_object_agg(key,value) from jsonb_each_text(coalesce(v.social_links,'{}'::jsonb))
   where (key='facebook' and value~*'^https://(www\.)?facebook\.com/[^[:space:]]+$')
      or (key='instagram' and value~*'^https://(www\.)?instagram\.com/[^[:space:]]+$')
      or (key='youtube' and value~*'^https://(www\.)?youtube\.com/[^[:space:]]+$')
      or (key in ('twitter','x') and value~*'^https://(www\.)?(twitter|x)\.com/[^[:space:]]+$')) social
 from public.organizations o join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 where o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.country_id is null or o.country_id=v.country_id)
  and (o.city_id is null or o.city_id=v.city_id)
  and o.roles<@array['venue','support','community','advocacy']::text[]
  and not exists(select 1 from public.venues x where x.organization_id=o.id and x.id<>v.id and x.duplicate_of_id is null)
  and o.social='{}'::jsonb and v.social_links<>'{}'::jsonb
 order by o.id limit 200 for update of o skip locked
), audit as (
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',id,'contact','{}'::jsonb,social,'primary_venue_source_socials' from eligible where social is not null
 returning entity_id
), changed as (
 update public.organizations o set social=e.social,updated_at=now(),
  field_provenance=coalesce(o.field_provenance,'{}'::jsonb)||jsonb_build_object('social',jsonb_build_object(
   'source','primary_venue_source_socials','source_table','venues','source_id',e.source_id,
   'source_updated_at',e.source_updated_at,'inherited_at',now(),'human_reviewed',false))
 from eligible e join audit a on a.entity_id=e.id where o.id=e.id
 returning o.id
), findings as (
 update public.entity_quality_findings f set state='pass',reason_code='contact_available',checked_at=now(),
  evidence=jsonb_build_object('social',true,'repair_source','primary_venue_source_socials')
 from changed c where f.entity_type='organization' and f.entity_id=c.id and f.dimension='contact'
 returning f.id
)
select (select count(*) from changed) changed,(select count(*) from findings) findings_corrected;
