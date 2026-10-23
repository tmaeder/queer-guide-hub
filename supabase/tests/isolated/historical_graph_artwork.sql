create table fixture(n int primary key,e uuid,s uuid,i uuid,old_event jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null from generate_series(1,30)n;
insert into events(id,title,external_id,description,start_date,end_date,status,images,field_provenance)
 select e,'Archive event '||n,(100000+n)::text,repeat('Original attributable source description. ',4),
 now()-interval '60 days',now()-interval '60 days'+interval '1 hour','completed',
 array['https://graph.facebook.com/'||(900000+n)||'/picture?type=large'],
 '{"description":{"human_reviewed":true}}'::jsonb from fixture;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select f.s,e.id,'gaycities',e.external_id,'https://london.gaycities.com/events/'||e.external_id||'-event',repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('url','https://london.gaycities.com/events/'||e.external_id||'-event',
 'fromWayback',true,'jsonLd',jsonb_build_object('_legacyTemplate',true,'name',e.title,
 'startDate',to_char(e.start_date,'YYYY-MM-DD"T"HH24:MI:SS'),
 'image',jsonb_build_array(replace(e.images[1],'https:','http:')))),
 'normalized',jsonb_build_object('images',to_jsonb(e.images),'metadata',jsonb_build_object('from_wayback',true)))
 from fixture f join events e on e.id=f.e;
insert into event_image_quality_observations(event_id,image_url,http_status,mime_type,probe_status,failure_reason)
 select id,images[1],400,'application/json; charset=utf-8','fail','http_400'from events;
insert into event_quality_issues(id,event_id,dimension,issue_code,evidence,evidence_hash,detector)
 select f.i,e.id,'media','IMAGE_UNREACHABLE',jsonb_build_object('url',e.images[1],'http_status',400,
 'mime_type','application/json; charset=utf-8','reason','http_400'),repeat('b',32),'event-image-quality'
 from fixture f join events e on e.id=f.e;
insert into event_quality_current(event_id,open_issue_codes,assessed_at,input_updated_at)
 select id,array['IMAGE_UNREACHABLE'],now()-interval '1 hour',updated_at from events;

-- Five positive paths: a JSON error, JSON with HTTP 200, a new importer
-- exclusion, an unrelated human description, and a malformed legacy API URL.
update event_quality_issues set issue_code='IMAGE_MIME_INVALID',evidence=evidence||'{"http_status":200,"reason":"not_image"}'::jsonb
 where id=(select i from fixture where n=2);
update event_image_quality_observations set http_status=200,failure_reason='not_image'where event_id=(select e from fixture where n=2);
update events set images='{}'where id=(select e from fixture where n=3);
delete from event_image_quality_observations where event_id=(select e from fixture where n=3);
update event_quality_issues set issue_code='IMAGE_MISSING',detector='event-quality-scan',evidence='{"image_count":0}',
 evidence_hash=md5('{"image_count": 0}')where id=(select i from fixture where n=3);
update event_sources set payload=jsonb_set(payload,'{normalized,images}','[]')||jsonb_build_object('normalized',
 jsonb_build_object('images','[]'::jsonb,'metadata',jsonb_build_object('from_wayback',true,'artwork_exclusion',
 jsonb_build_object('contract','gaycities-wayback-graph-artwork:v1','outcome','source_unavailable',
 'reason','api_reference_excluded','api_reference','https://graph.facebook.com/900003/picture?type=large','human_reviewed',false))))
 where id=(select s from fixture where n=3);
insert into content_revisions values('events',(select e from fixture where n=4),'human',array['description']);
update events set images=array[replace(images[1],'?type=large','&type=large')]where id=(select e from fixture where n=5);
update event_sources set payload=replace(payload::text,'?type=large','&type=large')::jsonb where id=(select s from fixture where n=5);
update event_image_quality_observations set image_url=replace(image_url,'?type=large','&type=large')where event_id=(select e from fixture where n=5);
update event_quality_issues set evidence=replace(evidence::text,'?type=large','&type=large')::jsonb where id=(select i from fixture where n=5);

