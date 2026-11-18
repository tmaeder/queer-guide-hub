-- Transactional production canary: all changes, including review/source rows,
-- are rolled back. Uses existing official-date protections as regression data.
begin;
do $$
declare rid uuid;tok uuid:=gen_random_uuid();second_claim jsonb;known outxout_sync_entities%rowtype;before_event jsonb;after_event jsonb;proposal jsonb;venue_count bigint;
begin
 if exists(select 1 from outxout_sync_runs where phase in('collect','process')) then raise exception 'run guard checks only when no real scan is active';end if;
 if has_function_privilege('anon','public.outxout_ingest(uuid,jsonb)','execute') then raise exception 'public mutation permission';end if;
 if has_table_privilege('authenticated','public.outxout_sync_work','select') then raise exception 'private checkpoint leaked';end if;
 rid:=outxout_open_run('transaction-test',null,'canary');
 perform outxout_claim(rid,tok);
 second_claim:=outxout_claim(rid,gen_random_uuid());
 if second_claim->>'busy' is distinct from 'true' then raise exception 'lease permits concurrent worker';end if;
 select * into strict known from outxout_sync_entities where source_entity_id='event/newcastle-pride-2027-hub';
 select to_jsonb(e) into before_event from events e where id=known.target_id;
 proposal:=jsonb_set(jsonb_set(known.normalized,'{start_date}','"2027-07-17T11:00:00Z"'),'{title}','"Wrong placeholder date"');
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id',known.source_entity_id,'target_table','events','normalized',proposal,'raw','{}'::jsonb)));
 select to_jsonb(e) into after_event from events e where id=known.target_id;
 if before_event->'start_date' is distinct from after_event->'start_date' or before_event->'title' is distinct from after_event->'title' or before_event->'review_status' is distinct from after_event->'review_status' then raise exception 'official date overwritten';end if;
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id',known.source_entity_id,'target_table','events','normalized',proposal,'raw','{}'::jsonb)));
 if (select count(*) from outxout_sync_changes where run_id=rid and source_entity_id=known.source_entity_id)<>1 then raise exception 'replay duplicated audit';end if;
 select * into strict known from outxout_sync_entities where source_entity_id='venue/thehoxtonwilliamsburgnewyorkcity';
 select count(*) into venue_count from venues;
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id','venue/__outxout_native_alias_test__','target_table','venues','normalized',known.normalized,'raw','{}'::jsonb)));
 if (select target_id from outxout_sync_entities where source_entity_id='venue/__outxout_native_alias_test__') is distinct from known.target_id then raise exception 'native alias lost identity';end if;
 if (select count(*) from venues)<>venue_count then raise exception 'native alias duplicated canonical venue';end if;
 perform outxout_release(rid,tok);
end $$;
rollback;
select 'outxout transactional identity, lease, protected-date and permission checks passed' result;
