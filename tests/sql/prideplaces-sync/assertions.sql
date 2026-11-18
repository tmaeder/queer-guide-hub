\set ON_ERROR_STOP on
create function public.test_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',message;end if;end$$;
do $$
declare role_name text;
begin
 foreach role_name in array array['anon','authenticated'] loop
   perform public.test_assert(not has_function_privilege(role_name,'public.prideplaces_start_scan(boolean)','execute'),'Untrusted scan start');
   perform public.test_assert(not has_function_privilege(role_name,'public.prideplaces_finish_work(uuid,uuid,bigint,jsonb)','execute'),'Untrusted staging write');
   perform public.test_assert(not has_table_privilege(role_name,'public.prideplaces_scan_work','select'),'Untrusted queue read');
 end loop;
 perform public.test_assert((select count(*)=3 from pg_class where relname in ('prideplaces_scan_runs','prideplaces_scan_work','prideplaces_observations') and relrowsecurity),'Missing RLS');
 perform public.test_assert((select count(*)=0 from public.admin_automations where enabled),'Schedule enabled before deployment verification');
 perform public.test_assert((select schedule='0 3 * * 0' from public.admin_automations where slug='prideplaces_weekly_sync'),'Wrong weekly schedule');
end$$;
set role service_role;
do $$
declare rid uuid; other uuid; claim jsonb; concurrent jsonb; token uuid; idx bigint; wid bigint; result text; progress jsonb;
 n jsonb:='{"sourceId":"https://www.prideplaces.org/us/city/professional-services/lawyer","sourceName":"prideplaces","name":"Example Lawyer","entityType":"venue","metadata":{}}';
 changed jsonb; hash_a text:=repeat('a',64); hash_b text:=repeat('b',64); before_count integer; sid uuid; prior_id uuid;
begin
 rid:=public.prideplaces_start_scan();
 other:=public.prideplaces_start_scan(true);
 perform public.test_assert(rid=other,'Overlapping scan created');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;
 concurrent:=public.prideplaces_claim_scan(rid,8);
 perform public.test_assert(jsonb_array_length(concurrent->'items')=0,'Concurrent worker claimed live lease');
 idx:=(claim->'items'->0->>'id')::bigint;
 perform public.prideplaces_finish_work(rid,token,idx,jsonb_build_object('expected',1,'urls',jsonb_build_array(n->>'sourceId'),'pages','[]'::jsonb));
 -- Retry of the same acknowledgement is an idempotent no-op.
 perform public.prideplaces_finish_work(rid,token,idx,jsonb_build_object('expected',1,'urls',jsonb_build_array(n->>'sourceId'),'pages','[]'::jsonb));
 perform public.prideplaces_scan_progress(rid,token);
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;idx:=(claim->'items'->0->>'id')::bigint;
 perform public.prideplaces_finish_work(rid,token,idx,'{"urls":[],"pages":[]}');
 perform public.prideplaces_scan_progress(rid,token);
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',n,'fact_hash',hash_a));
 perform public.test_assert(result='staged','New complete business did not enter normal gates');
 perform public.test_assert((select ai_validation_status='pending' and dedup_status='pending' and disposition='pending' and review_status='auto' from public.ingestion_staging where pipeline_run_id=rid),'New record bypassed ingestion gates');
 select count(*) into before_count from public.ingestion_staging;
 perform public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',n,'fact_hash',hash_a));
 perform public.test_assert((select count(*)=before_count from public.ingestion_staging),'Acknowledgement replay duplicated staging');
 progress:=public.prideplaces_scan_progress(rid,token);
 perform public.test_assert(progress->>'collection_status'='completed','Complete scan stayed open');
 perform public.test_assert(public.prideplaces_start_scan()=rid,'Parent dispatch rescanned completed weekly period');

 -- Lease expiry invalidates old workers. Changed source facts create a fresh
 -- revision with no inherited AI approval; the old approved data remains intact.
 select id into prior_id from public.ingestion_staging limit 1;
 update public.ingestion_staging set ai_validation_status='approved',disposition='committed',target_record_id=gen_random_uuid(),target_table='organizations' where id=prior_id;
 rid:=public.prideplaces_start_scan(true);
 delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=1 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'business',n->>'sourceId');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 update public.prideplaces_scan_runs set lease_until=now()-interval '1 second' where id=rid;
 update public.prideplaces_scan_work set retry_at=now() where id=wid;
 concurrent:=public.prideplaces_claim_scan(rid,1);
 begin
   perform public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',n,'fact_hash',hash_a));
   raise exception 'Stale worker accepted';
 exception when others then if sqlerrm='Stale worker accepted' then raise;end if;end;
 token:=(concurrent->>'lease')::uuid;
 changed:=jsonb_set(n,'{name}','"Changed Lawyer"');
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',changed,'fact_hash',hash_b));
 perform public.test_assert(result='review','Changed source bypassed conflict review');
 perform public.test_assert((select ai_validation_status='needs_review' and dedup_status='pending' and review_status='pending_review' and target_table='organizations' from public.ingestion_staging where pipeline_run_id=rid),'Fresh gates or organizer mapping lost');
 perform public.test_assert((select ai_validation_status='approved' and disposition='committed' and normalized_data->>'name'='Example Lawyer' from public.ingestion_staging where id=prior_id),'Historical committed payload overwritten');
 perform public.prideplaces_scan_progress(rid,token);

 -- Unchanged next-week observations do not create another review item.
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=1 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'business',n->>'sourceId');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',changed,'fact_hash',hash_b));
 perform public.test_assert(result='unchanged','Unchanged source created duplicate work');
 perform public.prideplaces_scan_progress(rid,token);

 -- A -> B -> A is still a new observation, with the same permanent source ID.
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=1 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'business',n->>'sourceId');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',n,'fact_hash',hash_a));
 perform public.test_assert(result='review','Source reversion silently suppressed');
 perform public.prideplaces_scan_progress(rid,token);

 -- Failed index pages / mismatched totals can never be a successful full scan.
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=2 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url,status,attempts) values(rid,'business_index','https://www.prideplaces.org/search_results','pending',3);
 perform public.prideplaces_claim_scan(rid,1);
 progress:=public.prideplaces_scan_progress(rid);
 perform public.test_assert(progress->>'collection_status'='failed','Partial scan reported success');
 perform public.test_assert((select status='failed' and items_failed=1 from public.pipeline_runs where id=rid),'Backend run missed source failure');
