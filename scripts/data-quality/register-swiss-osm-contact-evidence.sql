-- Default dry run. Load the collector's evidence array into the transaction-local
-- matching.swiss_contact_evidence setting. Only current Swiss place identities
-- with empty, unowned websites can receive a recorded public source claim.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
with parameters as(select true dry_run,20 batch_size),
input as materialized(
 select * from jsonb_to_recordset(coalesce(nullif(current_setting('matching.swiss_contact_evidence',true),''),'[]')::jsonb)
 as x(venue_id uuid,organization_id uuid,name text,latitude numeric,longitude numeric,city_id uuid,country_id uuid,
 country_code text,endpoint text,source_url text,observed_at timestamptz,website text,phone text,element jsonb)
), parsed as materialized(
 select x.*,coalesce(element->'center',element) position,
  regexp_replace(lower(substring(website from '^https?://([^/:?#]+)')),'^www\.','') website_host,
  split_part(coalesce(element#>>'{tags,contact:website}',element#>>'{tags,website}'),';',1) raw_website
 from input x where country_code='CH' and endpoint='https://overpass.osm.ch/api/interpreter'
  and element->>'type' in('node','way','relation') and element->>'id'~'^[1-9][0-9]*$'
  and source_url='https://www.openstreetmap.org/'||(element->>'type')||'/'||(element->>'id')
  and observed_at between now()-interval '7 days' and now()+interval '5 minutes'
  and website~'^https?://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#][^[:space:]<>]*)?$'
  and public.event_quality_url_is_safe(website)
  and coalesce(upper(element#>>'{tags,addr:country}'),'CH')='CH'
  and not exists(select 1 from jsonb_object_keys(coalesce(element->'tags','{}')) k where k~'^(disused|abandoned):')
  and coalesce(element#>>'{tags,opening_hours}','')<>'closed'
  and coalesce(element->'tags','{}')?|array['amenity','tourism','leisure','shop','office']
), source_claims as materialized(
 select p.*,case when pg_input_is_valid(position->>'lat','double precision') then (position->>'lat')::double precision end source_lat,
 case when pg_input_is_valid(position->>'lon','double precision') then (position->>'lon')::double precision end source_lng
 from parsed p where rtrim(website,'/')=rtrim(case when btrim(raw_website)~'^https?://' then btrim(raw_website) else 'https://'||btrim(raw_website) end,'/')
  and website_host!~'(^|\.)(google\.[a-z.]+|facebook\.com|instagram\.com|twitter\.com|x\.com|tinyurl\.com|bit\.ly|t\.co|linktr\.ee|openstreetmap\.org|agendaq\.fr|gayout\.com|booking\.com|tripadvisor\.[a-z.]+|yelp\.[a-z.]+)$'
), swiss_places as materialized(
 select v.id,public.dedup_despace(v.name) name_key,v.latitude,v.longitude from public.venues v
 join public.countries c on c.id=v.country_id and c.code='CH'
 where v.duplicate_of_id is null and v.closed_at is null
), eligible as materialized(
 select s.*,v.website previous_website
 from source_claims s join public.venues v on v.id=s.venue_id
 join public.organizations o on o.id=s.organization_id and o.primary_venue_id=v.id and v.organization_id=o.id
 join public.countries c on c.id=v.country_id and c.code='CH'
 where o.status='active' and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and v.website is null and o.website is null and not(o.field_provenance?'website') and not(o.field_provenance?'website_domain')
  and (v.website_domain is null or v.website_domain=public.extract_website_domain(s.website))
  and (o.website_domain is null or o.website_domain=public.org_normalize_domain(s.website))
  and lower(btrim(o.name))=lower(btrim(v.name)) and v.name=s.name and v.city_id=s.city_id and v.country_id=s.country_id
  and o.city_id=v.city_id and o.country_id=v.country_id and o.roles=array['venue']::text[]
  and v.latitude=s.latitude and v.longitude=s.longitude and v.latitude between 45.8 and 47.9 and v.longitude between 5.9 and 10.5
  and v.name!~'^[†‡]' and public.dedup_despace(element#>>'{tags,name}')=public.dedup_despace(v.name)
  and source_lat between -90 and 90 and source_lng between -180 and 180
  and extensions.st_distancesphere(extensions.st_setsrid(extensions.st_makepoint(v.longitude::double precision,v.latitude::double precision),4326),
   extensions.st_setsrid(extensions.st_makepoint(source_lng,source_lat),4326))<=60
  and not exists(select 1 from swiss_places other where other.id<>v.id and other.name_key=public.dedup_despace(v.name)
   and extensions.st_distancesphere(extensions.st_setsrid(extensions.st_makepoint(other.longitude::double precision,other.latitude::double precision),4326),
    extensions.st_setsrid(extensions.st_makepoint(source_lng,source_lat),4326))<=60)
  and not exists(select 1 from input other where other.venue_id<>s.venue_id and other.source_url=s.source_url)
  and not exists(select 1 from public.venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
  and not exists(select 1 from public.venue_sources vs where vs.source_slug='osm'
   and vs.source_entity_id='osm-'||(element->>'type')||'-'||(element->>'id') and vs.venue_id<>v.id)
  and not exists(select 1 from public.venue_sources vs
   cross join lateral(values(vs.payload#>>'{normalized,contacts,website}'),(vs.payload#>>'{raw,website}')) claim(url)
   where vs.venue_id=v.id and not(vs.source_slug='osm' and vs.source_entity_id='osm-'||(element->>'type')||'-'||(element->>'id'))
    and claim.url~'^https?://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#][^[:space:]<>]*)?$'
    and regexp_replace(lower(substring(claim.url from '^https?://([^/:?#]+)')),'^www\.','')<>s.website_host)
  and not exists(select 1 from public.venue_field_provenance f where f.venue_id=v.id and f.field='website' and f.is_winning)
  and not exists(select 1 from public.venue_review_queue q where q.venue_id=v.id and q.field='website' and q.status in('open','rejected'))
 order by v.id limit(select batch_size from parameters) for update of o,v skip locked
), captures as materialized(
 select e.*,jsonb_build_object('raw',jsonb_build_object('name',element#>>'{tags,name}','website',website,'phone',phone,'osm_element',element),
  'normalized',jsonb_build_object('name',element#>>'{tags,name}','contacts',jsonb_build_object('website',website,'phone',phone)),
  'metadata',jsonb_build_object('endpoint',endpoint,'source_url',source_url,'observed_at',observed_at,
   'identity_rule','exact_normalized_name_within_60m','country_scope','CH','human_reviewed',false)) payload
 from eligible e
), sources as(
 insert into public.venue_sources as vs(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,last_seen_at,is_primary)
 select venue_id,'osm','osm-'||(element->>'type')||'-'||(element->>'id'),source_url,payload,
  encode(extensions.digest(payload::text,'sha256'),'hex'),observed_at,false from captures where not(select dry_run from parameters)
 on conflict(source_slug,source_entity_id) do update set source_url=excluded.source_url,
  payload=coalesce(vs.payload,'{}')||excluded.payload,
  payload_hash=encode(extensions.digest((coalesce(vs.payload,'{}')||excluded.payload)::text,'sha256'),'hex'),last_seen_at=excluded.last_seen_at
 where vs.venue_id=excluded.venue_id
 returning vs.id,vs.venue_id,vs.source_url,vs.payload_hash
), changed as(
 update public.venues v set website=e.website,updated_at=now()
 from captures e join sources s on s.venue_id=e.venue_id where v.id=e.venue_id and v.website is null
 returning v.id,v.website
), provenance as(
 insert into public.venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
 select c.id,'website','osm',to_jsonb(c.website),0.8,true,e.observed_at from changed c join captures e on e.venue_id=c.id
 where c.website is not null on conflict(venue_id,field,source) do update set value=excluded.value,
  confidence=excluded.confidence,is_winning=excluded.is_winning,observed_at=excluded.observed_at returning venue_id
), signals as(
 insert into public.venue_quality_signals(venue_id,signal_type,value,source,details)
 select c.id,'enrichment',1,'swiss-osm-contact-evidence',jsonb_build_object('field','website','source_id',s.id,
  'source_url',s.source_url,'payload_hash',s.payload_hash,'observed_at',e.observed_at,'human_reviewed',false)
 from changed c join sources s on s.venue_id=c.id join captures e on e.venue_id=c.id where c.website is not null returning venue_id
)
select (select dry_run from parameters) dry_run,(select count(*) from captures) candidates,
 (select count(*) from sources) sources_recorded,(select count(*) from changed where website is not null) websites_filled,
 (select count(*) from provenance) provenance_recorded,(select count(*) from signals) native_signals,
 (select coalesce(jsonb_agg(jsonb_build_object('venue_id',venue_id,'organization_id',organization_id,'website',website,'source_url',source_url)),'[]') from captures) evidence;
commit;
