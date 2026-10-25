create table fixture_bucket_paths(n int primary key,e uuid,s uuid,i uuid,old_event jsonb);
insert into fixture_bucket_paths select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null from generate_series(1,8)n;
insert into events(id,title,external_id,description,start_date,end_date,status,images,field_provenance)
 select e,'Bucket archive '||n,(700000+n)::text,repeat('Attributable original source description. ',4),
 now()-interval '90 days',now()-interval '90 days'+interval '1 hour','completed','{}','{"description":{"human_reviewed":true}}'
 from fixture_bucket_paths;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select f.s,e.id,'gaycities',e.external_id,'https://london.gaycities.com/events/'||e.external_id||'-event',repeat('c',64),
 jsonb_build_object('raw',jsonb_build_object('url','https://london.gaycities.com/events/'||e.external_id||'-event',
 'fromWayback',true,'jsonLd',jsonb_build_object('_legacyTemplate',true,'name',e.title,'startDate',to_char(e.start_date,'YYYY-MM-DD"T"HH24:MI:SS'),
 'image',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/'||case when f.n%2=1 then 't/sm/'else 'originals/'end||'sm_fb_'||f.n||'.jpg'))),
 'normalized',jsonb_build_object('images',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/'||case when f.n%2=1 then 't/sm/'else 'originals/'end||'sm_fb_'||f.n||'.jpg'),
 'metadata',jsonb_build_object('from_wayback',true)))from fixture_bucket_paths f join events e on e.id=f.e;
insert into event_image_quality_observations(event_id,image_url,http_status,mime_type,probe_status,failure_reason,content_hash)
 select f.e,'https://gaycities-featured-images-production.s3.amazonaws.com/events/'||case when f.n%2=1 then 't/sm/'else 'originals/'end||'sm_fb_'||f.n||'.jpg',403,'application/xml','fail',
 'retired_source_bucket:AccessDenied',repeat('d',64)from fixture_bucket_paths f;
insert into event_quality_issues(id,event_id,dimension,issue_code,evidence,evidence_hash,detector)
 select i,e,'media','IMAGE_MISSING','{"image_count":0}',repeat('e',32),'event-quality-scan'from fixture_bucket_paths;
insert into event_quality_current(event_id,open_issue_codes,assessed_at,input_updated_at)
 select e.id,array['IMAGE_MISSING'],now()-interval '1 hour',e.updated_at from fixture_bucket_paths f join events e on e.id=f.e;

update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,image}','["https://other-bucket.s3.amazonaws.com/events/t/sm/a.jpg"]')where id=(select s from fixture_bucket_paths where n=3);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,image}','["https://gaycities-featured-images-production.s3.amazonaws.com/events/t/sm/../a.jpg"]')where id=(select s from fixture_bucket_paths where n=4);
update event_sources set payload=jsonb_set(payload,'{enriched}','{"images":["https://official.example/poster.jpg"]}')where id=(select s from fixture_bucket_paths where n=5);
delete from event_image_quality_observations where event_id=(select e from fixture_bucket_paths where n=6);
-- A claimed importer exclusion cannot waive a potentially live nested URL.
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,artwork_exclusion}',
 jsonb_build_object('contract','gaycities-wayback-retired-bucket-artwork:v1','outcome','source_unavailable',
 'reason','retired_source_bucket_excluded','api_reference',payload#>>'{raw,jsonLd,image,0}','human_reviewed',false))
 where id=(select s from fixture_bucket_paths where n=6);
update event_image_quality_observations set failure_reason='http_403',mime_type='text/html'where event_id=(select e from fixture_bucket_paths where n=7);
update event_image_quality_observations set probe_status='pass',http_status=200,mime_type='image/jpeg'where event_id=(select e from fixture_bucket_paths where n=8);
update fixture_bucket_paths f set old_event=to_jsonb(evt)from events evt where evt.id=f.e;
do $test$
declare f record;r jsonb;
begin
 for f in select *from fixture_bucket_paths loop
  assert(api_private.historical_graph_artwork_scope(f.e)is not null)=(f.n<=2),'Nested source scope failed '||f.n;
 end loop;
 r:=reconcile_historical_graph_artwork(100,false,(select array_agg(e)from fixture_bucket_paths));
 assert(r->>'source_outcomes_recorded')::int=2,r::text;
 for f in select *from fixture_bucket_paths loop
  assert(select to_jsonb(e)=f.old_event from events e where e.id=f.e),'Nested source canonical fields changed '||f.n||' '||(select jsonb_object_agg(k,jsonb_build_object('before',f.old_event->k,'after',to_jsonb(e)->k))::text from events e cross join lateral jsonb_object_keys(to_jsonb(e))k where e.id=f.e and to_jsonb(e)->k is distinct from f.old_event->k);
 end loop;
end $test$;
