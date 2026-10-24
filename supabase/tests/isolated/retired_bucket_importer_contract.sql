-- An explicit producer limitation is separate evidence from a native HTTP probe.
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,artwork_exclusion}',
 '{"contract":"gaycities-wayback-retired-bucket-artwork:v1","outcome":"source_unavailable","reason":"retired_source_bucket_excluded","human_reviewed":false,"api_reference":"https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_24.jpg"}')where id=(select s from fixture_bucket where n=24);
do $test$
declare eid uuid:=(select e from fixture_bucket where n=24);r jsonb;
begin
 assert api_private.historical_graph_artwork_scope(eid)->>'importer_exclusion'='true';
 assert api_private.historical_graph_artwork_scope(eid)->'non_image_response'='null'::jsonb;
 r:=reconcile_historical_graph_artwork(1,false,array[eid]);
 assert(r->>'source_outcomes_recorded')::int=1,r::text;
 assert exists(select 1 from event_quality_issues where event_id=eid and status='accepted');
end $test$;
-- Every record must carry the explicit exclusion when there is no HTTP proof.
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select gen_random_uuid(),event_id,source_slug,source_entity_id,source_url,repeat('f',64),payload#-'{normalized,metadata,artwork_exclusion}'
 from event_sources where id=(select s from fixture_bucket where n=24);
do $test$
begin
 assert api_private.historical_graph_artwork_scope((select e from fixture_bucket where n=24))is null;
 assert exists(select 1 from event_quality_issues where id=(select i from fixture_bucket where n=24)and status='open');
end $test$;
delete from event_sources where event_id=(select e from fixture_bucket where n=24)and id<>(select s from fixture_bucket where n=24);
select reconcile_historical_graph_artwork(1,false,array[(select e from fixture_bucket where n=24)]);
insert into event_image_quality_observations(event_id,image_url,probe_status,http_status,mime_type,checked_at)
 select e,'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_24.jpg','pass',200,'image/jpeg',now()from fixture_bucket where n=24;
do $test$
begin
 assert api_private.historical_graph_artwork_scope((select e from fixture_bucket where n=24))is null;
 assert exists(select 1 from event_quality_issues where id=(select i from fixture_bucket where n=24)and status='open');
end $test$;
