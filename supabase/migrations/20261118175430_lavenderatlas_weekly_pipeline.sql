-- Source UUIDs are the identity contract of the original 4,915-row import.
CREATE UNIQUE INDEX IF NOT EXISTS lavenderatlas_staging_source_uuid
  ON public.ingestion_staging (source_name, source_entity_id)
  WHERE source_name = 'lavenderatlas';

CREATE OR REPLACE FUNCTION public.lavenderatlas_source_fingerprint(p_raw jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT encode(extensions.digest(((p_raw - '_city' - '_source' - '_kind') ||
   jsonb_build_object('_city_identity', jsonb_build_object(
     'name',p_raw->'_city'->'name','country_code',p_raw->'_city'->'country_code',
     'slug',p_raw->'_city'->'slug')))::text,'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION public.stage_lavenderatlas_batch(p_run uuid, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r jsonb; s public.ingestion_staging%rowtype; sid uuid; fingerprint text;
 inserted integer:=0; refreshed integer:=0; unchanged integer:=0; proposed integer:=0; adopted integer:=0;
 protected boolean; identity_changed boolean; queue_id uuid;
BEGIN
 IF coalesce(jsonb_typeof(p_rows),'null')<>'array' OR jsonb_array_length(p_rows)>100 THEN RAISE EXCEPTION 'Expected at most 100 source records'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pipeline_runs WHERE id=p_run AND pipeline_name='lavenderatlas-weekly-sync' AND status='running') THEN RAISE EXCEPTION 'Active Lavender Atlas pipeline run required'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF r->>'table' NOT IN ('venues','events') OR r->'normalized'->>'sourceName'<>'lavenderatlas'
     OR coalesce(r->'normalized'->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN RAISE EXCEPTION 'Invalid Lavender Atlas staging identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lavenderatlas:'||(r->'normalized'->>'sourceId'),0));
  SELECT * INTO s FROM public.ingestion_staging WHERE source_name='lavenderatlas'
    AND source_entity_id=r->'normalized'->>'sourceId' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  fingerprint:=public.lavenderatlas_source_fingerprint(r->'raw');
  -- Observation is distinct from accepting an upstream change.
  UPDATE public.venue_sources SET last_seen_at=now() WHERE source_slug='lavenderatlas' AND source_entity_id=r->'normalized'->>'sourceId';
  UPDATE public.event_sources SET last_seen_at=now() WHERE source_slug='lavenderatlas' AND source_entity_id=r->'normalized'->>'sourceId';
  IF s.id IS NOT NULL AND public.lavenderatlas_source_fingerprint(s.raw_data)=fingerprint THEN
   -- Recover pending work from an interrupted previous crawl without reopening reviews.
   IF s.disposition='pending' AND s.review_status='auto' AND s.pipeline_run_id IS DISTINCT FROM p_run THEN
    UPDATE public.ingestion_staging SET pipeline_run_id=p_run,node_id='source',updated_at=now() WHERE id=s.id;
    adopted:=adopted+1;
   ELSE unchanged:=unchanged+1; END IF;
   CONTINUE;
  END IF;
  IF s.id IS NOT NULL THEN
   protected:=s.reviewed_at IS NOT NULL OR s.ai_validation_result ? 'manual_review'
     OR s.normalized_data->'metadata' ? 'review_resolution';
   identity_changed:=s.target_table<>r->>'table' OR EXISTS (
     SELECT 1 FROM (VALUES
       (s.normalized_data->>'name',r->'normalized'->>'name'),
       (s.normalized_data->'location'->>'country',r->'normalized'->'location'->>'country'),
       (s.normalized_data->'location'->>'city',r->'normalized'->'location'->>'city'),
       (s.normalized_data->'location'->>'address',r->'normalized'->'location'->>'address'),
       (s.normalized_data->'contacts'->>'phone',r->'normalized'->'contacts'->>'phone'),
       (s.normalized_data->'contacts'->>'website',r->'normalized'->'contacts'->>'website'),
       (s.normalized_data->>'start_date',r->'normalized'->>'start_date'),
       (s.normalized_data->>'end_date',r->'normalized'->>'end_date')
     ) facts(old_value,new_value)
     WHERE nullif(btrim(old_value),'') IS NOT NULL AND old_value IS DISTINCT FROM new_value
   );
   IF protected OR identity_changed THEN
    IF s.dedup_details->'lavenderatlas_source_update'->>'fingerprint' IS DISTINCT FROM fingerprint THEN
     UPDATE public.ingestion_staging SET dedup_details=coalesce(dedup_details,'{}'::jsonb)||
       jsonb_build_object('lavenderatlas_source_update',jsonb_build_object('fingerprint',fingerprint,
         'raw_data',r->'raw','normalized_data',r->'normalized','observed_at',now(),'pipeline_run_id',p_run)),updated_at=now() WHERE id=s.id;
     SELECT id INTO queue_id FROM public.review_queue WHERE entity_type='ingestion_staging'
       AND entity_id=s.id AND review_type='validate_flag' AND status='pending' ORDER BY created_at DESC LIMIT 1;
     IF queue_id IS NULL THEN
      INSERT INTO public.review_queue(entity_type,entity_id,review_type,status,details)
      VALUES('ingestion_staging',s.id,'validate_flag','pending',jsonb_build_object('reason','lavenderatlas_source_update',
        'target_table',s.target_table,'source_url',r->'normalized'->'metadata'->>'url','fingerprint',fingerprint,
        'proposed_normalized_data',r->'normalized','preserved_manual_decision',protected));
     ELSE
      UPDATE public.review_queue SET details=coalesce(details,'{}'::jsonb)||jsonb_build_object('source_update',r,
        'source_update_fingerprint',fingerprint,'preserved_manual_decision',protected) WHERE id=queue_id;
     END IF;
     INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
       VALUES(s.id,'review','pending_review','lavenderatlas-weekly-sync',jsonb_build_object('reason','source changed; preserve review/identity',
         'fingerprint',fingerprint,'pipeline_run_id',p_run,'source_url',r->'normalized'->'metadata'->>'url'));
     proposed:=proposed+1;
    ELSE unchanged:=unchanged+1; END IF;
    CONTINUE;
   END IF;
   INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
    VALUES(s.id,'source','pending','lavenderatlas-weekly-sync',jsonb_build_object('before_raw',s.raw_data,
      'before_normalized',s.normalized_data,'before_disposition',s.disposition,'source_fingerprint',fingerprint,'pipeline_run_id',p_run));
   UPDATE public.ingestion_staging SET raw_data=r->'raw',normalized_data=r->'normalized',
     payload_hash=encode(extensions.digest((r->'normalized')::text,'sha256'),'hex'),
     pipeline_run_id=p_run,node_id='source',disposition='pending',processed_at=null,error_message=null,
     ai_validation_status=CASE WHEN (r->>'needs_review')::boolean THEN 'needs_review' ELSE 'pending' END,
     ai_validation_result='{}'::jsonb,ai_validated_at=null,ai_confidence_score=null,
     dedup_status='pending',dedup_match_id=null,dedup_match_score=null,
     review_status=CASE WHEN (r->>'needs_review')::boolean THEN 'pending_review' ELSE 'auto' END,
     updated_at=now() WHERE id=s.id RETURNING id INTO sid;
   refreshed:=refreshed+1;
  ELSE
   INSERT INTO public.ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,
    raw_data,normalized_data,payload_hash,pipeline_run_id,node_id,disposition,ai_validation_status,dedup_status,review_status)
   VALUES('lavenderatlas','lavenderatlas',r->'normalized'->>'sourceId',r->'normalized'->>'entityType',r->>'table',
    r->'raw',r->'normalized',encode(extensions.digest((r->'normalized')::text,'sha256'),'hex'),p_run,'source','pending',
    CASE WHEN (r->>'needs_review')::boolean THEN 'needs_review' ELSE 'pending' END,'pending',
    CASE WHEN (r->>'needs_review')::boolean THEN 'pending_review' ELSE 'auto' END) RETURNING id INTO sid;
   inserted:=inserted+1;
  END IF;
  IF (r->>'needs_review')::boolean THEN
   INSERT INTO public.review_queue(entity_type,entity_id,review_type,status,details)
    VALUES('ingestion_staging',sid,'validate_flag','pending',jsonb_build_object('reason','Undated event series or inactive source record',
      'source_url',r->'normalized'->'metadata'->>'url','target_table',r->>'table'));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('inserted',inserted,'refreshed',refreshed,'unchanged',unchanged,'proposed',proposed,'adopted',adopted);
