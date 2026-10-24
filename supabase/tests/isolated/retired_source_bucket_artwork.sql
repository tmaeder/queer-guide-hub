create table fixture_bucket(n int primary key,e uuid,s uuid,i uuid,old_event jsonb);
insert into fixture_bucket select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null from generate_series(1,25)n;
insert into events(id,title,external_id,description,start_date,end_date,status,images,field_provenance)
 select e,'Bucket archive '||n,(700000+n)::text,repeat('Attributable original source description. ',4),
 now()-interval '90 days',now()-interval '90 days'+interval '1 hour','completed','{}','{"description":{"human_reviewed":true}}'
 from fixture_bucket;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select f.s,e.id,'gaycities',e.external_id,'https://london.gaycities.com/events/'||e.external_id||'-event',repeat('c',64),
 jsonb_build_object('raw',jsonb_build_object('url','https://london.gaycities.com/events/'||e.external_id||'-event',
 'fromWayback',true,'jsonLd',jsonb_build_object('_legacyTemplate',true,'name',e.title,'startDate',to_char(e.start_date,'YYYY-MM-DD"T"HH24:MI:SS'),
 'image',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_'||f.n||'.jpg'))),
 'normalized',jsonb_build_object('images',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_'||f.n||'.jpg'),
 'metadata',jsonb_build_object('from_wayback',true)))from fixture_bucket f join events e on e.id=f.e;
insert into event_image_quality_observations(event_id,image_url,http_status,mime_type,probe_status,failure_reason,content_hash)
 select f.e,'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_'||f.n||'.jpg',403,'application/xml','fail',
 'retired_source_bucket:AccessDenied',repeat('d',64)from fixture_bucket f;
insert into event_quality_issues(id,event_id,dimension,issue_code,evidence,evidence_hash,detector)
 select i,e,'media','IMAGE_MISSING','{"image_count":0}',repeat('e',32),'event-quality-scan'from fixture_bucket;
insert into event_quality_current(event_id,open_issue_codes,assessed_at,input_updated_at)
 select e.id,array['IMAGE_MISSING'],now()-interval '1 hour',e.updated_at from fixture_bucket f join events e on e.id=f.e;
-- Only 1 and 2 are eligible. Every refusal protects a distinct invariant.
insert into content_revisions values('events',(select e from fixture_bucket where n=3),'human',array['images']);
update event_quality_issues set reviewed_by=gen_random_uuid()where id=(select i from fixture_bucket where n=4);
update events set status='active',start_date=now()+interval '1 day',end_date=now()+interval '2 days'where id=(select e from fixture_bucket where n=5);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,name}','"Different event"')where id=(select s from fixture_bucket where n=6);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,startDate}','"2001-01-01"')where id=(select s from fixture_bucket where n=7);
update event_sources set source_entity_id='other'where id=(select s from fixture_bucket where n=8);
update event_sources set payload=jsonb_set(payload,'{enriched}','{"images":["https://official.example/poster.jpg"]}')where id=(select s from fixture_bucket where n=9);
update events set images=array['https://official.example/poster.jpg']where id=(select e from fixture_bucket where n=10);
update event_image_quality_observations set http_status=null,mime_type=null,probe_status='unknown'where event_id=(select e from fixture_bucket where n=11);
update event_image_quality_observations set http_status=200,mime_type='image/jpeg',probe_status='pass'where event_id=(select e from fixture_bucket where n=12);
update event_image_quality_observations set mime_type=null where event_id=(select e from fixture_bucket where n=13);
update event_image_quality_observations set failure_reason='http_403'where event_id=(select e from fixture_bucket where n=14);
update event_image_quality_observations set content_hash=null where event_id=(select e from fixture_bucket where n=15);
update event_sources set payload=jsonb_set(payload,'{raw,fromWayback}','false')where id=(select s from fixture_bucket where n=16);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,_legacyTemplate}','false')where id=(select s from fixture_bucket where n=17);
update events set duplicate_of_id=(select e from fixture_bucket where n=1)where id=(select e from fixture_bucket where n=18);
update event_sources set source_slug='legacy-csv'where id=(select s from fixture_bucket where n=19);
update event_sources set source_url='https://london.gaycities.com/events/123-wrong'where id=(select s from fixture_bucket where n=20);
update event_sources set payload=jsonb_set(payload,'{raw,photos}','["https://official.example/poster.jpg"]')where id=(select s from fixture_bucket where n=21);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,image}','["https://gaycities-featured-images-production.s3.amazonaws.com/events/a.jpg","https://gaycities-featured-images-production.s3.amazonaws.com/events/b.jpg"]')where id=(select s from fixture_bucket where n=22);
update events set field_provenance=field_provenance||'{"images":"unknown ownership"}'where id=(select e from fixture_bucket where n=23);
delete from event_image_quality_observations where event_id=(select e from fixture_bucket where n=24);
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,artwork_exclusion}',
 '{"contract":"gaycities-wayback-graph-artwork:v1","outcome":"source_unavailable","reason":"api_reference_excluded","human_reviewed":false,"api_reference":"https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_24.jpg"}')where id=(select s from fixture_bucket where n=24);
