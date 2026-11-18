-- Exercise real canonical commit functions and new-source aliases without
-- retaining test entities. The transaction also rolls back search/HTTP queues.
begin;
set local statement_timeout='60s';
do $$
declare rid uuid:=gen_random_uuid();native uuid:=gen_random_uuid();n jsonb;eid uuid;result jsonb;
begin
 insert into pipeline_runs(id,pipeline_name,status,context,started_at,completed_at) values(rid,'outxout-transaction-test','completed','{"test":true}',now(),now());
 insert into outxout_sync_runs(id,phase,scope) values(rid,'completed','transaction-test');
 if outxout_source_fields('{"venue_name":"","location":{},"contacts":{}}','events')?'venue_name' then raise exception 'empty field interpreted as deletion';end if;
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object(
 'source_entity_id','venue/__transaction_fixture__','target_table','venues','raw','{}'::jsonb,'normalized',jsonb_build_object(
 'name','Outxout Transaction Fixture Venue','sourceId','venue/__transaction_fixture__','category','bar','description','A rollback-only venue fixture for the ingestion contract.',
 'location',jsonb_build_object('city','Seattle','state','Washington','country','US','address','1 Transaction Test Street','lat',47.61,'lng',-122.33),
 'contacts','{}'::jsonb,'tags','["lgbtq"]'::jsonb,'urls','[]'::jsonb,'metadata',jsonb_build_object('url','https://outxout.com/venue/__transaction_fixture__','source_native_id',gen_random_uuid()::text)
 ))));
 n:=jsonb_build_object('name','Outxout Transaction Fixture Event','title','Outxout Transaction Fixture Event','event_type','other','start_date','2027-01-12T20:00:00Z','end_date','2027-01-12T22:00:00Z','description','A rollback-only event fixture for the ingestion contract.','location',jsonb_build_object('city','Seattle','state','Washington','country','US','address','1 Transaction Test Street','timezone','America/Los_Angeles'),'tags','["lgbtq"]'::jsonb,'urls','[]'::jsonb,'metadata',jsonb_build_object('url','https://outxout.com/event/__transaction_fixture__','source_native_id',native::text,'source_venue_slug','__transaction_fixture__'));
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id','event/__transaction_fixture__','target_table','events','normalized',n,'raw','{}'::jsonb)));
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id','event/__transaction_fixture_alias__','target_table','events','normalized',n,'raw','{}'::jsonb)));
 if (select count(distinct staging_id) from outxout_sync_entities where source_entity_id in('event/__transaction_fixture__','event/__transaction_fixture_alias__'))<>1 then raise exception 'new aliases duplicated staging identity';end if;
 perform outxout_ingest(rid,jsonb_build_array(jsonb_build_object('source_entity_id','organization/__transaction_fixture__','target_table','organizations','raw','{}'::jsonb,'normalized',jsonb_build_object('name','Outxout Transaction Fixture Organisation','description','A rollback-only organisation fixture for the ingestion contract.','location',jsonb_build_object('city','Seattle','state','Washington','country','US'),'contacts','{}'::jsonb,'metadata',jsonb_build_object('url','https://outxout.com/sports/download')))));
 -- Simulate the validated/deduplicated precondition; parse/validator tests and
 -- live preview cover that producer boundary independently.
 update ingestion_staging set ai_validation_status='approved',review_status='auto',dedup_status='unique' where source_name='outxout' and pipeline_run_id=rid;
 result:=outxout_commit_batch(rid,10);
 if (result->>'committed')::int<>3 then raise exception 'commit contract failed: %, %',result,(select jsonb_agg(jsonb_build_object('id',source_entity_id,'error',error_message)) from ingestion_staging where pipeline_run_id=rid);end if;
 if exists(select 1 from outxout_sync_entities where last_seen_run=rid and target_id is null) then raise exception 'canonical identity missing';end if;
 select target_id into eid from outxout_sync_entities where source_entity_id='event/__transaction_fixture__';
 if (select count(distinct event_id) from event_sources where source_slug='outxout' and source_entity_id in('event/__transaction_fixture__','event/__transaction_fixture_alias__'))<>1 then raise exception 'aliases duplicated canonical event';end if;
 if (select count(*) from event_sources where event_id=eid and source_slug='outxout')<>2 then raise exception 'event source alias not preserved';end if;
 if (outxout_commit_batch(rid,10)->>'committed')::int<>0 then raise exception 'replayed commit was not idempotent';end if;
end $$;
rollback;
select 'new venue, event, organisation, native aliases and repeat commit passed; fixtures rolled back' result;