END $$;

-- Item commit functions are reused, but the selector is strictly run/source scoped.
CREATE OR REPLACE FUNCTION public.commit_lavenderatlas_batch(p_run uuid,p_target text,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s record; result record; succeeded integer:=0; failed integer:=0;
BEGIN
 IF p_target NOT IN ('venues','events') OR p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION 'Invalid scoped commit request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pipeline_runs WHERE id=p_run AND pipeline_name='lavenderatlas-weekly-sync' AND status='running') THEN RAISE EXCEPTION 'Active Lavender Atlas run required'; END IF;
 FOR s IN SELECT id FROM public.ingestion_staging WHERE source_name='lavenderatlas' AND pipeline_run_id=p_run
  AND target_table=p_target AND disposition='pending' AND ai_validation_status='approved'
  AND dedup_status IN ('unique','duplicate','merge_candidate') AND review_status IN ('auto','approved')
  ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   IF p_target='venues' THEN SELECT * INTO result FROM public.commit_venue_staging_item(s.id,'lavenderatlas-weekly-sync');
   ELSE SELECT * INTO result FROM public.commit_event_staging_item(s.id,'lavenderatlas-weekly-sync'); END IF;
   succeeded:=succeeded+1;
  EXCEPTION WHEN OTHERS THEN
   failed:=failed+1;
   INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
    VALUES(s.id,'commit','error','lavenderatlas-weekly-sync',jsonb_build_object('error',SQLERRM,'pipeline_run_id',p_run));
  END;
 END LOOP;
 RETURN jsonb_build_object('items_processed',succeeded,'items_failed',failed);
END $$;

-- A continuation and its next queue message are committed together. The revision
-- check rejects late/duplicate responses; no downstream node advances early.
CREATE OR REPLACE FUNCTION public.checkpoint_resumable_pipeline_node(
 p_run uuid,p_node text,p_expected_revision integer,p_cursor jsonb,p_has_more boolean,
 p_items integer DEFAULT 0,p_error text DEFAULT NULL,p_retries integer DEFAULT 0,p_delay integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.pipeline_runs%rowtype; d public.pipeline_definitions%rowtype; state jsonb;
 nodes jsonb; edges jsonb; edge jsonb; next_node text; all_done boolean;
BEGIN
 SELECT * INTO r FROM public.pipeline_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.status<>'running' THEN RETURN false; END IF;
 SELECT * INTO d FROM public.pipeline_definitions WHERE id=r.pipeline_id;
 nodes:=coalesce(r.pipeline_snapshot->'nodes',d.nodes); edges:=coalesce(r.pipeline_snapshot->'edges',d.edges);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(nodes)n WHERE n->>'id'=p_node AND n->'data'->'config'->>'resumable'='true')
  THEN RAISE EXCEPTION 'Node does not support continuations'; END IF;
 state:=coalesce(r.node_states->p_node,'{}'::jsonb);
 IF coalesce((state->>'continuation_revision')::integer,0)<>p_expected_revision OR state->>'status' IN ('completed','skipped') THEN RETURN false; END IF;
 IF p_items<0 OR (p_has_more AND coalesce(jsonb_typeof(p_cursor),'null')<>'object') OR octet_length(coalesce(p_cursor,'{}'::jsonb)::text)>65536 THEN RAISE EXCEPTION 'Invalid continuation'; END IF;
 state:=state||jsonb_build_object('status',CASE WHEN p_has_more THEN 'pending' ELSE 'completed' END,
   'items_out',coalesce((state->>'items_out')::integer,0)+p_items,'continuation',p_cursor,
   'continuation_revision',p_expected_revision+1,'continuation_retries',p_retries,
   'error',p_error,'heartbeat_at',now());
 IF NOT p_has_more THEN state:=state||jsonb_build_object('completed_at',now()); END IF;
 r.node_states:=jsonb_set(r.node_states,ARRAY[p_node],state);
 UPDATE public.pipeline_runs SET node_states=r.node_states,items_processed=coalesce(items_processed,0)+p_items,
  items_succeeded=coalesce(items_succeeded,0)+p_items,updated_at=now() WHERE id=p_run;
 IF p_has_more THEN
  PERFORM public.pgmq_send(p_queue:='pipeline_steps',p_msg:=jsonb_build_object('workflow','pipeline-executor','action','continue',
   'pipeline_run_id',p_run,'pipeline_id',r.pipeline_id,'pipeline_name',r.pipeline_name,'current_node_id',p_node,
   'current_step',0,'total_steps',jsonb_array_length(nodes),'context',r.context),p_delay:=greatest(1,least(900,p_delay)));
 ELSE
  FOR edge IN SELECT value FROM jsonb_array_elements(edges) WHERE value->>'source'=p_node LOOP
   next_node:=edge->>'target';
   IF r.node_states->next_node->>'status'<>'pending' THEN CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(edges)e WHERE e->>'target'=next_node
      AND coalesce(r.node_states->(e->>'source')->>'status','pending') NOT IN ('completed','skipped')) THEN CONTINUE; END IF;
   PERFORM public.pgmq_send(p_queue:='pipeline_steps',p_msg:=jsonb_build_object('workflow','pipeline-executor','action','continue',
    'pipeline_run_id',p_run,'pipeline_id',r.pipeline_id,'pipeline_name',r.pipeline_name,'current_node_id',next_node,
    'current_step',0,'total_steps',jsonb_array_length(nodes),'context',r.context),p_delay:=1);
  END LOOP;
  SELECT bool_and(coalesce(r.node_states->(n->>'id')->>'status','pending') IN ('completed','skipped')) INTO all_done FROM jsonb_array_elements(nodes)n;
  IF all_done THEN UPDATE public.pipeline_runs SET status='completed',completed_at=now(),
   duration_ms=extract(epoch from(now()-started_at))*1000,updated_at=now() WHERE id=p_run;
   IF r.pipeline_name='lavenderatlas-weekly-sync' AND NOT coalesce((r.context->>'dry_run')::boolean,false) THEN
    UPDATE public.ingestion_sources SET last_success_at=now(),last_error=null,updated_at=now(),
     total_items_fetched=total_items_fetched+coalesce((r.node_states->'source'->'continuation'->'stats'->>'observations')::integer,0),
     total_items_approved=total_items_approved+(SELECT count(*) FROM public.ingestion_staging WHERE pipeline_run_id=p_run AND source_name='lavenderatlas' AND disposition IN ('inserted','updated'))
     WHERE slug='lavenderatlas' AND is_enabled;
   END IF;
  END IF;
 END IF;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.lavenderatlas_source_fingerprint(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.stage_lavenderatlas_batch(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_lavenderatlas_batch(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_resumable_pipeline_node(uuid,text,integer,jsonb,boolean,integer,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lavenderatlas_source_fingerprint(jsonb),public.stage_lavenderatlas_batch(uuid,jsonb),
 public.commit_lavenderatlas_batch(uuid,text,integer),public.checkpoint_resumable_pipeline_node(uuid,text,integer,jsonb,boolean,integer,text,integer,integer) TO service_role;

CREATE INDEX IF NOT EXISTS lavenderatlas_venues_name_trgm ON public.venues USING gin(name_normalized extensions.gin_trgm_ops) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS lavenderatlas_venues_address_trgm ON public.venues USING gin(address_normalized extensions.gin_trgm_ops) WHERE duplicate_of_id IS NULL;

CREATE OR REPLACE FUNCTION public.find_lavenderatlas_venue_candidates(p_item jsonb)
RETURNS jsonb LANGUAGE sql SET search_path = '' AS $$
 WITH input AS MATERIALIZED (
  SELECT public.normalize_name(p_item->>'name') nn,public.normalize_address(p_item->'location'->>'address') an,
   (p_item->'location'->>'lat')::numeric lat,(p_item->'location'->>'lng')::numeric lng,
   p_item->'location'->>'country' country
 ), blocked AS MATERIALIZED (
  SELECT v.id,v.name,v.city,coalesce(c.code,case when v.country ~ '^[A-Z]{2}$' then v.country end) country,
   extensions.similarity(v.name_normalized,i.nn)::numeric ns,
   CASE WHEN i.an IS NOT NULL THEN extensions.similarity(v.address_normalized,i.an)::numeric ELSE 0 END ads,
   CASE WHEN i.lat IS NOT NULL AND i.lng IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    THEN public.haversine_m(i.lat,i.lng,v.latitude,v.longitude) ELSE NULL END distance_m,
   coalesce(v.address_normalized=i.an,false) address_exact
  FROM input i JOIN public.venues v ON (v.name_normalized OPERATOR(extensions.%) i.nn
    OR (i.an IS NOT NULL AND v.address_normalized OPERATOR(extensions.%) i.an))
  LEFT JOIN public.countries c ON c.id=v.country_id
  WHERE v.duplicate_of_id IS NULL AND (coalesce(c.code,case when v.country ~ '^[A-Z]{2}$' then v.country end) IS NULL
     OR coalesce(c.code,v.country)=i.country)

 ), selected AS MATERIALIZED (
  (SELECT * FROM blocked ORDER BY ns DESC,distance_m NULLS LAST,id LIMIT 100)
  UNION (SELECT * FROM blocked WHERE ads>=.3 ORDER BY ads DESC,distance_m NULLS LAST,id LIMIT 100)
  UNION (SELECT * FROM blocked WHERE distance_m<1500 ORDER BY distance_m,id LIMIT 100)
 ), signals AS (
  SELECT id entity_id,city,country,'name_proximity'::text match_type,ns score,distance_m FROM selected WHERE ns>=.3 AND (distance_m IS NULL OR distance_m<1500)
  UNION ALL
  SELECT id,city,country,'address_name_proximity',(ns+ads)/2,distance_m
    FROM selected WHERE ns>=.3 AND ads>=.3
 ), best AS (SELECT DISTINCT ON(entity_id) * FROM signals ORDER BY entity_id,score DESC)
 SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM (SELECT * FROM best ORDER BY score DESC,distance_m NULLS LAST,entity_id LIMIT 10)b
$$;

CREATE OR REPLACE FUNCTION public.record_lavenderatlas_dedup(p_run uuid,p_staging uuid,p_verdict jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s public.ingestion_staging%rowtype; decision text:=p_verdict->>'decision'; match_id uuid:=(p_verdict->>'matchId')::uuid;
BEGIN
 SELECT * INTO s FROM public.ingestion_staging WHERE id=p_staging AND source_name='lavenderatlas' AND pipeline_run_id=p_run
  AND ai_validation_status='approved' AND disposition='pending' AND dedup_status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF decision NOT IN ('unique','duplicate','merge_candidate') THEN RAISE EXCEPTION 'Invalid dedup verdict'; END IF;
 IF match_id IS NOT NULL AND ((s.target_table='venues' AND NOT EXISTS(SELECT 1 FROM public.venues WHERE id=match_id AND duplicate_of_id IS NULL))
  OR (s.target_table='events' AND NOT EXISTS(SELECT 1 FROM public.events WHERE id=match_id AND duplicate_of_id IS NULL))) THEN RAISE EXCEPTION 'Dedup target changed during run'; END IF;
 PERFORM public.record_dedup_decision(p_entity_type:=CASE WHEN s.target_table='venues' THEN 'venue' ELSE 'event' END,
  p_staging_id:=s.id,p_pipeline_run_id:=p_run,p_match_id:=match_id,p_match_method:=coalesce(p_verdict->>'matchType','none'),
  p_confidence:=coalesce((p_verdict->>'score')::numeric,0),p_decision:=decision,p_action:=p_verdict->>'action',
  p_rules:=jsonb_build_object('signals',p_verdict->'signals','guards_fired',p_verdict->'guardsFired','mode','lavenderatlas-indexed-shared-engine'),
  p_decided_by:='lavenderatlas-weekly-sync');
 UPDATE public.ingestion_staging SET dedup_status=decision,dedup_match_id=match_id,dedup_match_table=s.target_table,
  dedup_match_score=(p_verdict->>'score')::numeric,dedup_details=coalesce(dedup_details,'{}'::jsonb)||jsonb_build_object('weekly_dedup',p_verdict),
  review_status=CASE WHEN decision='merge_candidate' THEN 'pending_review' ELSE review_status END,
  ai_confidence_score=CASE WHEN decision='merge_candidate' THEN least(coalesce(ai_confidence_score,.5),.5) ELSE ai_confidence_score END,
  updated_at=now() WHERE id=s.id;
 IF decision='merge_candidate' THEN
  INSERT INTO public.review_queue(entity_type,entity_id,review_type,status,details)
   VALUES('ingestion_staging',s.id,'merge_candidate','pending',jsonb_build_object('target_table',s.target_table,'match_id',match_id,'verdict',p_verdict));
 END IF;
 INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
  VALUES(s.id,'deduplicate',decision,'lavenderatlas-weekly-sync',p_verdict);
END $$;

CREATE OR REPLACE FUNCTION public.gate_lavenderatlas_batch(p_run uuid,p_target text,p_limit integer DEFAULT 25)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s record; approved boolean; handled integer:=0;
BEGIN
 FOR s IN SELECT * FROM public.ingestion_staging WHERE source_name='lavenderatlas' AND pipeline_run_id=p_run AND target_table=p_target
   AND disposition='pending' AND ai_validation_status='approved' AND review_status='auto'
   AND dedup_status IN ('unique','duplicate','merge_candidate') ORDER BY created_at LIMIT least(greatest(p_limit,1),25) FOR UPDATE SKIP LOCKED LOOP
  approved:=s.dedup_status IN ('unique','duplicate') AND coalesce(s.ai_confidence_score,0)>=.9;
  UPDATE public.ingestion_staging SET review_status=CASE WHEN approved THEN 'approved' ELSE 'pending_review' END,
   ai_confidence_score=CASE WHEN approved THEN ai_confidence_score ELSE least(coalesce(ai_confidence_score,.5),.5) END,
   updated_at=now() WHERE id=s.id;
  IF NOT approved THEN
   INSERT INTO public.review_queue(entity_type,entity_id,review_type,status,details)
    VALUES('ingestion_staging',s.id,'validate_flag','pending',jsonb_build_object('reason','Weekly sync confidence/review gate','target_table',p_target));
  END IF;
  INSERT INTO public.ingestion_events(staging_id,stage,new_status,actor,payload)
   VALUES(s.id,'review',CASE WHEN approved THEN 'approved' ELSE 'pending_review' END,'lavenderatlas-weekly-sync',jsonb_build_object('pipeline_run_id',p_run));
  handled:=handled+1;
 END LOOP;
 RETURN handled;
END $$;
REVOKE ALL ON FUNCTION public.find_lavenderatlas_venue_candidates(jsonb),public.record_lavenderatlas_dedup(uuid,uuid,jsonb),public.gate_lavenderatlas_batch(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_lavenderatlas_venue_candidates(jsonb),public.record_lavenderatlas_dedup(uuid,uuid,jsonb),public.gate_lavenderatlas_batch(uuid,text,integer) TO service_role;

-- Start is serialized so cron retries and manual requests cannot overlap crawls.
CREATE OR REPLACE FUNCTION public.start_lavenderatlas_pipeline(p_pipeline uuid,p_context jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.pipeline_definitions%rowtype; run_id uuid; states jsonb; ctx jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('lavenderatlas-weekly-sync',0));
 SELECT * INTO d FROM public.pipeline_definitions WHERE id=p_pipeline AND name='lavenderatlas-weekly-sync';
 IF NOT FOUND THEN RAISE EXCEPTION 'Lavender Atlas pipeline required'; END IF;
 ctx:=d.default_context||coalesce(p_context,'{}'::jsonb);
 IF NOT coalesce((ctx->>'dry_run')::boolean,false) AND (NOT d.is_enabled OR NOT EXISTS(SELECT 1 FROM public.ingestion_sources WHERE slug='lavenderatlas' AND is_enabled)) THEN RAISE EXCEPTION 'Lavender Atlas sync disabled'; END IF;
 SELECT id INTO run_id FROM public.pipeline_runs WHERE pipeline_id=p_pipeline AND status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1;
 IF run_id IS NOT NULL THEN RETURN run_id; END IF;
 SELECT jsonb_object_agg(n->>'id','{"status":"pending","items_in":0,"items_out":0}'::jsonb) INTO states FROM jsonb_array_elements(d.nodes)n;
 INSERT INTO public.pipeline_runs(pipeline_id,pipeline_name,status,node_states,context,started_at,triggered_by,pipeline_snapshot,pipeline_version)
 VALUES(d.id,d.name,'running',states,ctx,now(),coalesce(ctx->>'triggered_by','manual'),public.snapshot_pipeline_definition(d.id),d.version) RETURNING id INTO run_id;
 PERFORM public.pgmq_send(p_queue:='pipeline_steps',p_msg:=jsonb_build_object('workflow','pipeline-executor','action','continue','pipeline_run_id',run_id,'pipeline_id',d.id,'pipeline_name',d.name,'current_node_id','source','context',ctx),p_delay:=1);
 IF NOT coalesce((ctx->>'dry_run')::boolean,false) THEN UPDATE public.ingestion_sources SET last_run_at=now(),updated_at=now() WHERE slug='lavenderatlas'; END IF;
 RETURN run_id;
END $$;
REVOKE ALL ON FUNCTION public.start_lavenderatlas_pipeline(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_lavenderatlas_pipeline(uuid,jsonb) TO service_role;

INSERT INTO public.pipeline_node_types(slug,category,display_name,description,edge_function,input_ports,output_ports)
VALUES ('source-lavenderatlas','source','Lavender Atlas','Resumable city directories and dated events; stable source UUID deltas.','source-lavenderatlas','[]','[{"id":"items","type":"any","label":"Staged listings"}]'),
 ('lavenderatlas-process','processor','Lavender Atlas processing','Run-scoped validation, deduplication, review and commit batches.','source-lavenderatlas','[{"id":"items","type":"any","label":"Staged listings"}]','[{"id":"items","type":"any","label":"Processed listings"}]')
ON CONFLICT(slug) DO UPDATE SET edge_function=excluded.edge_function,description=excluded.description,updated_at=now();

INSERT INTO public.ingestion_sources(name,slug,source_type,target_table,edge_function,config,schedule,is_enabled,rate_limit_per_minute,rate_limit_per_day)
VALUES('Lavender Atlas','lavenderatlas','scraper','venues','source-lavenderatlas','{"target_tables":["venues","events"],"pipeline":"lavenderatlas-weekly-sync","preserve_manual_reviews":true}','30 3 * * 1',false,60,2000)
ON CONFLICT(slug) DO UPDATE SET edge_function=excluded.edge_function,config=excluded.config,schedule=excluded.schedule,updated_at=now();

INSERT INTO public.pipeline_definitions(name,display_name,description,nodes,edges,default_context,max_concurrency,timeout_seconds,schedule,is_enabled) VALUES('lavenderatlas-weekly-sync','Lavender Atlas weekly sync','City batches, source deltas, validation, deduplication, review gates and run-scoped commits.','[{"id": "source", "type": "source-lavenderatlas", "position": {"x": 0, "y": 0}, "data": {"label": "Fetch Lavender Atlas", "config": {"action": "fetch", "resumable": true, "timeout_seconds": 90, "page_batch": 4}}}, {"id": "venues-validate", "type": "lavenderatlas-process", "position": {"x": 260, "y": 0}, "data": {"label": "Validate venues", "config": {"action": "validate", "target_table": "venues", "batch_size": 25, "resumable": true, "timeout_seconds": 90}}}, {"id": "venues-deduplicate", "type": "lavenderatlas-process", "position": {"x": 520, "y": 0}, "data": {"label": "Deduplicate venues", "config": {"action": "deduplicate", "target_table": "venues", "batch_size": 10, "resumable": true, "timeout_seconds": 90}}}, {"id": "venues-review", "type": "lavenderatlas-process", "position": {"x": 780, "y": 0}, "data": {"label": "Review venues", "config": {"action": "review", "target_table": "venues", "batch_size": 25, "resumable": true, "timeout_seconds": 90}}}, {"id": "venues-commit", "type": "lavenderatlas-process", "position": {"x": 1040, "y": 0}, "data": {"label": "Commit venues", "config": {"action": "commit", "target_table": "venues", "batch_size": 10, "resumable": true, "timeout_seconds": 90}}}, {"id": "events-validate", "type": "lavenderatlas-process", "position": {"x": 1300, "y": 0}, "data": {"label": "Validate events", "config": {"action": "validate", "target_table": "events", "batch_size": 25, "resumable": true, "timeout_seconds": 90}}}, {"id": "events-deduplicate", "type": "lavenderatlas-process", "position": {"x": 1560, "y": 0}, "data": {"label": "Deduplicate events", "config": {"action": "deduplicate", "target_table": "events", "batch_size": 10, "resumable": true, "timeout_seconds": 90}}}, {"id": "events-review", "type": "lavenderatlas-process", "position": {"x": 1820, "y": 0}, "data": {"label": "Review events", "config": {"action": "review", "target_table": "events", "batch_size": 25, "resumable": true, "timeout_seconds": 90}}}, {"id": "events-commit", "type": "lavenderatlas-process", "position": {"x": 2080, "y": 0}, "data": {"label": "Commit events", "config": {"action": "commit", "target_table": "events", "batch_size": 10, "resumable": true, "timeout_seconds": 90}}}]'::jsonb,'[{"id": "e1", "source": "source", "target": "venues-validate"}, {"id": "e2", "source": "venues-validate", "target": "venues-deduplicate"}, {"id": "e3", "source": "venues-deduplicate", "target": "venues-review"}, {"id": "e4", "source": "venues-review", "target": "venues-commit"}, {"id": "e5", "source": "venues-commit", "target": "events-validate"}, {"id": "e6", "source": "events-validate", "target": "events-deduplicate"}, {"id": "e7", "source": "events-deduplicate", "target": "events-review"}, {"id": "e8", "source": "events-review", "target": "events-commit"}]'::jsonb,'{"source_name":"lavenderatlas"}',1,86400,'30 3 * * 1',false) ON CONFLICT(name) DO UPDATE SET nodes=excluded.nodes,edges=excluded.edges,default_context=excluded.default_context,timeout_seconds=excluded.timeout_seconds,schedule=excluded.schedule,updated_at=now();

-- Initially disabled until the deployed parser, continuation and live pilot pass.
INSERT INTO public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
VALUES('lavenderatlas_weekly_sync','Weekly Lavender Atlas sync','Monday 03:30 UTC. Starts the resumable Lavender Atlas backend pipeline. Disable this automation or the source registry to stop syncing.','system',false,'{"type":"schedule"}','[]',
 jsonb_build_object('type','cron','jobname','lavenderatlas-weekly-sync','command',$cron$
 SELECT net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-executor',
 headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
 body:='{"action":"start","pipeline_name":"lavenderatlas-weekly-sync","triggered_by":"cron"}'::jsonb,timeout_milliseconds:=10000);
 $cron$),'30 3 * * 1')
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,action=excluded.action,schedule=excluded.schedule;
