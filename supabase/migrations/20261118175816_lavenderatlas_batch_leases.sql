-- Lease opt-in batches; an expired worker can be recovered without duplicate writes.
CREATE OR REPLACE FUNCTION public.claim_resumable_pipeline_node(p_run uuid,p_node text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.pipeline_runs%rowtype; state jsonb;
BEGIN
 SELECT * INTO r FROM public.pipeline_runs WHERE id=p_run AND pipeline_name='lavenderatlas-weekly-sync' AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RETURN null; END IF;
 state:=r.node_states->p_node;
 IF state IS NULL OR state->>'status' IN ('completed','skipped','failed') OR coalesce((state->>'continuation_revision')::integer,0)<>p_revision
  OR coalesce((state->>'lease_until')::timestamptz,'-infinity')>now() THEN RETURN null; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.pipeline_snapshot->'edges')e WHERE e->>'target'=p_node AND coalesce(r.node_states->(e->>'source')->>'status','pending')<>'completed') THEN RETURN null; END IF;
 state:=state||jsonb_build_object('status','running','started_at',now(),'lease_until',now()+interval '3 minutes');
 UPDATE public.pipeline_runs SET node_states=jsonb_set(node_states,ARRAY[p_node],state),updated_at=now() WHERE id=p_run;
 RETURN state;
END $$;
CREATE OR REPLACE FUNCTION public.recover_lavenderatlas_pipeline()
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; n record; total integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ingestion_sources WHERE slug='lavenderatlas' AND is_enabled) THEN RETURN 0; END IF;
 FOR r IN SELECT * FROM public.pipeline_runs WHERE pipeline_name='lavenderatlas-weekly-sync' AND status='running' AND updated_at<now()-interval '5 minutes' FOR UPDATE SKIP LOCKED LOOP
  FOR n IN SELECT key,value FROM jsonb_each(r.node_states) WHERE value->>'status' IN ('pending','running') LOOP
   IF coalesce((n.value->>'lease_until')::timestamptz,'-infinity')>now() OR coalesce((n.value->>'recovered_at')::timestamptz,'-infinity')>now()-interval '5 minutes' THEN CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.pipeline_snapshot->'edges')e WHERE e->>'target'=n.key AND coalesce(r.node_states->(e->>'source')->>'status','pending')<>'completed') THEN CONTINUE; END IF;
   UPDATE public.pipeline_runs SET node_states=jsonb_set(node_states,ARRAY[n.key],n.value||jsonb_build_object('recovered_at',now())),updated_at=now() WHERE id=r.id;
   PERFORM public.pgmq_send(p_queue:='pipeline_steps',p_msg:=jsonb_build_object('workflow','pipeline-executor','action','continue','pipeline_run_id',r.id,'current_node_id',n.key,'context',r.context),p_delay:=1);
   total:=total+1;
  END LOOP;
 END LOOP;
 UPDATE public.ingestion_sources SET last_error=r.error_message,updated_at=now() FROM (SELECT error_message FROM public.pipeline_runs WHERE pipeline_name='lavenderatlas-weekly-sync' AND status='failed' ORDER BY created_at DESC LIMIT 1)r
 WHERE slug='lavenderatlas' AND last_run_at>coalesce(last_success_at,'-infinity');
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.claim_resumable_pipeline_node(uuid,text,integer),public.recover_lavenderatlas_pipeline() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_resumable_pipeline_node(uuid,text,integer),public.recover_lavenderatlas_pipeline() TO service_role;
INSERT INTO public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
VALUES('lavenderatlas_pipeline_recovery','Recover Lavender Atlas batches','Requeue expired Lavender Atlas batches; source disable switch respected.','system',false,'{"type":"schedule"}','[]',jsonb_build_object('type','cron','jobname','lavenderatlas-pipeline-recovery','command','SELECT public.recover_lavenderatlas_pipeline();'),'*/5 * * * *')
ON CONFLICT(slug) DO UPDATE SET action=excluded.action,schedule=excluded.schedule;

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
   'error',p_error,'heartbeat_at',now(),'lease_until',null);
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

