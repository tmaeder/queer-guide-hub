begin;
insert into public.email_templates(template_key,name,subject,html_content) values('welcome','Welcome','Welcome','<p>Welcome</p>');
-- This account predates activation and must not receive an automatic welcome.
insert into auth.users(id,email) values('a3333333-0000-4000-8000-000000000000','old@example.com');
set local role service_role;
do $$
declare
 definition jsonb:='{"start":"delay","steps":{"delay":{"type":"wait","seconds":60,"next":"branch"},"branch":{"type":"branch","condition":"username_claimed","yes":"done","no":"welcome"},"welcome":{"type":"welcome","next":"done"},"done":{"type":"end"}}}';
 graph2 jsonb; saved jsonb; jid uuid; rid uuid; lid uuid; mid uuid; mailbox_lease uuid;
 a uuid:='a3333333-0000-4000-8000-000000000001'; b uuid:='b3333333-0000-4000-8000-000000000001';
 c uuid:='c3333333-0000-4000-8000-000000000001'; member uuid:='d3333333-0000-4000-8000-000000000001';
 source uuid:='e3333333-0000-4000-8000-000000000001';
 task record; o public.email_outbox; key text; item jsonb; count_rows integer;
begin
 -- Unsupported actions, cycles, invalid edges and cross-purpose welcomes fail.
 for item in select value from jsonb_array_elements('[
  {"start":"a","steps":{"a":{"type":"newsletter","next":"b"},"b":{"type":"end"}}},
  {"start":"a","steps":{"a":{"type":"wait","seconds":1,"next":"a"}}},
  {"start":"a","steps":{"a":{"type":"wait","seconds":0,"next":"b"},"b":{"type":"end"}}},
  {"start":"a","steps":{"a":{"type":"welcome","next":"missing"}}},
  {"start":"missing","steps":{"end":{"type":"end"}}},
  {"start":"a","steps":{"a":{"type":"branch","condition":"sexual_orientation","yes":"b","no":"b"},"b":{"type":"end"}}}
 ]') loop
  begin
   perform public.email_journey_validate('account.created','created','once_per_account',item);
   raise exception 'invalid graph accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.email_journey_validate('group.membership.changed','joined','once_per_source',definition);
  raise exception 'group welcome action accepted';
 exception when invalid_parameter_value then null; end;
 saved:=public.email_journey_save('Onboarding','account.created','created',definition,'once_per_account','active');
 jid:=(saved->>'id')::uuid;
 assert public.email_journey_enroll()=0,'historical account enrolled';
end $$;
reset role;
insert into auth.users(id,email) values
 ('a3333333-0000-4000-8000-000000000001','journey-a@example.com'),
 ('b3333333-0000-4000-8000-000000000001','journey-b@example.com');
