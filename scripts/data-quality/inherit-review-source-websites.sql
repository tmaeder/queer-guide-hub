-- Default dry run. Fill an empty contact profile from its sole primary venue's
-- recorded source claims. Conflicting domains, directory links and social links
-- remain unresolved. This records source evidence, never human verification.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
with parameters as (select true dry_run,200 batch_size),
candidate_ids as materialized (
 select distinct o.id from public.organizations o
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 join public.venue_sources s on s.venue_id=o.primary_venue_id
 where o.website is null and (
  s.payload#>>'{normalized,contacts,website}'~'^https?://'
  or s.payload#>>'{raw,website}'~'^https?://')
),
eligible as materialized (
 select o.id,o.website,o.field_provenance,v.id venue_id,f.id finding_id,
  f.state previous_state,f.reason_code previous_reason,f.evidence previous_evidence
 from public.organizations o
 join candidate_ids candidates on candidates.id=o.id
 join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 where o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.country_id is null or o.country_id=v.country_id)
  and (o.city_id is null or o.city_id=v.city_id)
  and cardinality(o.roles)>0 and o.roles<@array['venue','support','community','advocacy']::text[]
  and not exists(select 1 from public.venues x where x.organization_id=o.id
   and x.id<>v.id and x.duplicate_of_id is null)
  and o.website is null and o.email is null and o.phone is null and o.social='{}'::jsonb
  and not(o.field_provenance ? 'website')
 order by o.id for update of o,v,f skip locked
), source_rows as materialized (
 select s.id,s.venue_id,s.source_slug,s.source_url,s.payload_hash,s.last_seen_at,
  s.payload#>>'{normalized,contacts,website}' normalized_website,
  s.payload#>>'{raw,website}' raw_website
 from public.venue_sources s join eligible e on e.venue_id=s.venue_id
 for share of s
), claims as (
 select e.id,s.id source_id,s.source_slug,s.source_url,s.payload_hash,s.last_seen_at,
  p.path,p.website,lower(substring(p.website from '^https?://(?:www\.)?([^/:?#]+)')) host
 from eligible e join source_rows s on s.venue_id=e.venue_id
 cross join lateral(values
  ('normalized.contacts.website',nullif(btrim(s.normalized_website),'')),
  ('raw.website',nullif(btrim(s.raw_website),''))) p(path,website)
 where p.website~'^https?://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#][^[:space:]<>]*)?$'
), agreed as (
 select id from claims group by id having count(distinct host)=1
), selected as materialized (
 select distinct on(c.id) c.* from claims c join agreed a using(id)
 where c.source_slug in('spartacus','foursquare','google','osm','agendaq','gay-ch','milchjugend','planet-randy','patroc')
  and c.source_url~'^https?://'
  and c.host!~'(^|\.)(google\.[a-z.]+|facebook\.com|instagram\.com|twitter\.com|x\.com|tinyurl\.com|bit\.ly|t\.co|linktr\.ee|spartacus\.gayguide\.travel|agendaq\.fr|planet-randy\.com|foursquare\.com|tripadvisor\.[a-z.]+|gayout\.com|booking\.com|yelp\.[a-z.]+)$'
  and c.host<>lower(substring(c.source_url from '^https?://(?:www\.)?([^/:?#]+)'))
 order by c.id,c.last_seen_at desc nulls last,c.source_id,c.path
 limit (select batch_size from parameters)
), audited as (
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',e.id,'contact',
  jsonb_build_object('website',e.website,'website_provenance',e.field_provenance->'website',
   'finding',jsonb_build_object('state',e.previous_state,'reason_code',e.previous_reason,'evidence',e.previous_evidence)),
  jsonb_build_object('website',s.website,'source_id',s.source_id,'source_url',s.source_url,
   'payload_hash',s.payload_hash,'source_path',s.path),'primary_venue_source_website'
 from selected s join eligible e using(id) where not(select dry_run from parameters)
 returning entity_id
), changed as (
 update public.organizations o set website=s.website,updated_at=now(),
  quality_dimensions=coalesce(o.quality_dimensions,'{}'::jsonb)||jsonb_build_object('contact',
   jsonb_build_object('state','pass','reason_code','contact_available','waived',false)),
  field_provenance=coalesce(o.field_provenance,'{}'::jsonb)||jsonb_build_object('website',jsonb_build_object(
   'source','primary_venue_source_website','source_table','venue_sources','source_id',s.source_id,
   'source_url',s.source_url,'source_slug',s.source_slug,'source_path',s.path,
   'payload_hash',s.payload_hash,'source_last_seen_at',s.last_seen_at,'inherited_at',now(),'human_reviewed',false))
 from selected s join audited a on a.entity_id=s.id where o.id=s.id and o.website is null
 returning o.id
), findings as (
 update public.entity_quality_findings f set state='pass',reason_code='contact_available',checked_at=now(),
  evidence=coalesce(f.evidence,'{}'::jsonb)||jsonb_build_object('website',true,
   'repair_source','primary_venue_source_website','source_id',s.source_id,'source_url',s.source_url)
 from changed c join selected s on s.id=c.id where f.entity_type='organization' and f.entity_id=c.id
  and f.dimension='contact' and f.waived_at is null and f.state in('fail','pending') returning f.id
)
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(jsonb_build_object('id',id,'website',website,'source_id',source_id,'source_url',source_url)),'[]') from selected) evidence;
commit;