-- Negative/ownership/source-integrity cases.
update event_sources set payload=jsonb_set(payload,'{raw,fromWayback}','false')where id=(select s from fixture where n=6);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,_legacyTemplate}','false')where id=(select s from fixture where n=7);
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select gen_random_uuid(),e,'official','other','https://official.example/artwork',repeat('c',64),
 '{"raw":{"images":["https://official.example/poster.jpg"]}}'::jsonb from fixture where n=8;
update events set images=images||array['https://official.example/poster.jpg']where id=(select e from fixture where n=9);
insert into content_revisions values('events',(select e from fixture where n=10),'human',array['images']);
update events set field_provenance=field_provenance||'{"images":{"human_reviewed":true}}'where id=(select e from fixture where n=11);
update event_quality_issues set reviewed_by=gen_random_uuid()where id=(select i from fixture where n=12);
update events set status='active',start_date=now()+interval '1 day',end_date=now()+interval '2 days'where id=(select e from fixture where n=13);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,startDate}','"2001-01-01T12:00:00"')where id=(select s from fixture where n=14);
update event_sources set source_entity_id='different'where id=(select s from fixture where n=15);
update event_image_quality_observations set http_status=200,mime_type='image/jpeg',probe_status='pass'where event_id=(select e from fixture where n=16);
update event_image_quality_observations set http_status=null,mime_type=null,failure_reason='network_error'where event_id=(select e from fixture where n=17);
update event_sources set payload=jsonb_set(payload,'{enriched}',
 '{"images":["https://official.example/real.jpg"]}')where id=(select s from fixture where n=18);
update event_sources set source_slug='legacy-csv'where id=(select s from fixture where n=19);
update event_sources set payload=jsonb_set(payload,'{raw,url}','"https://unrelated.example/event"')where id=(select s from fixture where n=20);
update events set field_provenance=field_provenance||'{"images":"unknown ownership"}'where id=(select e from fixture where n=21);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,image}','["https://graph.facebook.com/not-a-picture"]')where id=(select s from fixture where n=22);
update event_sources set source_url='https://london.gaycities.com/events/999999-other'where id=(select s from fixture where n=23);
update event_quality_issues set severity='critical'where id=(select i from fixture where n=24);
update event_sources set payload=jsonb_set(payload,'{raw,photos}','["https://official.example/photo.jpg"]')where id=(select s from fixture where n=25);
update events set images=array['https://graph.facebook.com/999999999/picture?type=large']where id=(select e from fixture where n=26);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,name}','"Another event"')where id=(select s from fixture where n=27);
update event_quality_issues set status='accepted',resolution='Human accepted the original image'where id=(select i from fixture where n=28);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,thumbnailUrl}','"https://official.example/thumbnail.jpg"')where id=(select s from fixture where n=29);
update event_quality_issues set reviewed_at=now(),resolution='Human pending image note'where id=(select i from fixture where n=30);
update fixture f set old_event=to_jsonb(evt)from events evt where evt.id=f.e;