insert into public.profiles(user_id,username) values('a3333333-0000-4000-8000-000000000001',null),('b3333333-0000-4000-8000-000000000001',null);
set local role service_role;
do $$
declare j public.email_journeys; definition jsonb; task record; n integer; rid uuid; lid uuid; mid uuid; mailbox_lease uuid; key text; o public.email_outbox; exported jsonb;
begin
 select * into j from public.email_journeys where name='Onboarding';
 select v.definition into definition from public.email_journey_versions v where v.journey_id=j.id and v.version=1;
 assert public.email_journey_enroll()=2;
 assert public.email_journey_enroll()=0,'enrollment replay duplicated run';
 -- Edit while runs are live; their nodes remain pinned to version one.
 perform public.email_journey_save('Onboarding','account.created','created',jsonb_set(definition,'{steps,delay,seconds}','1200'),'once_per_account','active',null,j.id,1);
 for task in select * from public.email_journey_claim(5) loop
  assert task.node->>'seconds'='60','published edit rewrote an enrolled run';
  assert not exists(select 1 from public.email_journey_claim(5)),'active lease claimed twice';
  assert not public.email_journey_advance(task.run_id,gen_random_uuid()),'stale lease advanced';
  assert public.email_journey_advance(task.run_id,task.lease);
 end loop;
 assert not exists(select 1 from public.email_journey_claim(5)),'wait did not persist across ticks';
 assert (select count(*)=2 from public.email_journey_steps where kind='wait');
 update public.email_journey_runs set due_at=now()-interval '1 second';
 for task in select * from public.email_journey_claim(5) loop
  assert task.node->>'type'='branch';
  if task.user_id='a3333333-0000-4000-8000-000000000001' then update public.profiles set username='claimed-after-lease' where user_id=task.user_id; end if;
  assert public.email_journey_advance(task.run_id,task.lease);
 end loop;
 for task in select * from public.email_journey_claim(5) loop
  if task.node->>'type'='end' then assert public.email_journey_advance(task.run_id,task.lease);
  else assert task.node->>'type'='welcome'; rid:=task.run_id; lid:=task.lease; end if;
 end loop;
 assert rid is not null;
 begin
  perform public.email_journey_advance(rid,lid);
  raise exception 'welcome completed without provider receipt';
 exception when invalid_parameter_value then assert sqlerrm='journey_receipt_required'; end;
 key:=encode(sha256(convert_to('welcome:b3333333-0000-4000-8000-000000000001:journey-b@example.com','UTF8')),'hex');
 begin
  perform public.email_journey_enqueue(key,'journey-b@example.com','{"category":"marketing","to":"journey-b@example.com"}','welcome','b3333333-0000-4000-8000-000000000001',rid,lid,'welcome');
  raise exception 'marketing step enqueued';
 exception when raise_exception then assert sqlerrm='cloudflare_transactional_only'; end;
 assert not exists(select 1 from public.email_outbox where idempotency_key=key),'failed message left an unlinked queue entry';
 begin
  perform public.email_journey_enqueue(encode(sha256(convert_to('welcome:b3333333-0000-4000-8000-000000000001:alias@example.com','UTF8')),'hex'),
   'alias@example.com','{"category":"transactional","to":"alias@example.com"}','welcome','b3333333-0000-4000-8000-000000000001',rid,lid,'welcome');
  raise exception 'non-primary welcome recipient accepted';
 exception when invalid_parameter_value then assert sqlerrm='unsupported_journey_message'; end;
 o:=public.email_journey_enqueue(key,'journey-b@example.com','{"category":"transactional","to":"journey-b@example.com","subject":"Welcome"}','welcome','b3333333-0000-4000-8000-000000000001',rid,lid,'welcome'); mid:=o.id;
 assert exists(select 1 from public.email_journey_messages where outbox_id=mid and run_id=rid),'run link not atomic';
 select lease_id into mailbox_lease from public.email_claim(1,mid);
 assert public.email_dispatch_authorize(mid,mailbox_lease);
 perform public.email_journey_save('Onboarding','account.created','created',definition,'once_per_account','paused',null,j.id,2);
 assert not public.email_dispatch_authorize(mid,mailbox_lease),'paused journey submitted queued mail';
 assert not public.email_journey_advance(rid,lid),'paused run advanced';
 update public.email_outbox set status='queued',lease_id=null,leased_until=null where id=mid;
 assert not exists(select 1 from public.email_claim(1,mid)),'paused mail kept consuming delivery attempts';
 assert not exists(select 1 from public.email_journey_claim(5)),'paused run claimed';
 perform public.email_journey_save('Onboarding','account.created','created',definition,'once_per_account','active',null,j.id,3);
 assert public.email_journey_run_allowed(rid,lid),'resume lost persisted run';
 update auth.users set email='changed-primary@example.com' where id='b3333333-0000-4000-8000-000000000001';
 assert not public.email_journey_message_allowed(mid),'stale primary email submitted';
 update auth.users set email='journey-b@example.com' where id='b3333333-0000-4000-8000-000000000001';
 select lease_id into mailbox_lease from public.email_claim(1,mid);
 assert public.email_finish(mid,mailbox_lease,'queued',null,'E_DAILY_LIMIT_EXCEEDED',86400);
 assert public.email_journey_advance(rid,lid,'test_quota');
 assert (select status='waiting' and due_at>=now()+interval '23 hours' from public.email_journey_runs where id=rid),'journey exhausted attempts before daily quota reset';
 update public.email_journey_runs set due_at=now()-interval '1 second' where id=rid;
 update public.email_outbox set available_at=now()-interval '1 second' where id=mid;
 select claimed.run_id,claimed.lease into rid,lid from public.email_journey_claim(5) claimed where claimed.run_id=rid;
 assert lid is not null;
 select lease_id into mailbox_lease from public.email_claim(1,mid);
 assert public.email_finish(mid,mailbox_lease,'accepted','journey-native-receipt');
 assert public.email_journey_advance(rid,lid),'real receipt did not complete step';
 assert not public.email_journey_advance(rid,lid),'stale worker repeated step';
 for task in select * from public.email_journey_claim(5) loop assert public.email_journey_advance(task.run_id,task.lease); end loop;
 assert (select count(*)=2 from public.email_journey_runs where status='completed');
 assert (select count(*)=1 from public.email_outbox where idempotency_key=key),'welcome duplicated';
 exported:=public.email_export_for_user('b3333333-0000-4000-8000-000000000001');
 assert jsonb_array_length(exported->'journey_runs')=1 and jsonb_array_length(exported->'journey_steps')=4,'journey export incomplete';
 assert exported::text not like '%lease_id%' and exported::text not like '%enrollment_key%','internal journey secrets exported';
 begin
  perform public.email_journey_save('Stale','account.created','created',definition,'once_per_account','active',null,j.id,1);
  raise exception 'stale publication accepted';
 exception when serialization_failure then null; end;
 perform public.email_erase_account('b3333333-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.email_journey_runs where user_id='b3333333-0000-4000-8000-000000000001'),'erasure retained journey state';
 assert not exists(select 1 from public.email_journey_messages where outbox_id=mid),'erasure retained run-message link';
 perform public.email_journey_save('Onboarding','account.created','created',definition,'once_per_account','archived',null,j.id,4);
end $$;
reset role;
-- A source withdrawal cancels future work even before the wait becomes due.
insert into auth.users(id,email) values('c3333333-0000-4000-8000-000000000001','group-journey@example.com');
set local role service_role;
do $$ declare saved jsonb; jid uuid; task record; source uuid:='e3333333-0000-4000-8000-000000000001'; definition jsonb:='{"start":"wait","steps":{"wait":{"type":"wait","seconds":3600,"next":"end"},"end":{"type":"end"}}}';
begin
 saved:=public.email_journey_save('Group control','group.membership.changed','joined',definition,'once_per_source','active'); jid:=(saved->>'id')::uuid;
 insert into public.group_memberships(id,group_id,user_id) values(source,gen_random_uuid(),'c3333333-0000-4000-8000-000000000001');
 assert public.email_journey_enroll()=1;
 for task in select * from public.email_journey_claim(5) loop assert public.email_journey_advance(task.run_id,task.lease); end loop;
 delete from public.group_memberships where id=source;
 assert not exists(select 1 from public.email_journey_claim(5));
 assert (select status='cancelled' from public.email_journey_runs where journey_id=jid),'left member remained scheduled';
 insert into public.group_memberships(id,group_id,user_id) values(source,gen_random_uuid(),'c3333333-0000-4000-8000-000000000001');
 assert public.email_journey_enroll()=0,'once-per-source reentry ignored';
 perform public.email_journey_save('Group control','group.membership.changed','joined',definition,'per_event','active',null,jid,1);
 assert public.email_journey_enroll()=0,'policy edit re-enrolled historical events';
 delete from public.group_memberships where id=source;
 insert into public.group_memberships(id,group_id,user_id) values(source,gen_random_uuid(),'c3333333-0000-4000-8000-000000000001');
 assert public.email_journey_enroll()=1,'new event did not honor published reentry';
 assert public.email_journey_cancel((select id from public.email_journey_runs where journey_id=jid and version=2));
 assert public.email_journey_cancel((select id from public.email_journey_runs where journey_id=jid and version=2)),'cancel was not idempotent';
 -- Simulate a source transaction whose old-version event becomes visible
 -- only after a new publication. Publication intervals must retain that event.
 insert into public.group_memberships(id,group_id,user_id) values('f3333333-0000-4000-8000-000000000001',gen_random_uuid(),'c3333333-0000-4000-8000-000000000001');
 update public.email_lifecycle_events set occurred_at=(select activated_at+(deactivated_at-activated_at)/2 from public.email_journey_versions where journey_id=jid and version=1)
 where source_id='f3333333-0000-4000-8000-000000000001' and event_type='group.membership.changed';
 assert public.email_journey_enroll()=1,'late old-version event was lost';
 assert exists(select 1 from public.email_journey_runs where journey_id=jid and source_id='f3333333-0000-4000-8000-000000000001' and version=1),'late event used the new definition';
 perform public.email_journey_save('Group control','group.membership.changed','joined',definition,'per_event','archived',null,jid,2);
 assert not exists(select 1 from public.email_journey_runs where journey_id=jid and status in ('waiting','processing')),'archive left live runs';
end $$;
reset role;
-- Expired leases may be reclaimed, but an old worker cannot advance the run;
-- transient failures back off and exhausted attempts enter an explicit failure.
set local role service_role;
do $$ declare saved jsonb; jid uuid; first_task record; second_task record;
begin
 saved:=public.email_journey_save('Lease controls','account.created','created','{"start":"wait","steps":{"wait":{"type":"wait","seconds":1,"next":"end"},"end":{"type":"end"}}}','once_per_account','active'); jid:=(saved->>'id')::uuid;
 perform public.email_emit_lifecycle_event('lease-controls-event','c3333333-0000-4000-8000-000000000001','account.created','c3333333-0000-4000-8000-000000000001','created');
 assert public.email_journey_enroll()=1;
 select * into first_task from public.email_journey_claim(1);
 assert first_task.run_id is not null;
 assert not exists(select 1 from public.email_journey_claim(1));
 update public.email_journey_runs set leased_until=now()-interval '1 second' where id=first_task.run_id;
 select * into second_task from public.email_journey_claim(1);
 assert second_task.run_id=first_task.run_id and second_task.lease<>first_task.lease;
 assert not public.email_journey_advance(first_task.run_id,first_task.lease),'expired worker advanced';
 assert public.email_journey_advance(second_task.run_id,second_task.lease,'test_failure');
 assert (select status='waiting' and due_at>=now()+interval '119 seconds' and total_steps=0 from public.email_journey_runs where id=first_task.run_id),'retry wait or step accounting incorrect';
 update public.email_journey_runs set attempts=7,due_at=now()-interval '1 second' where id=first_task.run_id;
 select * into second_task from public.email_journey_claim(1);
 assert public.email_journey_advance(second_task.run_id,second_task.lease,'test_failure');
 assert (select status='failed' and attempts=8 from public.email_journey_runs where id=first_task.run_id),'exhausted run not failed';
 assert not exists(select 1 from public.email_journey_claim(1));
end $$;
reset role;
set local role service_role;
do $$ declare saved jsonb; jid uuid; task record; key text; o public.email_outbox; mail_lease uuid;
begin
 saved:=public.email_journey_save('Uncertain welcome','account.created','created','{"start":"welcome","steps":{"welcome":{"type":"welcome","next":"end"},"end":{"type":"end"}}}','once_per_account','active'); jid:=(saved->>'id')::uuid;
 perform public.email_emit_lifecycle_event('uncertain-event','c3333333-0000-4000-8000-000000000001','account.created','c3333333-0000-4000-8000-000000000001','created');
 assert public.email_journey_enroll()=1;
 select * into task from public.email_journey_claim(1);
 assert task.node->>'type'='welcome';
 key:=encode(sha256(convert_to('welcome:c3333333-0000-4000-8000-000000000001:group-journey@example.com','UTF8')),'hex');
 o:=public.email_journey_enqueue(key,'group-journey@example.com','{"category":"transactional","to":"group-journey@example.com"}','welcome',task.user_id,task.run_id,task.lease,'welcome');
 select lease_id into mail_lease from public.email_claim(1,o.id);
 assert public.email_finish(o.id,mail_lease,'uncertain',null,'provider_timeout');
 assert public.email_journey_advance(task.run_id,task.lease,'action_failed');
 assert (select status='failed' and attempts=1 and last_error='message_uncertain' from public.email_journey_runs where id=task.run_id),'uncertain submission automatically retried';
 assert not exists(select 1 from public.email_claim(1,o.id));
 assert not exists(select 1 from public.email_journey_claim(1));
end $$;
reset role;
do $$ declare t text; f record;
begin
 foreach t in array array['email_journeys','email_journey_versions','email_journey_runs','email_journey_steps','email_journey_messages'] loop
  assert not has_table_privilege('anon','public.'||t,'SELECT');
  assert not has_table_privilege('authenticated','public.'||t,'INSERT');
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass);
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_journey_%' or proname in ('email_dispatch_authorize','email_export_for_user')) loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE');
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