insert into event_image_quality_observations(event_id,image_url,http_status,mime_type,probe_status,failure_reason,checked_at)
 select e,'http://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_25.jpg',200,'image/jpeg','pass',null,now()+interval '1 minute'from fixture_bucket where n=25;
update fixture_bucket f set old_event=to_jsonb(evt)from events evt where evt.id=f.e;
do $test$
declare f record;r jsonb;ids uuid[];before_data text;after_data text;
begin
 for f in select *from fixture_bucket loop
  assert(api_private.historical_graph_artwork_scope(f.e)is not null)=(f.n<=2),'Unexpected retired-bucket eligibility '||f.n;
 end loop;
 select array_agg(e)into ids from fixture_bucket;
 select md5(jsonb_agg(to_jsonb(q)order by q.id)::text)into before_data from event_quality_issues q;
 r:=reconcile_historical_graph_artwork(100,true,ids);
 assert(r->>'source_outcomes_recorded')::int=2,r::text;
 assert(r->>'invalid_references_removed')::int=0,r::text;
 select md5(jsonb_agg(to_jsonb(q)order by q.id)::text)into after_data from event_quality_issues q;
 assert before_data=after_data,'Dry run changed findings';
 r:=reconcile_historical_graph_artwork(100,false,ids);
 assert(r->>'source_outcomes_recorded')::int=2,r::text;
 for f in select *from fixture_bucket loop
  assert(select to_jsonb(e)=f.old_event from events e where e.id=f.e),'Canonical event changed '||f.n||' '||(select jsonb_object_agg(k,jsonb_build_object('before',f.old_event->k,'after',to_jsonb(e)->k))::text from events e cross join lateral jsonb_object_keys(to_jsonb(e))k where e.id=f.e and to_jsonb(e)->k is distinct from f.old_event->k);
  if f.n<=2 then
   assert(select status='accepted'and reviewed_by is null and resolution like '%gaycities-wayback-retired-bucket-artwork:v1%'
    and evidence_hash=repeat('e',32)from event_quality_issues where id=f.i),'Outcome lost identity evidence';
  end if;
 end loop;
 r:=run_event_quality_scan(100,'historical',false);
 assert not exists(select 1 from event_quality_issues q join fixture_bucket pick on pick.e=q.event_id where pick.n<=2 and q.status='open');
 assert not exists(select 1 from event_quality_current q join fixture_bucket pick on pick.e=q.event_id where pick.n<=2 and q.media_score<>0);
 -- A newly successful observation reopens recovery; an old denial cannot win.
 update event_image_quality_observations set probe_status='pass',http_status=200,mime_type='image/jpeg',failure_reason=null,checked_at=now()+interval '1 second'
  where event_id=(select e from fixture_bucket where n=1);
 assert exists(select 1 from event_quality_issues where id=(select i from fixture_bucket where n=1)and status='open');
 assert not exists(select 1 from event_quality_current where event_id=(select e from fixture_bucket where n=1));
 -- A newly offered alternative source poster invalidates source unavailability.
 update event_sources set payload=jsonb_set(payload,'{normalized,images}','["https://official.example/new.jpg"]')where id=(select s from fixture_bucket where n=2);
 assert exists(select 1 from event_quality_issues where id=(select i from fixture_bucket where n=2)and status='open');
end $test$;