do $test$
declare r jsonb;before_data text;after_data text;f record;
begin
 assert not has_function_privilege('anon','reconcile_historical_graph_artwork(integer,boolean,uuid[])','execute');
 assert not has_function_privilege('authenticated','reconcile_historical_graph_artwork(integer,boolean,uuid[])','execute');
 assert has_function_privilege('service_role','reconcile_historical_graph_artwork(integer,boolean,uuid[])','execute');
 for f in select *from fixture loop
  assert(api_private.historical_graph_artwork_scope(f.e)is not null)=(f.n<=5),'Unexpected contract eligibility '||f.n;
 end loop;
 select md5(jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)order by id)from events e),
 'issues',(select jsonb_agg(to_jsonb(i)order by id)from event_quality_issues i),'signals',(select jsonb_agg(to_jsonb(s))from event_quality_signals s))::text)into before_data;
 r:=reconcile_historical_graph_artwork(100,true);assert(r->>'invalid_references_removed')::int=4,r::text;
 assert(r->>'source_outcomes_recorded')::int=5,r::text;
 select md5(jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)order by id)from events e),
 'issues',(select jsonb_agg(to_jsonb(i)order by id)from event_quality_issues i),'signals',(select jsonb_agg(to_jsonb(s))from event_quality_signals s))::text)into after_data;
 assert before_data=after_data,'Dry run changed source data';
 r:=run_event_quality_repairs(100,false);
 assert(r#>>'{source_artwork,invalid_references_removed}')::int=4,r::text;
 assert(r#>>'{source_artwork,source_outcomes_recorded}')::int=5,r::text;
 for f in select *from fixture loop
  if f.n<=5 then
   assert(select cardinality(images)=0 from events where id=f.e);
   assert(select reviewed_by is null and status='accepted'and resolution like 'auto-source-artwork-unavailable:v1 %'
    and evidence_hash=case when f.n=3 then md5('{"image_count": 0}')else repeat('b',32)end
    from event_quality_issues where id=f.i),'Source decision lost evidence';
   assert(select to_jsonb(e)-array['images','field_provenance','updated_at']=f.old_event-array['images','field_provenance','updated_at']from events e where id=f.e);
  else assert(select to_jsonb(e)=f.old_event from events e where id=f.e),'Protected event changed '||f.n;
  end if;
 end loop;
 r:=reconcile_historical_graph_artwork(100,false);assert(r->>'source_outcomes_recorded')::int=0,r::text;
 assert(r->>'invalid_references_removed')::int=0,r::text;
 -- The real scanner now creates physical IMAGE_MISSING findings and records
 -- the limitation before taking its open-code snapshot; media scores stay 0.
 r:=run_event_quality_scan(100,'historical',false);
 assert not exists(select 1 from event_quality_issues i join fixture pick on pick.e=i.event_id where pick.n<=5 and i.status='open');
 assert not exists(select 1 from event_quality_current q join fixture pick on pick.e=q.event_id where pick.n<=5 and(q.media_score<>0 or cardinality(q.open_issue_codes)<>0));
 assert not exists(select 1 from events where quality_score<>42);
 -- An irrelevant source description/hash refresh keeps the artwork outcome.
 update event_sources set payload=payload||'{"irrelevant_description":"New prose"}',payload_hash=repeat('d',64)where id=(select s from fixture where n=1);
 assert not exists(select 1 from event_quality_issues i where i.event_id=(select e from fixture where n=1)and i.status='open');
 -- An offered real source image reopens the unresolved missing-artwork work.
 update event_sources set payload=jsonb_set(payload,'{normalized,images}','["https://official.example/new-poster.jpg"]')where id=(select s from fixture where n=1);
 assert exists(select 1 from event_quality_issues i where i.event_id=(select e from fixture where n=1)and i.issue_code='IMAGE_MISSING'and i.status='open'and i.reviewed_by is null);
 assert not exists(select 1 from event_quality_current where event_id=(select e from fixture where n=1));
 -- A canonical replacement retires the former source-limited missing finding.
 update events set images=array['https://official.example/new-poster.jpg']where id=(select e from fixture where n=2);
 assert not exists(select 1 from event_quality_issues i where i.event_id=(select e from fixture where n=2)and i.status in('open','accepted'));
 -- Publication/occurrence context changes invalidate the historical exception.
 update events set status='active',start_date=now()+interval '1 day',end_date=now()+interval '2 days'where id=(select e from fixture where n=3);
 assert exists(select 1 from event_quality_issues i where i.event_id=(select e from fixture where n=3)and i.issue_code='IMAGE_MISSING'and i.status='open');
 perform set_config('test.actor',gen_random_uuid()::text,true);
 begin perform reconcile_historical_graph_artwork(100,false);raise exception 'Human source decision was allowed';
 exception when others then assert sqlerrm='Internal source outcomes only',sqlerrm;end;
 perform set_config('test.actor','',true);
end $test$;
