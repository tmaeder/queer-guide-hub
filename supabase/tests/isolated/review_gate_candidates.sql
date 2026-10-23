\set ON_ERROR_STOP on
begin;
do $test$
declare ready uuid:=gen_random_uuid(); rejected uuid:=gen_random_uuid(); unreliable uuid:=gen_random_uuid();
 bad_rejected uuid:=gen_random_uuid(); no_weight uuid:=gen_random_uuid(); initial uuid:=gen_random_uuid();
 legacy uuid:=gen_random_uuid(); run uuid:=gen_random_uuid(); other_run uuid:=gen_random_uuid(); result jsonb;
begin
 insert into source_reliability values('unreliable','news_article',0.2),('null-weight','news_article',null);
 insert into ingestion_staging(id,created_at,entity_type,target_table,source_name,ai_validation_status,review_status,disposition,enriched_data,pipeline_run_id)
 select gen_random_uuid(),now()-interval '1 day','news_article','news_articles','good','approved','pending_review','pending',
  case when i%2=0 then '{"quality_status":"review","auto_publish":false}'::jsonb else '{}'::jsonb end,run
 from generate_series(1,1000) i;
 insert into ingestion_staging values
 (ready,now(),'news_article','news_articles','good','approved','pending_review','pending','{"quality_status":"passed","auto_publish":true}',1,other_run),
 (rejected,now(),'news_article','news_articles','good','approved','pending_review','pending','{"quality_status":"rejected"}',1,other_run),
 (unreliable,now(),'news_article','news_articles','unreliable','approved','pending_review','pending','{"quality_status":"passed","auto_publish":true}',1,other_run),
 (bad_rejected,now(),'news_article','news_articles','unreliable','approved','pending_review','pending','{"quality_status":"rejected"}',1,other_run),
 (no_weight,now(),'news_article','news_articles','null-weight','approved','pending_review','pending','{"quality_status":"passed","auto_publish":true}',1,other_run),
 (initial,now()-interval '2 days','news_article','news_articles','good','approved','auto','pending','{}',1,run),
 (legacy,now(),null,'news_articles','good','approved','pending_review','pending','{}',1,run),
 (gen_random_uuid(),now(),'news_article','news_articles','good','needs_review','pending_review','pending','{"quality_status":"rejected"}',1,other_run),
 (gen_random_uuid(),now(),'news_article','news_articles','good','approved','pending_review','committed','{"quality_status":"rejected"}',1,other_run),
 (gen_random_uuid(),now(),'venue','venues','good','approved','pending_review','pending','{}',1,run);
 result:=pipeline_review_gate_candidates(200,'news_article',null,true,false);
 if jsonb_array_length(result)<>4 then raise exception 'blocked heads or safety filters %',result; end if;
 if exists(select 1 from jsonb_array_elements(result) r where r->>'id' not in (ready::text,rejected::text,bad_rejected::text,no_weight::text)) then raise exception 'unexpected candidates'; end if;
 if exists(select 1 from jsonb_array_elements(result) r where r ? 'raw_data') then raise exception 'unnecessary source payload'; end if;
 result:=pipeline_review_gate_candidates(200,'news_article',null,true,true);
 if jsonb_array_length(result)<>2 or exists(select 1 from jsonb_array_elements(result) r where r->'enriched_data'->>'quality_status'<>'rejected') then raise exception 'forced review bypass'; end if;
 result:=pipeline_review_gate_candidates(200,'news_article',run,false,false);
 if jsonb_array_length(result)<>1 or result#>>'{0,id}'<>initial::text then raise exception 'run scoping'; end if;
 result:=pipeline_review_gate_candidates(200,'news_article',run,true,false);
 if jsonb_array_length(result)<>4 then raise exception 'sweep incorrectly run-scoped'; end if;
 result:=pipeline_review_gate_candidates(1,'news_article',null,false,false);
 if jsonb_array_length(result)<>1 or result#>>'{0,id}'=initial::text then raise exception 'new initial work hid ready verdicts'; end if;
 result:=pipeline_review_gate_candidates(200,null,null,true,false);
 if jsonb_array_length(result)<>5 or exists(select 1 from jsonb_array_elements(result) r where r->>'id'=legacy::text) then raise exception 'legacy news/non-news routing'; end if;
 if pipeline_review_gate_candidates(0,'news_article',null,true,false)<>'[]'::jsonb then raise exception 'zero batch'; end if;
 update source_reliability set weight=0.5 where source_slug='unreliable';
 if jsonb_array_length(pipeline_review_gate_candidates(200,'news_article',null,true,false))<>5 then raise exception 'reliability update not reflected'; end if;
 if has_function_privilege('anon','pipeline_review_gate_candidates(integer,text,uuid,boolean,boolean)','EXECUTE')
  or has_function_privilege('authenticated','pipeline_review_gate_candidates(integer,text,uuid,boolean,boolean)','EXECUTE')
  or not has_function_privilege('service_role','pipeline_review_gate_candidates(integer,text,uuid,boolean,boolean)','EXECUTE') then raise exception 'unsafe grants'; end if;
 raise notice 'actionable review gate fixtures passed';
end $test$;
rollback;
