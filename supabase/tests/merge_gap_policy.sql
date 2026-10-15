\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',true);
INSERT INTO user_roles VALUES(auth.uid(),'admin');
DO $$
DECLARE keep uuid := gen_random_uuid(); donor uuid := gen_random_uuid(); child uuid:=gen_random_uuid(); result jsonb; a uuid;
BEGIN
 ASSERT public.merge_gap_fill('{"a":false,"b":0,"c":"  ","d":[],"e":{"en":"Hi"}}',
   '{"a":true,"b":2,"c":"filled","d":["x"],"e":{"en":"Other","de":"Hallo"},"empty":null}') =
   '{"a":false,"b":0,"c":"filled","d":["x"],"e":{"en":"Hi","de":"Hallo"}}'::jsonb, 'shared gap semantics';
 ASSERT public.merge_gap_fill('{"list":[1]}','{"list":[2]}')='{"list":[1]}'::jsonb, 'nonempty arrays stay atomic';
 ASSERT public.merge_gap_fill('{}','{"__proto__":{"polluted":true}}')='{}'::jsonb, 'unsafe keys ignored';
 INSERT INTO venues(id,name,slug,description,website,latitude,longitude,social_links) VALUES
 (keep,'Venue','survivor','  ','https://curated.example',NULL,NULL,'{"instagram":"https://instagram.com/curated","facebook":""}'),
 (donor,'Venue','donor','Recovered','https://donor.example',47,8,'{"instagram":"https://instagram.com/other","facebook":"https://facebook.com/venue"}');
 INSERT INTO events(id,venue_id) VALUES(child,donor);
 result:=public.preview_merge_gap_fill('venue',keep,donor);
 ASSERT result#>>'{patch,description}'='Recovered','preview reports patch';
 ASSERT (SELECT description FROM venues WHERE id=keep)='  ','preview never writes';
 result:=public._venue_merge_core(keep,donor,auth.uid()); a:=(result->>'audit_id')::uuid;
 ASSERT (SELECT description FROM venues WHERE id=keep)='Recovered','merge fills blanks';
 ASSERT (SELECT website FROM venues WHERE id=keep)='https://curated.example','merge preserves existing';
 ASSERT (SELECT latitude=47 AND longitude=8 FROM venues WHERE id=keep),'coordinate pair filled';
 ASSERT (SELECT social_links->>'instagram' FROM venues WHERE id=keep)='https://instagram.com/curated','nested existing retained';
 ASSERT (SELECT social_links->>'facebook' FROM venues WHERE id=keep)='https://facebook.com/venue','nested blank filled';
 ASSERT (SELECT venue_id FROM events WHERE id=child)=keep,'relationships still move';
 ASSERT (SELECT details#>>'{field_transfer,donor_id}' FROM venue_merge_audit WHERE id=a)=donor::text,'donor audited';
 ASSERT (SELECT details#>>'{field_transfer,before,description}' FROM venue_merge_audit WHERE id=a)='  ','before recorded';
 UPDATE venues SET social_links=social_links||'{"mastodon":"https://mastodon.social/@editor"}',description='Editor revision' WHERE id=keep;
 PERFORM public.unmerge_venues(a);
 ASSERT (SELECT description FROM venues WHERE id=keep)='Editor revision','undo preserves later scalar edit';
 ASSERT (SELECT social_links->>'facebook' FROM venues WHERE id=keep)='','undo restores contributed leaf';
 ASSERT (SELECT social_links->>'mastodon' FROM venues WHERE id=keep)='https://mastodon.social/@editor','undo preserves later sibling';
 ASSERT (SELECT latitude IS NULL AND longitude IS NULL FROM venues WHERE id=keep),'undo restores coordinates';
 ASSERT (SELECT duplicate_of_id IS NULL FROM venues WHERE id=donor),'donor restored';
 ASSERT (SELECT venue_id FROM events WHERE id=child)=donor,'relationship undo unchanged';
 -- The legacy signature uses reversible cores, honors explicit source selections,
 -- and records both selected values and automatic supplements in the same audit.
 result:=public.merge_entities('venues',keep,donor,'{"website":"https://donor.example"}');
 a:=(result->>'audit_id')::uuid;
 ASSERT (SELECT count(*) FROM venues WHERE id=donor)=1,'legacy path retains donor';
 ASSERT (SELECT website FROM venues WHERE id=keep)='https://donor.example','explicit selection honored';
 PERFORM public.unmerge_venues(a);
 ASSERT (SELECT website FROM venues WHERE id=keep)='https://curated.example','manual selection reversible';
 BEGIN
   PERFORM public.merge_entities('venues',keep,donor,'{"is_featured":true}');
   RAISE EXCEPTION 'protected field accepted';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='protected field accepted' THEN RAISE; END IF;
 END;
 ASSERT (SELECT duplicate_of_id IS NULL FROM venues WHERE id=donor),'rejected selection atomic';
 -- Existing partial pairs must never borrow a different donor's other half.
 UPDATE venues SET latitude=46,longitude=NULL,description=NULL WHERE id=keep;
 result:=public._venue_merge_core(keep,donor,auth.uid()); a:=(result->>'audit_id')::uuid;
 ASSERT (SELECT latitude=46 AND longitude IS NULL FROM venues WHERE id=keep),'partial pair not spliced';
 PERFORM public.unmerge_venues(a);
 -- Incoming commit uses the same gap semantics and preserves existing content.
 UPDATE venues SET description=' ',hours='{"mon":"9-17"}',latitude=NULL,longitude=NULL WHERE id=keep;
 INSERT INTO ingestion_staging(id,normalized_data,enriched_data) VALUES(keep,'{}','{}');
 PERFORM public.commit_venue_staging_item(keep);
 ASSERT (SELECT payload#>>'{field_transfer,before,description}' FROM ingestion_events LIMIT 1)=' ', 'incoming before audited';
 ASSERT (SELECT payload#>>'{field_transfer,after,description}' FROM ingestion_events LIMIT 1)='incoming description', 'incoming after audited';
 ASSERT (SELECT description FROM venues WHERE id=keep)='incoming description','incoming fills blank';
 ASSERT (SELECT hours FROM venues WHERE id=keep)='{"mon":"9-17","tue":"10-18"}'::jsonb,'incoming JSON fills per key';
 ASSERT (SELECT website FROM venues WHERE id=keep)='https://curated.example','incoming keeps existing website';
 ASSERT (SELECT latitude=47 AND longitude=8 FROM venues WHERE id=keep),'incoming pair filled';
 ASSERT public.merge_gap_patch('venue','{"latitude":null,"longitude":null}','{"latitude":91,"longitude":8}')='{}','invalid coords excluded';
 ASSERT public.merge_gap_patch('venue','{"description":null}','{"description":"bad","review_status":"rejected"}')='{}','rejected donor excluded';
 ASSERT public.merge_gap_patch('venue','{"website":null}','{"website":"javascript:alert(1)"}')='{}','invalid website excluded';
 ASSERT public.merge_gap_patch('venue','{"address":null,"country_id":"a"}','{"address":"foreign","country_id":"b"}')='{}','foreign address excluded';
 -- A failure after field transfer rolls back relationship + field writes together.
 BEGIN
   UPDATE venues SET description=NULL WHERE id=keep;
   PERFORM public._venue_merge_core(keep,donor,auth.uid());
   RAISE EXCEPTION 'simulate downstream failure';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
 ASSERT (SELECT duplicate_of_id IS NULL FROM venues WHERE id=donor),'failed merge rolled back';
 -- No anonymous preview access even if called via a privileged database session.
 PERFORM set_config('test.actor','',true);
 BEGIN
   PERFORM public.preview_merge_gap_fill('venue',keep,donor);
   RAISE EXCEPTION 'anonymous preview accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
-- Atomic source combination, provenance retention, stale-read and review gates.
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); canonical uuid:=gen_random_uuid(); expected jsonb;
BEGIN
 INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_match_id,dedup_status,
   normalized_data,enriched_data,updated_at) VALUES
 (a,'venues','pending','approved','auto',canonical,'duplicate','{"description":"A"}','{}',now()),
 (b,'venues','pending','approved','auto',canonical,'duplicate','{"phone":"123"}','{}',now());
 SELECT jsonb_object_agg(id,jsonb_build_object('normalized_data',normalized_data,'enriched_data',enriched_data,'updated_at',updated_at))
 INTO expected FROM ingestion_staging WHERE id IN(a,b);
 PERFORM combine_staging_source_group(ARRAY[a,b],a,'venues',expected,'{"description":"Combined"}',
   '[{"path":"description","action":"fill","sources":["osm","wikidata"],"confidence":0.925}]',false);
 ASSERT (SELECT normalized_data->>'description' FROM ingestion_staging WHERE id=a)='Combined','combined fields persisted';
 ASSERT (SELECT disposition FROM ingestion_staging WHERE id=b)='pending','source evidence never archived';
 ASSERT (SELECT enriched_data#>>'{source_combination,policy}' FROM ingestion_staging WHERE id=b)='1','all contributors keep provenance';
 BEGIN
   PERFORM combine_staging_source_group(ARRAY[a,b],a,'venues',expected,'{}','[]',false);
   RAISE EXCEPTION 'stale source snapshot accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 SELECT jsonb_object_agg(id,jsonb_build_object('normalized_data',normalized_data,'enriched_data',enriched_data,'updated_at',updated_at))
 INTO expected FROM ingestion_staging WHERE id IN(a,b);
 -- The database enforces a review decision even if the caller forgets the flag.
 PERFORM combine_staging_source_group(ARRAY[a,b],a,'venues',expected,'{"description":"Combined"}',
   '[{"path":"phone","action":"review","conflicts":["osm"]}]',false);
 ASSERT (SELECT bool_and(review_status='pending_review') FROM ingestion_staging WHERE id IN(a,b)),'every conflicting contributor gated';
 ASSERT NOT has_function_privilege('anon','public.combine_staging_source_group(uuid[],uuid,text,jsonb,jsonb,jsonb,boolean)','execute'),'anonymous write revoked';
 ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.merge_gap_write(text,uuid,jsonb)'::regprocedure),'write helper cannot bypass RLS';
END $$;
-- Batched loader uses approved recent evidence and never exposes raw payloads.
SELECT set_config('test.jwt','{"role":"service_role"}',true);
DO $$
DECLARE canonical uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); old uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); batch jsonb;
BEGIN
 INSERT INTO venues(id,name,description) VALUES(canonical,'Combined Venue',NULL);
 INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_match_id,dedup_status,
   source_name,normalized_data,enriched_data,updated_at) VALUES
 (a,'venues','pending','approved','auto',canonical,'duplicate','osm','{"description":"From sources"}','{}',now());
 INSERT INTO ingestion_staging(id,target_table,target_record_id,disposition,ai_validation_status,review_status,
   source_name,normalized_data,created_at) VALUES
 (old,'venues',canonical,'updated','approved','auto','wikidata','{"description":"From sources"}',now()-interval '1 day'),
 (gen_random_uuid(),'venues',canonical,'updated','approved','auto','stale','{"description":"Stale"}',now()-interval '91 days'),
 (gen_random_uuid(),'venues',canonical,'updated','approved','rejected','bad','{"description":"Rejected"}',now());
 UPDATE ingestion_staging SET enriched_data='{"consensus_done":true}' WHERE id=a;
 INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_match_id,dedup_status,
   source_name,normalized_data,enriched_data,updated_at) VALUES
 (sibling,'venues','pending','approved','auto',canonical,'duplicate','google','{"social_links":{"facebook":"https://facebook.com/a"}}','{"keep":"evidence"}',now());
 PERFORM archive_venue_consensus_sources(ARRAY[sibling],a,canonical);
 ASSERT (SELECT target_record_id FROM ingestion_staging WHERE id=sibling)=canonical,'archive retains canonical association';
 ASSERT (SELECT enriched_data->>'keep' FROM ingestion_staging WHERE id=sibling)='evidence','archive preserves source metadata';
 batch:=load_source_combination_batch('venues',NULL,100);
 ASSERT jsonb_array_length(batch->'pending')=1,'bounded pending load';
 ASSERT batch#>>ARRAY['canonical',canonical::text,'name'] IS NULL,'canonical identity not exposed for voting';
 ASSERT jsonb_array_length(batch#>ARRAY['history',canonical::text])=2,'only approved recent history';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(batch#>ARRAY['history',canonical::text]) x WHERE x->>'id'=old::text),'historical evidence retained';
END $$;
-- Matched legacy sources fill the canonical row rather than insert a duplicate.
DO $$ DECLARE canonical uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid(); result jsonb;
BEGIN
 INSERT INTO organizations(id,description,website,social) VALUES(canonical,NULL,'https://curated.example','{"facebook":""}');
 INSERT INTO ingestion_staging(id,target_table,disposition,ai_validation_status,review_status,dedup_match_id,dedup_status,
   source_name,normalized_data,enriched_data,updated_at) VALUES
 (source_id,'organizations','pending','approved','auto',canonical,'duplicate','website',
  '{"description":"Recovered organization","website":"https://other.example","social_links":{"facebook":"https://facebook.com/org"}}','{}',now());
 SELECT set_config('test.jwt','{"role":"service_role"}',true) INTO result;
 result:=commit_matched_source_gaps(source_id);
 ASSERT result->>'id'=canonical::text,'matched canonical reused';
 ASSERT (SELECT count(*) FROM organizations WHERE id=canonical)=1,'no duplicate inserted';
 ASSERT (SELECT description FROM organizations WHERE id=canonical)='Recovered organization','legacy gap filled';
 ASSERT (SELECT website FROM organizations WHERE id=canonical)='https://curated.example','curated website preserved';
 ASSERT (SELECT social->>'facebook' FROM organizations WHERE id=canonical)='https://facebook.com/org','source aliases mapped';
 ASSERT (SELECT disposition FROM ingestion_staging WHERE id=source_id)='updated','source checkpoint atomic';
END $$;
ROLLBACK;
