-- Authoritative publication, review, snapshot and privacy contracts. No mail.
begin;
insert into auth.users(id,email) values
 ('77777777-0000-4000-8000-000000000001','ops-admin@example.com'),
 ('77777777-0000-4000-8000-000000000002','ops-member@example.com');
insert into public.email_templates(template_key,name,subject,html_content,text_content)
 values('ops-fixture','Operations fixture','Original subject','<p>Original content</p>','Original content');
set local role service_role;
do $$
declare c jsonb; updated jsonb; seg jsonb; cid uuid; sid uuid; a uuid; m uuid; d uuid; pending uuid; result jsonb; n integer;
begin
 m:=public.email_subscription_request('ops-member@example.com','77777777-0000-4000-8000-000000000002','en',array['newsletter'],'website','v1',repeat('7',64));
 assert public.email_subscription_consume(repeat('7',64),'confirm');
 d:=public.email_subscription_request('ops-de@example.com',null,'de',array['newsletter'],'website','v1',repeat('8',64));
 assert public.email_subscription_consume(repeat('8',64),'confirm');
 pending:=public.email_subscription_request('ops-pending@example.com',null,'de',array['newsletter'],'website','v1',repeat('9',64));
 seg:=public.email_segment_save('English','{"field":"locale","op":"eq","value":"en"}','77777777-0000-4000-8000-000000000001');
 sid:=(seg->>'id')::uuid;
 c:=public.email_campaign_save(jsonb_build_object('name','Release','template_key','ops-fixture','topic','newsletter','segment_id',sid,'scheduled_at','2027-01-01T00:00:00Z'),'77777777-0000-4000-8000-000000000001');
 cid:=(c->>'id')::uuid;
 assert c->>'status'='blocked' and c->>'review_state'='draft' and (c->>'version')::int=1;
 assert (select content->>'subject'='Original subject' and content->>'segment_version'='1' from public.email_campaign_versions where campaign_id=cid and version=1);
 begin
  update public.email_campaign_versions set content='{}' where campaign_id=cid;
  raise exception 'immutable content was editable';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.email_campaign_versions where campaign_id=cid;
  raise exception 'immutable version was deletable';
 exception when insufficient_privilege then null; end;
 perform public.email_segment_save('German','{"field":"locale","op":"eq","value":"de"}',null,sid,1);
 updated:=public.email_campaign_save(jsonb_build_object('name','Release edited','template_key','ops-fixture','topic','newsletter','segment_id',sid),'77777777-0000-4000-8000-000000000001',cid,1);
 assert (updated->>'version')::int=2;
 assert (select content->'audience_rule'='{"field":"locale","op":"eq","value":"en"}'::jsonb from public.email_campaign_versions where campaign_id=cid and version=1),'old audience definition changed';
 assert (select content->>'segment_version'='2' from public.email_campaign_versions where campaign_id=cid and version=2);
 begin
  perform public.email_campaign_save('{"name":"Lost update","template_key":"ops-fixture","topic":"newsletter"}',null,cid,1);
  raise exception 'stale save accepted';
 exception when serialization_failure then null; end;
 result:=public.email_campaign_review(cid,2,'submit','77777777-0000-4000-8000-000000000001');
 assert result->>'review_state'='submitted';
 result:=public.email_campaign_review(cid,2,'approve','77777777-0000-4000-8000-000000000001');
 assert result->>'review_state'='approved' and result->>'dispatch_available'='false';
 begin
  perform public.email_campaign_review(cid,2,'approve',null);
  raise exception 'duplicate approval accepted';
 exception when invalid_parameter_value then null; end;
 a:=public.email_campaign_snapshot_begin(cid,2,'77777777-0000-4000-8000-000000000001');
 assert a=public.email_campaign_snapshot_begin(cid,2,null),'snapshot creation was not idempotent';
 for n in 1..10 loop
  result:=public.email_campaign_snapshot_batch(a,1);
  exit when result->>'status'='ready';
 end loop;
 assert result->>'status'='ready' and (result->>'scanned')::int=3,'snapshot did not resume through all contacts';
 assert (select count(*)=2 from public.email_campaign_audience_members where audience_id=a),'saved rule was not respected';
 assert (select reason='eligible' from public.email_campaign_audience_members where audience_id=a and subscriber_id=d);
 assert (select reason='pending_confirmation' from public.email_campaign_audience_members where audience_id=a and subscriber_id=pending),'missing exclusion evidence';
 assert not exists(select 1 from public.email_campaign_audience_members where audience_id=a and subscriber_id=m),'wrong language included';
 perform public.email_campaign_snapshot_batch(a,1000);
 assert (select count(*)=2 from public.email_campaign_audience_members where audience_id=a),'completed snapshot was duplicated';
 assert (select count(*)=0 from public.email_outbox),'campaign planning sent mail';
 updated:=public.email_campaign_save(jsonb_build_object('name','New revision','template_key','ops-fixture','topic','newsletter','segment_id',sid),'77777777-0000-4000-8000-000000000001',cid,2);
 assert updated->>'review_state'='draft' and (updated->>'version')::int=3,'editing did not invalidate approval';
 assert (select count(*)=2 from public.email_campaign_reviews where campaign_id=cid and version=2),'review history changed';
 begin
  perform public.email_campaign_review(cid,2,'approve',null);
  raise exception 'old version approved';
 exception when serialization_failure then null; end;
 a:=public.email_campaign_snapshot_begin(cid,3,null);
 perform public.email_campaign_cancel(cid,3,'77777777-0000-4000-8000-000000000001');
 assert (select status='cancelled' from public.email_campaign_audiences where id=a),'cancel did not stop collection';
 assert public.email_campaign_cancel(cid,3,null),'cancellation was not idempotent';
 begin
  perform public.email_campaign_snapshot_begin(cid,3,null);
  raise exception 'cancelled campaign collected recipients';
 exception when serialization_failure then null; end;
 -- The latest saved audience may change without rewriting a prior content version.
 perform public.email_segment_save('All subscriptions','{"field":"status","op":"eq","value":"subscribed"}',null,sid,2);
 assert (select content->'audience_rule'='{"field":"locale","op":"eq","value":"de"}'::jsonb from public.email_campaign_versions where campaign_id=cid and version=2);
 assert jsonb_array_length(public.email_export_for_user('77777777-0000-4000-8000-000000000001')->'operator_actions')>=5;
 perform public.email_erase_account('77777777-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.email_operator_events where actor_id='77777777-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.email_campaign_versions where created_by='77777777-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.email_campaign_reviews where actor_id='77777777-0000-4000-8000-000000000001');
 begin
  perform public.email_campaign_save('{"name":"Recreate actor","template_key":"ops-fixture","topic":"newsletter"}','77777777-0000-4000-8000-000000000001');
  raise exception 'erased actor recreated in audit';
 exception when insufficient_privilege then null; end;
 perform public.email_erase_account('77777777-0000-4000-8000-000000000002');
 assert not exists(select 1 from public.email_campaign_audience_members where subscriber_id=m),'recipient membership survived erasure';
end $$;
do $$
declare o public.email_outbox; queued public.email_outbox; result jsonb; health jsonb;
begin
 o:=public.email_enqueue('receipt-rehearsal','receipt@example.com','{"category":"transactional","to":"receipt@example.com","html":"private body"}','receipt');
 update public.email_outbox set status='uncertain' where id=o.id;
 result:=public.email_receipt_reconcile(o.id,'{"status":"uncertain"}');
 assert result->>'changed'='false' and result->>'sent'='false';
 -- Replay a provider event that arrived before the database receipt.
 perform public.email_record_event('ops-delivered','ops-provider','receipt@example.com','delivered',now());
 result:=public.email_receipt_reconcile(o.id,'{"status":"accepted","id":"ops-provider"}');
 assert result->>'status'='delivered' and result->>'sent'='false';
 assert (select attempts=0 from public.email_outbox where id=o.id),'inspection attempted a send';
 result:=public.email_receipt_reconcile(o.id,'{"status":"accepted","id":"ops-provider"}');
 assert result->>'changed'='false','terminal reconciliation was not idempotent';
 queued:=public.email_enqueue('queued-retention','keep@example.com','{"to":"keep@example.com","category":"transactional","html":"keep queued"}','receipt');
 update public.email_outbox set updated_at=now()-interval '100 days' where id in(o.id,queued.id);
 result:=public.email_retention_tick(1);
 assert result->>'payloads_redacted'='1';
 assert (select payload='{}' and payload_retained_at is not null and provider_id='ops-provider' from public.email_outbox where id=o.id),'retention lost dedup evidence';
 assert (select payload->>'html'='keep queued' and payload_retained_at is null from public.email_outbox where id=queued.id),'queued body was removed';
 result:=public.email_retention_tick(1);
 assert result->>'payloads_redacted'='0','retention repeated work';
 health:=public.email_operations_health();
 assert health->>'window_days'='30' and health->'states'->>'delivered'='1';
 assert jsonb_typeof(health->'acceptance_p95_seconds')='number';
 assert (select count(*)=1 from public.email_operator_events where object_type='message' and object_id=o.id);
end $$;
reset role;
do $$ declare t text; f record;
begin
 foreach t in array array['email_campaign_versions','email_campaign_reviews','email_operator_events','email_campaign_audiences','email_campaign_audience_members'] loop
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'RLS missing';
  assert not has_table_privilege('anon','public.'||t,'SELECT') and not has_table_privilege('authenticated','public.'||t,'SELECT'),'member accessed campaign operations';
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'email_campaign_%' loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE'),'public campaign RPC';
 end loop;
end $$;
rollback;
