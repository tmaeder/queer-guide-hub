-- Default dry run. Facts come from fresh publisher and official-site captures.
-- This installs no permanent function and changes no publication/content fields.
begin;
set local statement_timeout='60s';set local lock_timeout='2s';
set local app.actor='system:publisher-official-venue-website:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=50;r record;c record;old_reviews jsonb;old_issues jsonb;
 before_item jsonb;after_item jsonb;after_event jsonb;linked integer:=0;pins integer:=0;q_count integer:=0;i_count integer:=0;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal actor required';end if;
 if exists(select 1 from public.admin_automations where slug in('review_automatic_resolution','event_venue_link')and not enabled)
 then raise exception 'Venue/review automation is paused';end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))then raise exception 'Review cleanup already running';end if;
 for r in
 with input as(select *from jsonb_to_recordset(current_setting('matching.publisher_venue_website_evidence')::jsonb->'proofs')as x(
 id uuid,title text,start_date timestamptz,external_id text,expected_updated_at timestamptz,expected_event_hash text,
 event_source_id uuid,source_url text,event_payload_hash text,expected_source_hash text,venue_id uuid,expected_venue_hash text,
 publisher_venue_name text,publisher_venue_url text,publisher_address text,source_latitude numeric,source_longitude numeric,
 official_latitude numeric,official_longitude numeric,homepage_host text,postal_code text,publisher_capture text,official_capture text)),
 unique_input as(select id from input group by id having count(*)=1),captures as(
 select *from jsonb_to_recordset(current_setting('matching.publisher_venue_website_evidence')::jsonb->'captures')as x(url text,body text,sha256 text,observed_at timestamptz)
 ),eligible as materialized(
 select x.*,to_jsonb(e)old_event,es.payload#>'{normalized}'source_binding,v.latitude venue_latitude,v.longitude venue_longitude,
 case when e.field_provenance#>>'{latitude,source}'='derived:city_centroid'and e.field_provenance#>>'{longitude,source}'='derived:city_centroid'
  and pg_input_is_valid(e.field_provenance#>>'{latitude,value}','numeric')and pg_input_is_valid(e.field_provenance#>>'{longitude,value}','numeric')
 then e.latitude=(e.field_provenance#>>'{latitude,value}')::numeric and e.longitude=(e.field_provenance#>>'{longitude,value}')::numeric
 else e.latitude is null and e.longitude is null and not(coalesce(e.field_provenance,'{}')?|array['latitude','longitude'])end copy_pin
 from input x join unique_input u using(id)join public.events e on e.id=x.id
 join public.venues v on v.id=x.venue_id join public.event_sources es on es.id=x.event_source_id and es.event_id=e.id
 join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
 join public.countries co on co.id=e.country_id and co.code='DE'
 where e.updated_at=x.expected_updated_at and md5(to_jsonb(e)::text)=x.expected_event_hash
 and md5(to_jsonb(v)::text)=x.expected_venue_hash and md5(to_jsonb(es)::text)=x.expected_source_hash
 and e.venue_id is null and e.duplicate_of_id is null and e.is_public=true and e.safety_gated is not true
 and coalesce(e.status,'active')not in('cancelled','archived','rejected')and v.closed_at is null and v.duplicate_of_id is null and v.safety_gated is not true
 and e.title=x.title and e.start_date=x.start_date and e.external_id=x.external_id and e.data_source='siegessaeule'
 and e.country=co.code and e.city_id=v.city_id and e.country_id=v.country_id and ci.name='Berlin'
 and e.venue_name=x.publisher_venue_name and es.source_slug=e.data_source and es.source_entity_id=e.external_id
 and es.payload_hash=x.event_payload_hash and es.payload_hash~'^[a-f0-9]{64}$'and es.source_url=x.source_url
 and x.source_url='https://www.siegessaeule.de/termine/'||e.external_id||'/'
 and es.payload#>>'{normalized,sourceId}'=e.external_id and es.payload#>>'{normalized,title}'=e.title
 and es.payload#>>'{normalized,metadata,source}'='siegessaeule'
 and es.payload#>>'{normalized,venue_name}'=e.venue_name and es.payload#>>'{normalized,location,address}'=x.publisher_address
 and es.payload#>>'{normalized,location,country}'=co.code
 and case when pg_input_is_valid(es.payload#>>'{normalized,start_date}','timestamptz')then(es.payload#>>'{normalized,start_date}')::timestamptz=e.start_date else false end
 -- This official-site adapter is scoped to the independently checked source.
 and x.homepage_host='insomnia-berlin.de'and x.postal_code='12099'
 and v.website in('https://www.insomnia-berlin.de/','https://insomnia-berlin.de/','https://www.insomnia-berlin.de/index.html')
 and x.publisher_venue_url in('https://www.insomnia-berlin.de/','https://insomnia-berlin.de/','https://www.insomnia-berlin.de/index.html')
 and (v.postal_code=x.postal_code or v.address~'(^|[^0-9])12099([^0-9]|$)')and x.publisher_address~'(^|[^0-9])12099([^0-9]|$)'
 and 1=(select count(*)from public.venues peer where peer.city_id=e.city_id and peer.country_id=e.country_id and peer.duplicate_of_id is null
  and peer.website in('https://www.insomnia-berlin.de/','https://insomnia-berlin.de/','https://www.insomnia-berlin.de/index.html'))
 and x.source_latitude between -90 and 90 and x.source_longitude between -180 and 180
 and x.official_latitude between -90 and 90 and x.official_longitude between -180 and 180
 and public.haversine_m(x.source_latitude,x.source_longitude,v.latitude,v.longitude)<=100
 and public.haversine_m(x.official_latitude,x.official_longitude,v.latitude,v.longitude)<=100
 and public.haversine_m(x.source_latitude,x.source_longitude,x.official_latitude,x.official_longitude)<=100
 and exists(select 1 from public.geo_country_at(v.latitude,v.longitude)g where g.iso_a2=co.code)
 and exists(select 1 from captures pc where pc.sha256=x.publisher_capture and pc.url=x.source_url and pc.observed_at between now()-interval '1 hour'and now()+interval '5 minutes'
  and pc.sha256=encode(extensions.digest(convert_to(pc.body,'UTF8'),'sha256'),'hex'))
 and exists(select 1 from captures oc where oc.sha256=x.official_capture and oc.url='https://www.insomnia-berlin.de/kontakt.html'and oc.observed_at between now()-interval '1 hour'and now()+interval '5 minutes'
  and oc.sha256=encode(extensions.digest(convert_to(oc.body,'UTF8'),'sha256'),'hex'))
 and not(coalesce(e.field_provenance,'{}')?|array['venue_id','venue_name'])
 and lower(coalesce(e.field_provenance#>>'{country_id,human_reviewed}','false'))<>'true'
 and lower(coalesce(e.field_provenance#>>'{country_id,source}',''))not in('human','manual','user','admin')
 and not exists(select 1 from public.content_revisions cr where cr.source_table='events'and cr.source_id=e.id and cr.actor_kind='human'
  and cr.changed_fields&&array['venue_id','venue_name','city_id','country_id','external_id','data_source','latitude','longitude'])
 and not exists(select 1 from public.review_queue q where q.entity_type='event'and q.entity_id=e.id and q.review_type='venue_link_candidate'
  and(q.resolved_by is not null or q.status='pending'and(lower(q.details->>'hard_blocker')='true'or lower(q.details->>'requires_confirm')='true'or lower(q.details->>'force_review')='true'or lower(q.details->>'human_reviewed')='true')))
 and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id and i.issue_code='NAMED_VENUE_UNLINKED'
  and(i.reviewed_by is not null or i.reviewed_at is not null or i.resolution is not null or lower(i.evidence->>'manual_hold')='true'))
 )
 select candidate.*from eligible candidate join public.events e on e.id=candidate.id join public.venues v on v.id=candidate.venue_id
 join public.event_sources es on es.id=candidate.event_source_id
 where md5(to_jsonb(e)::text)=candidate.expected_event_hash and md5(to_jsonb(v)::text)=candidate.expected_venue_hash and md5(to_jsonb(es)::text)=candidate.expected_source_hash
 and (candidate.copy_pin and(e.latitude is null or public.haversine_m(e.latitude,e.longitude,v.latitude,v.longitude)<=20000)
  or not candidate.copy_pin and public.haversine_m(e.latitude,e.longitude,v.latitude,v.longitude)<=100)
 and not exists(select 1 from public.events other where other.id<>e.id and other.duplicate_of_id is null and other.venue_id=v.id and other.start_date=e.start_date and lower(btrim(other.title))=lower(btrim(e.title)))
 and not exists(select 1 from eligible peer where peer.id<>e.id and peer.venue_id=v.id and peer.start_date=e.start_date and lower(btrim(peer.title))=lower(btrim(e.title)))
 order by e.id limit greatest(0,least(batch_size,50))for update of e skip locked for share of v,es skip locked
 loop
  begin
   perform 1 from public.review_queue q where q.entity_type='event'and q.entity_id=r.id and q.review_type='venue_link_candidate'for update nowait;
   perform 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED'for update nowait;
  exception when lock_not_available then continue;end;
  if exists(select 1 from public.review_queue q where q.entity_type='event'and q.entity_id=r.id and q.review_type='venue_link_candidate'
   and(q.resolved_by is not null or q.status='pending'and(lower(q.details->>'hard_blocker')='true'or lower(q.details->>'requires_confirm')='true'or lower(q.details->>'force_review')='true'or lower(q.details->>'human_reviewed')='true')))
   or exists(select 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED'and(i.reviewed_by is not null or i.reviewed_at is not null or i.resolution is not null or lower(i.evidence->>'manual_hold')='true'))
  then continue;end if;
  linked:=linked+1;ids:=array_append(ids,r.id);if dry_run then continue;end if;
  for c in select *from jsonb_to_recordset(current_setting('matching.publisher_venue_website_evidence')::jsonb->'captures')as x(url text,body text,sha256 text,observed_at timestamptz)
   where sha256 in(r.publisher_capture,r.official_capture)loop
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   select 'review_source_capture',md5(c.url||c.sha256)::uuid,'publisher_venue_website_capture:v1',null,to_jsonb(c)
   where not exists(select 1 from public.admin_review_repairs where entity_type='review_source_capture'and entity_id=md5(c.url||c.sha256)::uuid and reason='publisher_venue_website_capture:v1');
  end loop;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]')into old_reviews from public.review_queue q where q.entity_type='event'and q.entity_id=r.id and q.review_type='venue_link_candidate'and q.status='pending';
  select coalesce(jsonb_agg(to_jsonb(i)),'[]')into old_issues from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED'and i.status='open'and i.detector='event-quality-scan';
  update public.events e set venue_id=r.venue_id,latitude=case when r.copy_pin then r.venue_latitude else e.latitude end,
   longitude=case when r.copy_pin then r.venue_longitude else e.longitude end,updated_at=now(),
   field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('venue_id',jsonb_build_object(
    'source','publisher_official_venue_website:v1','source_ref',r.venue_id,'event_source_id',r.event_source_id,'event_payload_hash',r.event_payload_hash,
    'publisher_url',r.source_url,'publisher_capture',r.publisher_capture,'official_capture',r.official_capture,'previous_value',e.venue_id,'at',now(),'human_reviewed',false))||
   case when r.copy_pin then jsonb_build_object(
    'latitude',jsonb_build_object('source','publisher_official_venue_website:v1','value',r.venue_latitude,'previous_value',e.latitude,'previous_provenance',e.field_provenance->'latitude','at',now(),'human_reviewed',false),
    'longitude',jsonb_build_object('source','publisher_official_venue_website:v1','value',r.venue_longitude,'previous_value',e.longitude,'previous_provenance',e.field_provenance->'longitude','at',now(),'human_reviewed',false))else '{}'end
   where e.id=r.id returning to_jsonb(e)into after_event;
  if after_event-array['venue_id','latitude','longitude','updated_at','field_provenance','geo_linked_at','safety_gated']is distinct from r.old_event-array['venue_id','latitude','longitude','updated_at','field_provenance','geo_linked_at','safety_gated']
   or(after_event->'field_provenance')-array['venue_id','latitude','longitude','country_id']is distinct from(r.old_event->'field_provenance')-array['venue_id','latitude','longitude','country_id']
   or(not r.copy_pin and(after_event->'latitude'is distinct from r.old_event->'latitude'or after_event->'longitude'is distinct from r.old_event->'longitude'))
   or after_event->>'venue_id'is distinct from r.venue_id::text then raise exception 'Protected event state changed %',r.id;end if;
  if exists(select 1 from public.event_quality_findings(r.id)f where f.issue_code='NAMED_VENUE_UNLINKED')then raise exception 'Native venue finding remains %',r.id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)values('event',r.id,'publisher_venue_website_link:v1',r.old_event,after_event);
  for before_item in select value from jsonb_array_elements(old_reviews)loop
   select to_jsonb(q)into after_item from public.review_queue q where q.id=(before_item->>'id')::uuid;
   if after_item->>'status'is distinct from 'resolved'then raise exception 'Native review did not reconcile %',r.id;end if;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)values('review_queue',(before_item->>'id')::uuid,'publisher_venue_website_review:v1',before_item,after_item);q_count:=q_count+1;
  end loop;
  for before_item in select value from jsonb_array_elements(old_issues)loop
   update public.event_quality_issues i set status='resolved',resolved_at=now(),resolution='Automatic: publisher website and mapped point corroborate canonical venue; no human review claimed.'where i.id=(before_item->>'id')::uuid returning to_jsonb(i)into after_item;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)values('event_quality_issue',(before_item->>'id')::uuid,'publisher_venue_website_finding:v1',before_item,after_item);i_count:=i_count+1;
  end loop;
  update public.event_quality_current set issue_codes=array_remove(issue_codes,'NAMED_VENUE_UNLINKED'),open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED')where event_id=r.id;
  if r.copy_pin then pins:=pins+1;end if;
 end loop;
 perform set_config('matching.publisher_venue_website_result',jsonb_build_object('dry_run',dry_run,'linked',linked,'pins',pins,'review_findings',q_count,'quality_findings',i_count,'event_ids',ids)::text,false);
end $repair$;
select current_setting('matching.publisher_venue_website_result')::jsonb result;
commit;
