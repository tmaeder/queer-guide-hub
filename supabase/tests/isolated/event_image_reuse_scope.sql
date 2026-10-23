do $test$
declare target uuid:=md5('event-1')::uuid; proof jsonb; fixture_hash text:=repeat('a',64);
begin
 insert into events(id,images)select md5('event-'||n)::uuid,array['https://images.example/'||n]from generate_series(1,10)n;
 insert into event_image_quality_observations(event_id,image_url,content_hash,probe_status)
  select id,images[1],fixture_hash,'pass'from events;
 proof:=event_image_reuse_assessment(target,'https://images.example/1',fixture_hash);
 assert(proof->>'event_count')::integer=10 and(proof->>'should_flag')::boolean,'Ten unrelated current events must still flag';
 update events set is_recurring=true where id=target;
 proof:=event_image_reuse_assessment(target,'https://images.example/1',fixture_hash);
 assert(proof->>'should_flag')::boolean,'A recurring flag alone must not hide cross-series or generic artwork';
 update events set is_recurring=false,series_key='registered-series'where id=target;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'should_flag')::boolean,'A declared series must not exempt unrelated peers';
 update events set series_key='registered-series';
 proof:=event_image_reuse_assessment(target,'https://images.example/1',fixture_hash);
 assert not(proof->>'should_flag')::boolean and(proof->>'same_recurrence_cluster')::boolean,'A wholly single-series cluster permits reused artwork';
 update events set series_key=null where id=md5('event-10')::uuid;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'should_flag')::boolean,'One unassigned peer must block the exemption';
 update events set series_key='other-series'where id=md5('event-10')::uuid;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'should_flag')::boolean,'One different series must block the exemption';
 update events set series_key=null;
 update events set series_key=null where id=target;
 insert into event_image_quality_observations(event_id,image_url,content_hash,probe_status)
  select target,'https://images.example/obsolete-'||n,fixture_hash,'pass'from generate_series(1,20)n;
 proof:=event_image_reuse_assessment(target,'https://images.example/1',fixture_hash);
 assert(proof->>'event_count')::integer=10,'Multiple observations of one event are not multiple events';
 update events set images=array['https://images.example/replaced']where id=md5('event-10')::uuid;
 proof:=event_image_reuse_assessment(target,'https://images.example/1',fixture_hash);
 assert(proof->>'event_count')::integer=9 and not(proof->>'should_flag')::boolean,'Replaced images must not inflate the current cluster';
 update events set images=array['https://images.example/10'],status='cancelled'where id=md5('event-10')::uuid;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'event_count')::integer=9,'Cancelled events must not inflate a current cluster';
 update events set status='active',duplicate_of_id=target where id=md5('event-10')::uuid;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'event_count')::integer=9,'Merged event copies must not inflate a current cluster';
 update events set duplicate_of_id=null where id=md5('event-10')::uuid;
 update event_image_quality_observations set probe_status='fail'where event_id=md5('event-10')::uuid;
 assert(event_image_reuse_assessment(target,'https://images.example/1',fixture_hash)->>'event_count')::integer=9,'Failed observations cannot corroborate current content reuse';
 proof:=event_image_reuse_assessment(target,'https://images.example/previous-primary',fixture_hash);
 assert not(proof->>'current_image')::boolean,'A changed primary image must stop stale worker findings';
 proof:=event_image_reuse_assessment(md5('missing')::uuid,'https://images.example/1',fixture_hash);
 assert not(proof->>'current_image')::boolean,'A missing event must stop stale worker findings';
 begin perform event_image_reuse_assessment(target,'https://images.example/1','invalid');
  raise exception 'Invalid hash unexpectedly accepted';exception when invalid_parameter_value then null;end;
 assert not has_function_privilege('anon','event_image_reuse_assessment(uuid,text,text)','EXECUTE');
 assert not has_function_privilege('authenticated','event_image_reuse_assessment(uuid,text,text)','EXECUTE');
 assert has_function_privilege('service_role','event_image_reuse_assessment(uuid,text,text)','EXECUTE');
 raise notice 'PASS: 17 current-artwork reuse, stale-observation, recurrence, and permission checks';
end $test$;
