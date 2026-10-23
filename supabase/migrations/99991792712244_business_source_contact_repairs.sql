-- Fill existing source facts before producing new completeness questions.
-- Preserve waivers, human provenance, other dimensions and native phone guards.
create function public.reconcile_business_source_websites(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare v_result jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic source inheritance requires an internal actor'; end if;
 if not pg_try_advisory_xact_lock(hashtext('reconcile_business_source_websites')) then
  return jsonb_build_object('skipped',true,'reason','already_running'); end if;
with parameters as (select coalesce(p_dry_run,true) dry_run,greatest(0,least(coalesce(p_batch,100),500)) batch_size),
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
 where o.status='active' and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
  and lower(btrim(o.name))=lower(btrim(v.name))
  and (o.country_id is null or o.country_id=v.country_id)
  and (o.city_id is null or o.city_id=v.city_id)
  and cardinality(o.roles)>0 and o.roles<@array['venue','support','community','advocacy']::text[]
  and not exists(select 1 from public.venues x where x.organization_id=o.id
   and x.id<>v.id and x.duplicate_of_id is null)
  and o.website is null and o.email is null and o.phone is null and o.social='{}'::jsonb
  and not(o.field_provenance ? 'website') and not(o.field_provenance ? 'website_domain')
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
 select distinct on(c.id) c.* from claims c join agreed a using(id) join public.organizations profile on profile.id=c.id
 where (profile.website_domain is null or lower(profile.website_domain)=c.host)
  and c.source_slug in('spartacus','foursquare','google','osm','agendaq','gay-ch','milchjugend','planet-randy','patroc')
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
select to_jsonb(outcome) into v_result from (
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(jsonb_build_object('id',id,'website',website,'source_id',source_id,'source_url',source_url)),'[]') from selected) evidence
) outcome;
 return v_result-'evidence';
end $repair$;
revoke all on function public.reconcile_business_source_websites(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_business_source_websites(integer,boolean) to service_role;

create function public.reconcile_business_source_phones(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare v_result jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic source inheritance requires an internal actor'; end if;
 if not pg_try_advisory_xact_lock(hashtext('reconcile_business_source_phones')) then
  return jsonb_build_object('skipped',true,'reason','already_running'); end if;
with parameters as(select coalesce(p_dry_run,true) dry_run,greatest(0,least(coalesce(p_batch,100),500)) batch_size),
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
select to_jsonb(outcome) into v_result from (
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(jsonb_build_object('id',id,'phone',verdict->>'e164','source_id',source_id,'source_url',source_url)),'[]') from selected) evidence
) outcome;
 return v_result-'evidence';
end $repair$;
revoke all on function public.reconcile_business_source_phones(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_business_source_phones(integer,boolean) to service_role;

create function public.reconcile_business_source_socials(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare v_result jsonb;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic source inheritance requires an internal actor'; end if;
 if not pg_try_advisory_xact_lock(hashtext('reconcile_business_source_socials')) then
  return jsonb_build_object('skipped',true,'reason','already_running'); end if;
with parameters as(select coalesce(p_dry_run,true) dry_run,greatest(0,least(coalesce(p_batch,100),500)) batch_size),
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
select to_jsonb(outcome) into v_result from (
select (select dry_run from parameters) dry_run,(select count(*) from selected) candidates,
 (select count(*) from changed) changed,(select count(*) from findings) findings_corrected,
 (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from selected s) evidence
) outcome;
 return v_result-'evidence';
end $repair$;
revoke all on function public.reconcile_business_source_socials(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_business_source_socials(integer,boolean) to service_role;

-- Reuse the existing producer's enabled/paused scheduling and bounded batch.
-- Interactive refreshes keep their existing behavior and never masquerade as
-- automatic non-human source inheritance.
do $patch$
declare target regprocedure;src text;
 anchor text:='  perform public.reconcile_superseded_business_findings(500,false);';
begin
 target:=coalesce(to_regprocedure('api_private.refresh_business_brand_quality()'),to_regprocedure('public.refresh_business_brand_quality()'));
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then
  raise exception 'Business source repair hook anchor changed'; end if;
 execute replace(src,anchor,anchor||'
  if auth.uid() is null then
    perform public.reconcile_business_source_websites(100,false);
    perform public.reconcile_business_source_phones(100,false);
    perform public.reconcile_business_source_socials(100,false);
  end if;');
end $patch$;
