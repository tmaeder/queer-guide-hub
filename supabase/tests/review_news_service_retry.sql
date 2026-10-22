create temporary table review_news_retry_test_result(passed boolean,details text);
do $test$
declare ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 v_job uuid; v_base jsonb:='{"quality_status":"review","auto_publish":false,"quality_decision":{"confidence":0.3,"needsManualReview":true,"warnings":["llm:provider unavailable"],"title":"Retry regression source"}}';
 result jsonb;
begin
 begin
  perform pg_advisory_xact_lock(hashtext('review_automatic_resolution'));
  select job_id into v_job from public.ingestion_staging where source_name='rss-news' limit 1;
  if not found then raise exception 'RSS fixture job context missing'; end if;
  insert into public.ingestion_staging(id,job_id,source_type,source_name,target_table,raw_data,normalized_data,
    enriched_data,enrichment_status,review_status,disposition,dedup_status)
  select id,v_job,'rss-news','rss-news','news_articles','{}',
   jsonb_build_object('title','Retry regression source','content','','description',repeat('Available source evidence. ',8)),
   v_base,'enriched','pending_review','pending','unique' from unnest(ids) id;
  update public.ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,warnings}','["Editorial uncertainty"]')
   where id=ids[2];
  update public.ingestion_staging set review_notes='Human note; retain for review' where id=ids[3];
  update public.ingestion_staging set enriched_data=enriched_data||'{"quality_input_version":"normalized-news.2026.10.22.1"}'
   where id=ids[4];
  update public.ingestion_staging set enriched_data=enriched_data||'{"review_auto_retry":{"attempts":2}}' where id=ids[5];
  update public.ingestion_staging set enriched_data=enriched_data||jsonb_build_object('review_auto_retry',
   jsonb_build_object('attempts',1,'last_at',now())) where id=ids[6];
  update public.ingestion_staging set normalized_data='{"title":"No source body"}' where id=ids[7];

  result:=public.run_review_automatic_resolution(200,true);
  if (select enriched_data->>'quality_status' from public.ingestion_staging where id=ids[1])<>'review'
   then raise exception 'Dry run changed service-failure row'; end if;
  result:=public.run_review_automatic_resolution(200,false);
  if (select enriched_data->>'quality_status' from public.ingestion_staging where id=ids[1]) is not null
   then raise exception 'Old service failure was not queued for a fresh attempt: %',result; end if;
  if exists(select 1 from public.ingestion_staging where id=any(ids[2:7]) and enriched_data->>'quality_status' is distinct from 'review')
   then raise exception 'Editorial, touched, current-version, capped, cooling or empty-source row changed'; end if;
  if (select enriched_data#>>'{review_auto_retry,attempts}' from public.ingestion_staging where id=ids[1]) is distinct from '1'
   or (select enriched_data#>>'{review_auto_retry,reason}' from public.ingestion_staging where id=ids[1]) is distinct from 'service_failure'
   then raise exception 'Retry bound or cause was not recorded'; end if;
  if not exists(select 1 from public.admin_review_repairs where entity_id=ids[1]
    and reason='news_service_failure_retry_queued' and previous_value#>>'{enriched_data,quality_status}'='review'
    and next_value#>>'{review_status}'='pending_review')
   then raise exception 'Original service failure evidence or machine retry audit missing'; end if;
  if exists(select 1 from public.ingestion_staging where id=any(ids)
    and (review_status<>'pending_review' or disposition<>'pending' or reviewed_by is not null))
   then raise exception 'Retry approved or disposed of a row'; end if;
  raise exception using errcode='ZX001',message='regression_passed';
 exception
  when sqlstate 'ZX001' then insert into review_news_retry_test_result values(true,'All seven retry guard fixtures passed; fixture subtransaction rolled back');
  when others then insert into review_news_retry_test_result values(false,sqlstate||': '||sqlerrm);
 end;
end $test$;
do $assert$ begin
 if exists(select 1 from review_news_retry_test_result where not passed)
 then raise exception 'Service retry regression failed: %',(select details from review_news_retry_test_result limit 1); end if;
end $assert$;
select * from review_news_retry_test_result;
