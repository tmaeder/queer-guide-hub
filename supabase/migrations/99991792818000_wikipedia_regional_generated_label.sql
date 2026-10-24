-- A structured regional label is not publisher narrative. An actual official
-- missing-page observation and every existing ownership guard remain required.
begin;
select pg_advisory_xact_lock(hashtext('business_quality_lifecycle'));
create temporary table wiki_source_scope_before on commit drop as
 select o.id from public.organizations o
 where exists(select 1 from public.venue_sources s where s.venue_id=o.primary_venue_id and s.source_slug='nude-places')
 and api_private.organization_missing_wikipedia_source(o.id)is not null;
create or replace function api_private.organization_missing_wikipedia_source(p_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('contract','registered-wikipedia-missing-page:v1','outcome','source_unavailable',
 'unavailable_dimensions','["editorial","contact","media"]'::jsonb,'source_table','venues','source_venue_id',v.id,
 'source_records',jsonb_build_array(jsonb_build_object('id',s.id,'source_slug',s.source_slug,'source_entity_id',s.source_entity_id,
 'source_url',s.source_url,'payload_hash',s.payload_hash)),
 'observation_id',observation.id,'observed_at',observation.observed_at,'requested_title',observation.requested_title,
 'selected_page_sha256',observation.selected_page_sha256,'response_sha256',observation.response_sha256,
 'api_url',observation.api_url,'api_page',observation.selected_page,'human_reviewed',false,
 'explanation','The official Wikipedia API reported this exact sole registered article missing. No business prose, contact or reusable media is supplied by the registered record. Existing facts and identity decisions remain applicable; new source evidence invalidates this outcome.')
 from organizations o join venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join venue_sources s on s.venue_id=v.id
 cross join lateral(select x.*from api_private.venue_source_presence_observations x where x.source_id=s.id order by x.observed_at desc,(x.result='present')desc,x.created_at desc,x.id desc limit 1)observation
 where o.id=p_id and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
 and o.status='active'and o.claim_status='unclaimed'and o.last_verified_at is null and o.roles=array['venue']::text[]
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name))and o.city_id is not distinct from v.city_id and o.country_id is not distinct from v.country_id
 and s.source_slug='nude-places'and s.payload#>>'{normalized,metadata,source}'='wikipedia'
 and lower(btrim(coalesce(s.payload#>>'{raw,name}',s.payload#>>'{normalized,name}')))=lower(btrim(v.name))
 and observation.source_payload_hash=s.payload_hash and observation.source_url=s.source_url and observation.result='missing'
 and observation.requested_title=api_private.registered_wikipedia_source_title(s.source_url,s.source_entity_id)
 and not exists(select 1 from venue_sources other where other.venue_id=v.id and other.id<>s.id)
 and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
 and not(o.field_provenance?|array['description','website','website_domain','phone','email','social','images','logo_url','cover_image_url'])
 and not exists(select 1 from entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id
  and(f.waived_at is not null or f.waived_by is not null or f.evidence?'governance_resolution'))
 and not exists(select 1 from content_revisions r where r.source_table in('venues','organizations')and r.source_id in(v.id,o.id)
  and r.actor_kind='human'and r.changed_fields&&array['description','website','phone','email','images','logo_url','cover_image_url'])
 and not exists(select 1 from venue_review_queue q where q.venue_id=v.id and q.status in('open','rejected')
  and q.field in('description','website','phone','email','images','logo_url','cover_image_url'))
 and not exists(select 1 from(values(s.payload->'raw'),(s.payload->'normalized'),(s.payload->'enriched'),(s.payload#>'{normalized,metadata}'))sections(data)
  cross join lateral jsonb_each(case when jsonb_typeof(data)='object'then data else '{}'::jsonb end)fact
  where fact.value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb,'"[]"'::jsonb,'"{}"'::jsonb)
  and(fact.key in('website','website_url','phone','phone_e164','telephone','email','contacts','social','images','photos','image_url','logo_url','cover_image_url')
   or(fact.key='description'and fact.value#>>'{}'not in(v.name,
    coalesce('Social nudity place in '||coalesce(s.payload#>>'{raw,country}',s.payload#>>'{normalized,metadata,country_name}')||'.',''),
    case when sections.data=s.payload->'normalized'
    and s.payload#>>'{raw,venue_subtype}'='Other'
    and s.payload#>>'{raw,description}'=v.name
    and jsonb_typeof(s.payload#>'{raw,region}')='string'and nullif(s.payload#>>'{raw,region}','')is not null
    and jsonb_typeof(s.payload#>'{raw,country}')='string'and nullif(s.payload#>>'{raw,country}','')is not null
    then 'Social nudity place in '||(s.payload#>>'{raw,region}')||', '||(s.payload#>>'{raw,country}')||'.'
    else v.name end))))
$$;
revoke all on function api_private.organization_missing_wikipedia_source(uuid)from public,anon,authenticated;


update public.organizations o set quality_checked_at=null
where exists(select 1 from public.venue_sources s where s.venue_id=o.primary_venue_id and s.source_slug='nude-places')
and not exists(select 1 from wiki_source_scope_before b where b.id=o.id)
and api_private.organization_missing_wikipedia_source(o.id)is not null;
commit;
