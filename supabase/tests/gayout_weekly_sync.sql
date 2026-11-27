-- Integration fixtures are rolled back, including queue deliveries and canonical writes.
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare r uuid; again jsonb; q record; claim jsonb; accepted boolean; staged jsonb;
  item uuid; org uuid; result record; normalized jsonb;
  source_url text:='https://www.gayout.com/en/switzerland/zurich/organizations/queer-guide-sync-fixture';
begin
  if has_table_privilege('anon','public.gayout_sync_urls','select') or
     has_function_privilege('authenticated','public.start_gayout_weekly_sync(jsonb)','execute') then
    raise exception 'Internal sync state is exposed';
  end if;
  again:=public.start_gayout_weekly_sync('{"dry_run":true,"triggered_by":"integration_test"}');
  if not (again->>'created')::boolean then raise exception 'An active GayOut run exists; run fixtures only while idle';end if;
  r:=(again->>'pipeline_run_id')::uuid;
  again:=public.start_gayout_weekly_sync('{"dry_run":true}');
  if (again->>'pipeline_run_id')::uuid<>r or (again->>'created')::boolean then raise exception 'Concurrent start did not reuse run';end if;
  claim:=public.gayout_claim_step(r,'source-places');
  if claim is null or public.gayout_claim_step(r,'source-places') is not null then raise exception 'Step lease not exclusive';end if;
  if public.gayout_finish_step(r,'source-places',gen_random_uuid(),'{"status":"completed"}',0,0,0,false,1) then raise exception 'Stale step token accepted';end if;
  perform public.gayout_init_cycle(r,'places');
  -- init_cycle adopts pending work from older runs. Isolate this rollback-only
  -- fixture so commit assertions do not consume that unrelated work.
  update public.ingestion_staging set pipeline_run_id=null where pipeline_run_id=r;
  select * into strict q from public.gayout_claim_urls(r,'places',1);
  perform public.gayout_save_inventory(r,'places',q.url,q.lease_token,'fixture-hash',
    jsonb_build_array(jsonb_build_object('url',source_url,'work_kind','detail','source_entity_id','/en/switzerland/zurich/organizations/queer-guide-sync-fixture','target_table','organizations')),1,true);
  select * into strict q from public.gayout_claim_urls(r,'places',1);
  normalized:=jsonb_build_object('entityType','organization','sourceName','gayout','sourceId','/en/switzerland/zurich/organizations/queer-guide-sync-fixture',
    'name','Queer Guide Sync Fixture','location',jsonb_build_object('country','CH','city','Zurich','address','Fixture Street 23'),
    'contacts',jsonb_build_object('phone','+41441234567'),'metadata',jsonb_build_object('url',source_url));
  begin
    perform public.gayout_stage_item(r,'source-places','organizations',q.url,gen_random_uuid(),normalized,'{}');
    raise exception 'Stale source token accepted';
  exception when others then
    if sqlerrm not like '%lease is stale%' then raise;end if;
  end;
  staged:=public.gayout_stage_item(r,'source-places','organizations',q.url,q.lease_token,normalized,'{}');
  item:=(staged->>'staging_id')::uuid;
  if (public.gayout_stage_item(r,'source-places','organizations',q.url,q.lease_token,normalized,'{}')->>'changed')::boolean then raise exception 'Unchanged facts restaged';end if;
  update public.ingestion_staging set ai_validation_status='approved',dedup_status='unique' where id=item;
  -- The direct backend transport must retain the service identity checks used
  -- by source combination as well as the canonical commit functions.
  perform public.load_source_combination_batch('organizations',r,1);
  if exists(select 1 from public.commit_gayout_staging_batch(r,'venues',10)) then raise exception 'Commit crossed entity target';end if;
  select * into strict result from public.commit_gayout_staging_batch(r,'organizations',10);
  if result.action<>'inserted' then raise exception 'Organization commit failed: % / %',result.action,(select error_message from public.ingestion_staging where id=item);end if;
  org:=result.entity_id;
  if not exists(select 1 from public.organizations where id=org and address='Fixture Street 23' and country_id is not null) then raise exception 'Organization location was lost';end if;
  update public.organizations set phone='+41449999999',email=null where id=org;
  normalized:=jsonb_set(normalized,'{contacts,email}','"sync-fixture@example.invalid"');
  perform public.gayout_stage_item(r,'source-places','organizations',q.url,q.lease_token,normalized,'{}');
  update public.ingestion_staging set ai_validation_status='approved',dedup_status='unique' where id=item;
  select * into strict result from public.commit_gayout_staging_batch(r,'organizations',10);
  if result.action<>'updated' then raise exception 'Organization gap update failed: % / %',result.action,(select error_message from public.ingestion_staging where id=item);end if;
  if not exists(select 1 from public.organizations where id=org and phone='+41449999999' and email='sync-fixture@example.invalid') then raise exception 'Gap update overwrote curated contact or missed empty field';end if;
  perform public.gayout_finish_url(r,'places',q.url,q.lease_token,'done');
  accepted:=public.gayout_finish_step(r,'source-places',(claim->>'token')::uuid,'{"status":"completed","items_in":1,"items_out":1}',1,1,0,false,1);
  if not accepted or public.gayout_claim_step(r,'validate-venues') is null then raise exception 'Successor was not made ready';end if;
  if public.gayout_finish_step(r,'source-places',(claim->>'token')::uuid,'{"status":"completed"}',1,1,0,false,1) then raise exception 'Duplicate step completion accepted';end if;
end $$;
rollback;
