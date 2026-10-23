
insert into events(id,images) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,array['https://images.example.test/'||n||'.jpg'] from generate_series(1,8) n;
update events set duplicate_of_id=gen_random_uuid() where id='00000000-0000-0000-0000-000000000002';
update events set images='{}' where id='00000000-0000-0000-0000-000000000003';
update events set images=array['http://localhost/private'] where id='00000000-0000-0000-0000-000000000004';
update events set status='archived' where id='00000000-0000-0000-0000-000000000005';
update events set status='cancelled' where id='00000000-0000-0000-0000-000000000006';
update events set status='rejected' where id='00000000-0000-0000-0000-000000000007';
do $test$
declare ids uuid[];token uuid:=gen_random_uuid();other_token uuid:=gen_random_uuid();n int;b text;a text;
begin
 select array_agg(id order by id),md5(jsonb_agg(to_jsonb(e) order by id)::text) into ids,b from events e;
 assert not has_function_privilege('anon','claim_event_image_quality_rechecks(uuid,uuid[],integer)','execute');
 assert not has_function_privilege('authenticated','claim_event_image_quality_rechecks(uuid,uuid[],integer)','execute');
 assert has_function_privilege('service_role','claim_event_image_quality_rechecks(uuid,uuid[],integer)','execute');
 select count(*) into n from claim_event_image_quality_rechecks(token,ids,0);assert n=0;
 assert not exists(select 1 from event_quality_worker_leases);
 select count(*) into n from claim_event_image_quality_rechecks(token,'{}');assert n=0;
 assert not exists(select 1 from event_quality_worker_leases);
 select count(*) into n from claim_event_image_quality_rechecks(token,ids,1);assert n=1;
 assert (select lease_token from event_quality_worker_leases)=token;
 select count(*) into n from claim_event_image_quality_rechecks(other_token,ids,100);assert n=0,'Competing worker stole live lease';
 update event_quality_worker_leases set lease_until=now()-interval '1 second';
 select count(*) into n from claim_event_image_quality_rechecks(other_token,ids,100);assert n=2;
 assert (select lease_token from event_quality_worker_leases)=other_token;
 update event_quality_worker_leases set lease_until=now()-interval '1 second';
 select count(*) into n from claim_event_image_quality_rechecks(token,array[ids[1],ids[1]],100);assert n=1,'Duplicate input IDs duplicated work';
 begin
  perform * from claim_event_image_quality_rechecks(token,array_fill(ids[1],array[101]),100);
  raise exception 'Oversized input accepted';
 exception when invalid_parameter_value then null;end;
 perform set_config('test.actor',gen_random_uuid()::text,true);
 begin
  perform * from claim_event_image_quality_rechecks(token,ids,100);
  raise exception 'Human actor accepted';
 exception when raise_exception then assert sqlerrm='Automatic rechecks require an internal actor';end;
 select md5(jsonb_agg(to_jsonb(e) order by id)::text) into a from events e;
 assert a=b,'Claim altered event data';
end $test$;
