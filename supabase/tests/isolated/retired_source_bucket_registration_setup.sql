insert into fixture_bucket select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null from generate_series(26,31)n;
insert into events(id,title,external_id,description,start_date,end_date,status,images,field_provenance)
 select e,'Bucket archive '||n,(700000+n)::text,repeat('Attributable original source description. ',4),
 now()-interval '90 days',now()-interval '90 days'+interval '1 hour','completed','{}','{"description":{"human_reviewed":true}}'
 from fixture_bucket where n>=26;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select f.s,e.id,'gaycities',e.external_id,'https://london.gaycities.com/events/'||e.external_id||'-event',repeat('c',64),
 jsonb_build_object('raw',jsonb_build_object('url','https://london.gaycities.com/events/'||e.external_id||'-event',
 'fromWayback',true,'jsonLd',jsonb_build_object('_legacyTemplate',true,'name',e.title,'startDate',to_char(e.start_date,'YYYY-MM-DD"T"HH24:MI:SS'),
 'image',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_'||f.n||'.jpg'))),
 'normalized',jsonb_build_object('images',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_'||f.n||'.jpg'),
 'metadata',jsonb_build_object('from_wayback',true)))from fixture_bucket f join events e on e.id=f.e where f.n>=26;
insert into event_quality_issues(id,event_id,dimension,issue_code,evidence,evidence_hash,detector)
 select i,e,'media','IMAGE_MISSING','{"image_count":0}',repeat('e',32),'event-quality-scan'from fixture_bucket where n>=26;
insert into event_quality_current(event_id,open_issue_codes,assessed_at,input_updated_at)
 select e.id,array['IMAGE_MISSING'],now()-interval '1 hour',e.updated_at from fixture_bucket f join events e on e.id=f.e where f.n>=26;

update events set field_provenance=field_provenance||'{"images":{"human_reviewed":true}}'where id=(select e from fixture_bucket where n=31);
select set_config('matching.retired_bucket_proofs',(
 select jsonb_agg(jsonb_build_object('event_id',evt.id,'source_id',src.id,'source_url',src.source_url,'title',evt.title,
 'expected_updated_at',evt.updated_at,'payload_hash',case when pick.n=29 then repeat('a',64)else src.payload_hash end,
 'image_url',src.payload#>>'{raw,jsonLd,image,0}','usable_denial',true,'human_reviewed',false,
 'status',403,'mime_type','application/xml','observed_at',case when pick.n=28 then now()-interval '2 hours'else now()end,
 'response_body',body.text,'response_sha256',case when pick.n=27 then repeat('a',64)else encode(extensions.digest(body.text,'sha256'),'hex')end))
 from fixture_bucket pick join events evt on evt.id=pick.e join event_sources src on src.id=pick.s
 cross join lateral(select case when pick.n=30 then '<Error><Code>SlowDown</Code></Error>'else '<Error><Code>AccessDenied</Code></Error>'end text)body
 where pick.n>=26)::text,false);
select set_config('matching.retired_bucket_dry_run','false',false);
