-- Default dry run. Only empty, active, unwaived contact profiles are eligible.
-- Parse recorded numbers with the existing country rules; do not guess a number.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
with parameters as(select true dry_run,100 batch_size),
candidate_ids as materialized(
 select distinct o.id from public.organizations o
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 join public.venue_sources s on s.venue_id=o.primary_venue_id
 where o.status='active' and o.phone is null and o.website is null and o.email is null and o.social='{}'
  and s.source_slug in('spartacus','agendaq','planet-randy','patroc','gay-ch','google') and s.source_url~'^https?://'
  and (s.payload#>>'{normalized,contacts,phone}'~'[0-9]'
  or s.payload#>>'{raw,phone}'~'[0-9]' or s.payload#>>'{raw,data,phone}'~'[0-9]')
), eligible as materialized(
 select o.id,v.id venue_id,co.code,o.field_provenance,f.id finding_id,
  f.state previous_state,f.reason_code previous_reason,f.evidence previous_evidence
 from candidate_ids ids join public.organizations o on o.id=ids.id
 join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join public.countries co on co.id=o.country_id
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 where o.status='active' and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
  and o.roles=array['venue']::text[] and o.phone is null and o.website is null and o.email is null and o.social='{}'
  and not(o.field_provenance?'phone')
  and not exists(select 1 from public.venues x where x.organization_id=o.id and x.id<>v.id and x.duplicate_of_id is null)
 order by o.id for update of o,v,f skip locked
), source_rows as materialized(
 select e.id,e.code,s.id source_id,s.source_slug,s.source_url,s.payload_hash,s.last_seen_at,
  s.payload#>>'{normalized,contacts,phone}' normalized_phone,s.payload#>>'{raw,phone}' raw_phone,
  s.payload#>>'{raw,data,phone}' nested_phone
 from eligible e join public.venue_sources s on s.venue_id=e.venue_id for share of s
), parsed as materialized(
 select s.*,p.path,p.raw_value,public.canonicalize_phone(p.raw_value,s.code) verdict
 from source_rows s cross join lateral(values
  ('normalized.contacts.phone',s.normalized_phone),('raw.phone',s.raw_phone),('raw.data.phone',s.nested_phone)) p(path,raw_value)
 where nullif(btrim(p.raw_value),'') is not null
), agreed as(
 select id from parsed where verdict->>'verdict'='ok' group by id having count(distinct(verdict->>'e164'))=1
), selected as materialized(
 select distinct on(p.id) p.* from parsed p join agreed a using(id)
 where p.verdict->>'verdict'='ok' and p.verdict->>'country'=p.code
  and p.source_slug in('spartacus','agendaq','planet-randy','patroc','gay-ch','google') and p.source_url~'^https?://'
 order by p.id,p.last_seen_at desc nulls last,p.source_id,p.path limit(select batch_size from parameters)
), audited as(
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',e.id,'contact',jsonb_build_object('phone',null,'phone_provenance',e.field_provenance->'phone',
  'finding',jsonb_build_object('state',e.previous_state,'reason_code',e.previous_reason,'evidence',e.previous_evidence)),
  jsonb_build_object('phone',s.verdict->>'e164','raw_value',s.raw_value,'normalization',s.verdict,
   'source_id',s.source_id,'source_url',s.source_url,'payload_hash',s.payload_hash,'source_path',s.path),'primary_venue_source_phone'
 from selected s join eligible e using(id) where not(select dry_run from parameters) returning entity_id
), changed as(
 update public.organizations o set phone=s.verdict->>'e164',updated_at=now(),
  quality_dimensions=coalesce(o.quality_dimensions,'{}')||jsonb_build_object('contact',
   jsonb_build_object('state','pass','reason_code','contact_available','waived',false)),
  field_provenance=coalesce(o.field_provenance,'{}')||jsonb_build_object('phone',jsonb_build_object(
   'source','primary_venue_source_phone','source_table','venue_sources','source_id',s.source_id,
   'source_url',s.source_url,'source_slug',s.source_slug,'source_path',s.path,'payload_hash',s.payload_hash,
   'source_last_seen_at',s.last_seen_at,'raw_value',s.raw_value,'normalization',s.verdict,'inherited_at',now(),'human_reviewed',false))
 from selected s join audited a on a.entity_id=s.id where o.id=s.id and o.phone is null returning o.id
), findings as(
 update public.entity_quality_findings f set state='pass',reason_code='contact_available',checked_at=now(),
  evidence=coalesce(f.evidence,'{}')||jsonb_build_object('phone',true,'repair_source','primary_venue_source_phone',
   'source_id',s.source_id,'source_url',s.source_url)
 from changed c join selected s on s.id=c.id where f.entity_type='organization' and f.entity_id=c.id
  and f.dimension='contact' and f.waived_at is null and f.state in('fail','pending') returning f.id
)
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(jsonb_build_object('id',id,'phone',verdict->>'e164','source_id',source_id,'source_url',source_url)),'[]') from selected) evidence;
commit;
