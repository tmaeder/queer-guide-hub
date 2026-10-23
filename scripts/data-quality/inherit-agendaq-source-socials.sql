-- Default dry run; inherit explicit public profile URLs, never guessed handles.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
with parameters as(select true dry_run,200 batch_size),
candidate_ids as materialized(
 select distinct o.id from public.organizations o
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 join public.venue_sources s on s.venue_id=o.primary_venue_id and s.source_slug='agendaq'
 where o.status='active' and o.website is null and o.email is null and o.phone is null and o.social='{}'
  and jsonb_typeof(s.payload#>'{raw,data,socials}')='array'
  and jsonb_array_length(case when jsonb_typeof(s.payload#>'{raw,data,socials}')='array' then s.payload#>'{raw,data,socials}' else '[]' end)>0
), eligible as materialized(
 select o.id,v.id venue_id,o.field_provenance,f.state previous_state,f.reason_code previous_reason,f.evidence previous_evidence
 from candidate_ids ids join public.organizations o on o.id=ids.id
 join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join public.entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id
  and f.dimension='contact' and f.state in('fail','pending') and f.waived_at is null
 where o.status='active' and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
  and o.roles=array['venue']::text[] and o.social='{}' and not(o.field_provenance?'social')
  and not exists(select 1 from public.venues x where x.organization_id=o.id and x.id<>v.id and x.duplicate_of_id is null)
 order by o.id for update of o,v,f skip locked
), source_rows as materialized(
 select e.id,s.id source_id,s.source_slug,s.source_url,s.payload_hash,s.last_seen_at,s.payload
 from eligible e join public.organizations o on o.id=e.id
 join public.venue_sources s on s.venue_id=e.venue_id and s.source_slug='agendaq'
 where s.source_url='https://www.agendaq.fr/fr/guide/'||(s.payload#>>'{raw,slug}')
  and s.payload_hash~'^[a-f0-9]{64}$'
  and lower(btrim(s.payload#>>'{raw,name}'))=lower(btrim(o.name))
 for share of s
), claims as materialized(
 select s.id,s.source_id,s.source_url,s.payload_hash,s.last_seen_at,p->>'socialPlatform' platform,btrim(p->>'socialId') url
 from source_rows s cross join lateral jsonb_array_elements(
 case when jsonb_typeof(s.payload#>'{raw,data,socials}')='array' then s.payload#>'{raw,data,socials}' else '[]' end) p
 where (p->>'socialPlatform'='facebook' and btrim(p->>'socialId')~'^https://(www\.)?facebook\.com/[A-Za-z0-9][A-Za-z0-9._/-]*/?$'
  and btrim(p->>'socialId')!~*'facebook\.com/(sharer|share|dialog|login|events|groups)(/|$)')
 or (p->>'socialPlatform'='instagram' and btrim(p->>'socialId')~'^https://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$'
  and btrim(p->>'socialId')!~*'instagram\.com/(p|reel|reels|stories|explore|accounts)(/|$)')
 or (p->>'socialPlatform' in('twitter','x') and btrim(p->>'socialId')~'^https://(www\.)?(twitter|x)\.com/[A-Za-z0-9_]+/?$'
  and btrim(p->>'socialId')!~*'(twitter|x)\.com/(share|intent|home|search|i)(/|$)')
), agreed as(
 select id from claims group by id having not exists(
 select 1 from claims c where c.id=claims.id group by c.platform having count(distinct regexp_replace(c.url,'/$',''))>1)
), selected as materialized(
 select c.id,jsonb_object_agg(c.platform,c.url order by c.last_seen_at,c.source_id) social,
  jsonb_agg(jsonb_build_object('source_id',c.source_id,'source_url',c.source_url,'payload_hash',c.payload_hash,
   'source_last_seen_at',c.last_seen_at,'platform',c.platform,'url',c.url) order by c.source_id,c.platform) sources
 from claims c join agreed a using(id) group by c.id order by c.id limit(select batch_size from parameters)
), audited as(
 insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
 select 'organization',e.id,'contact',jsonb_build_object('social','{}'::jsonb,'social_provenance',e.field_provenance->'social',
  'finding',jsonb_build_object('state',e.previous_state,'reason_code',e.previous_reason,'evidence',e.previous_evidence)),
  jsonb_build_object('social',s.social,'source_records',s.sources),'agendaq_source_socials'
 from selected s join eligible e using(id) where not(select dry_run from parameters) returning entity_id
), changed as(
 update public.organizations o set social=s.social,updated_at=now(),
  quality_dimensions=coalesce(o.quality_dimensions,'{}')||jsonb_build_object('contact',
   jsonb_build_object('state','pass','reason_code','contact_available','waived',false)),
  field_provenance=coalesce(o.field_provenance,'{}')||jsonb_build_object('social',jsonb_build_object(
   'source','agendaq_source_socials','source_table','venue_sources','source_records',s.sources,
   'source_path','raw.data.socials','inherited_at',now(),'human_reviewed',false))
 from selected s join audited a on a.entity_id=s.id where o.id=s.id and o.social='{}' returning o.id
), findings as(
 update public.entity_quality_findings f set state='pass',reason_code='contact_available',checked_at=now(),
  evidence=coalesce(f.evidence,'{}')||jsonb_build_object('social',true,'repair_source','agendaq_source_socials','source_records',s.sources)
 from changed c join selected s on s.id=c.id where f.entity_type='organization' and f.entity_id=c.id
  and f.dimension='contact' and f.waived_at is null and f.state in('fail','pending') returning f.id
)
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from selected s) evidence;
commit;
