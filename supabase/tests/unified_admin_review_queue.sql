-- Contract tests run entirely inside a rolled-back transaction.
-- No existing review item is decided or published by this test.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.user_roles where role='admin' limit 1),true);
do $$
declare v_tag uuid:=gen_random_uuid();v_brand uuid:=gen_random_uuid();
 v_stage uuid:=gen_random_uuid();v_stage2 uuid:=gen_random_uuid();v_missing uuid:=gen_random_uuid();
 v_event uuid;v_issue uuid:=gen_random_uuid();v_dimension text;v_page jsonb;v_result jsonb;v_seen boolean:=false;
begin
 if auth.uid() is null then raise exception 'Test requires an existing administrator'; end if;
 if has_function_privilege('anon','public.get_admin_review_queue(text[],text[],text,text,integer,integer,text)','execute') then raise exception 'Anonymous review access'; end if;
 if has_function_privilege('authenticated','public.admin_review_item(text,uuid)','execute') then raise exception 'Private hydration helper exposed'; end if;
 if has_table_privilege('authenticated','public.admin_review_src_sensitive_tags','select') then raise exception 'Raw review view exposed'; end if;
 v_page:=public.get_admin_review_queue(p_scope=>'overdue');
 if (v_page->>'total')::bigint<>(v_page->>'overdue_total')::bigint then raise exception 'Overdue count/list disagreement'; end if;
 if exists(select 1 from jsonb_array_elements(v_page->'items') x where not (x->>'overdue')::boolean) then raise exception 'Not an item-level overdue filter'; end if;
 if (v_page->>'all_total')::bigint<>(select sum((x->>'count')::bigint) from jsonb_array_elements(v_page->'sources') x) then raise exception 'Source count disagreement'; end if;

 insert into public.unified_tags(id,name,status,is_sensitive,human_reviewed,seo_indexable,publication_role)
 values(v_tag,'Unified review test '||v_tag,'active',true,false,false,'utility');
 begin
  perform public.admin_review_action('sensitive-tags',v_tag,'approve',null,false);
  raise exception 'Confirmation gate was bypassed';
 exception when others then
  if sqlerrm not like 'Confirm the consequences%' then raise; end if;
 end;
 perform public.admin_review_action('sensitive-tags',v_tag,'reject');
 if exists(select 1 from public.admin_review_src_sensitive_tags where id=v_tag) then raise exception 'Reviewed tag remained pending'; end if;
 if not exists(select 1 from public.unified_tags where id=v_tag and human_reviewed and not seo_indexable) then raise exception 'Keep-hidden outcome incorrect'; end if;
 begin
  perform public.admin_review_action('sensitive-tags',v_tag,'approve',null,true);
  raise exception 'A stale decision succeeded';
 exception when serialization_failure then null;
 end;

 insert into public.marketplace_brands(id,brand_key,display_name,suggested_tags,ownership_review_status,evidence)
 values(v_brand,'review-test-'||v_brand,'Unified review test '||v_brand,array['women_owned'],'pending','Test-only public source evidence');
 perform public.admin_review_action('brand-ownership',v_brand,'approve','Test-only evidence',false,jsonb_build_object('tags',jsonb_build_array('women_owned')));
 if not exists(select 1 from public.marketplace_brands where id=v_brand and ownership_tags=array['women_owned'] and ownership_review_status='verified' and publication_status='published') then raise exception 'Brand approval did not apply the selected claims'; end if;

 insert into public.ingestion_staging(id,target_table,source_type,raw_data,normalized_data,review_status,disposition)
 values(v_stage,'venues','manual','{}',jsonb_build_object('name','Queue test fixture'),'pending_review','pending'),
 (v_stage2,'venues','manual','{}',jsonb_build_object('name','Queue test fixture 2'),'pending_review','pending');
 while v_missing<v_stage or exists(select 1 from public.ingestion_staging where id=v_missing) loop v_missing:=gen_random_uuid(); end loop;
 begin
  perform public.admin_review_bulk('staging',array[v_stage,v_missing],'approve');
  raise exception 'Bulk accepted a missing item';
 exception when serialization_failure then null;
 end;
 if not exists(select 1 from public.ingestion_staging where id=v_stage and review_status='pending_review') then raise exception 'Bulk failure partially committed'; end if;
 v_result:=public.admin_review_bulk('staging',array[v_stage,v_stage2],'approve');
 if (v_result->>'count')::integer<>2 then raise exception 'Bulk count is wrong'; end if;
 if (select count(*) from public.ingestion_staging where id=any(array[v_stage,v_stage2]) and review_status='approved')<>2 then raise exception 'Bulk source decisions were not applied'; end if;
 perform public.admin_review_action('staging',v_stage,'reopen');
 if not exists(select 1 from public.triage_src_staging where id=v_stage) then raise exception 'Supported undo failed'; end if;

 select event_id,dimension into v_event,v_dimension from public.event_quality_issues limit 1;
 if v_event is not null then
  insert into public.event_quality_issues(id,event_id,dimension,issue_code,severity,detector,evidence,evidence_hash)
  values(v_issue,v_event,v_dimension,'review_test_'||replace(v_issue::text,'-',''),'critical','admin-review-contract-test','{}',md5(v_issue::text));
  begin
   perform public.admin_review_action('event-quality',v_issue,'reject','Test exception');
   raise exception 'Critical exception accepted';
  exception when others then
   if sqlerrm not like 'critical event quality issues cannot be accepted%' then raise; end if;
  end;
  perform public.admin_review_action('event-quality',v_issue,'approve','Test-only repaired disposition');
  if not exists(select 1 from public.event_quality_issues where id=v_issue and status='resolved') then raise exception 'Event issue decision failed'; end if;
 end if;
 if not exists(select 1 from public.admin_review_decisions where item_id=v_tag and actor_id=auth.uid() and decision='reject') then raise exception 'Review audit missing'; end if;
end $$;
rollback;