end$$;
reset role;
set role service_role;
do $$
declare rid uuid; claim jsonb; token uuid; wid bigint; prior_id uuid; result text; progress jsonb; i integer;
 n jsonb:='{"sourceId":"https://www.prideplaces.org/pro/20251113234406","sourceName":"prideplaces","name":"Historical profile","metadata":{}}';
 event_json jsonb:='{"sourceId":"https://www.prideplaces.org/events/weekly:2026-11-25","sourceName":"prideplaces","name":"Weekly event","metadata":{"url":"https://www.prideplaces.org/events/weekly","source_next_date":"2026-11-25"}}';
begin
 -- Legacy import adoption can seed the cache without reopening unchanged data.
 insert into public.ingestion_staging(source_type,source_name,source_entity_id,target_table,raw_data,normalized_data,ai_validation_status,disposition)
 values('prideplaces','prideplaces',n->>'sourceId','venues','{}',n,'needs_review','pending') returning id into prior_id;
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=1 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'business',n->>'sourceId');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',n,'fact_hash',repeat('d',64),'baseline_id',prior_id,'baseline_hash',repeat('d',64)));
 perform public.test_assert(result='unchanged','Legacy baseline created duplicate review');
 perform public.prideplaces_scan_progress(rid,token);

 -- A new date is the same known series candidate, not an auto-published clone.
 insert into public.ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,raw_data,normalized_data,ai_validation_status,disposition,target_record_id)
 values('prideplaces','prideplaces','https://www.prideplaces.org/events/weekly:2026-11-18','event','events','{}',
 '{"metadata":{"url":"https://www.prideplaces.org/events/weekly"}}','approved','committed',gen_random_uuid());
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=0 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'event','https://www.prideplaces.org/events/weekly');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',event_json,'fact_hash',repeat('e',64)));
 perform public.test_assert(result='review','Recurring series duplicated without review');
 perform public.test_assert((select source_entity_id=event_json->>'sourceId' and dedup_status='pending' and dedup_details->>'existing_entity_id' is not null from public.ingestion_staging where pipeline_run_id=rid),'Occurrence identity or conflict evidence missing');
 perform public.prideplaces_scan_progress(rid,token);

 -- An unpublished date is a Review record keyed by its listing URL, never a
 -- fabricated date occurrence that could be published by the normal commit gate.
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=0 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'event','https://www.prideplaces.org/events/unpublished');
 claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
 result:=public.prideplaces_finish_work(rid,token,wid,jsonb_build_object('normalized',
   '{"sourceId":"https://www.prideplaces.org/events/unpublished","sourceName":"prideplaces","name":"Unpublished date","metadata":{"date_unknown":true,"requires_review":true}}'::jsonb,
   'fact_hash',repeat('f',64)));
 perform public.test_assert(result='review','Unknown event date did not enter Review');
 perform public.prideplaces_scan_progress(rid,token);

 -- A source error is retried three times with durable accounting, then fails.
 rid:=public.prideplaces_start_scan(true);delete from public.prideplaces_scan_work where run_id=rid;
 update public.prideplaces_scan_runs set expected_businesses=1 where id=rid;
 insert into public.prideplaces_scan_work(run_id,kind,url) values(rid,'business',n->>'sourceId');
 for i in 1..3 loop
   claim:=public.prideplaces_claim_scan(rid,1);token:=(claim->>'lease')::uuid;wid:=(claim->'items'->0->>'id')::bigint;
   perform public.prideplaces_finish_work(rid,token,wid,'{"error":"Source HTTP 503"}');
   progress:=public.prideplaces_scan_progress(rid,token);
   if i<3 then perform public.test_assert(progress->>'collection_status'='running','Retry prematurely ended scan');end if;
   update public.prideplaces_scan_work set retry_at=now() where run_id=rid;
 end loop;
 perform public.test_assert(progress->>'collection_status'='failed','Exhausted retries did not fail coverage');
 perform public.test_assert((select attempts=3 and status='failed' from public.prideplaces_scan_work where run_id=rid),'Retry accounting incorrect');
 perform public.test_assert(progress->'source_errors'->0->>'error'='Source HTTP 503','Backend monitoring lost the source error');
 -- Continuations enforce the run deadline themselves, even without a new start.
 rid:=public.prideplaces_start_scan(true);
 update public.prideplaces_scan_runs set created_at=now()-interval '7 hours' where id=rid;
 claim:=public.prideplaces_claim_scan(rid,4);
 perform public.test_assert(claim->>'status'='failed' and jsonb_array_length(claim->'items')=0,'Expired run received another worker lease');
 progress:=public.prideplaces_scan_progress(rid);
 perform public.test_assert(progress->>'complete'='false' and progress->>'collection_status'='failed','Expired scan reported complete coverage');
 perform public.test_assert((select status='failed' and error_message like '%six hours%' from public.pipeline_runs where id=rid),'Pipeline did not retain the scan deadline failure');
end$$;
reset role;
