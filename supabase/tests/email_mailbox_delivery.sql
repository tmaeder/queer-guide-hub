begin;
insert into auth.users(id,email) values('88888888-0000-4000-8000-000000000001','sender-fixture@example.com'),('88888888-0000-4000-8000-000000000002','other-fixture@example.com');
insert into public.profiles(user_id,mailbox_address) values('88888888-0000-4000-8000-000000000001','sender-fixture'),('88888888-0000-4000-8000-000000000002','other-fixture');
create function public.test_mailbox_auth_erasure() returns jsonb language sql security definer set search_path=pg_catalog as $$
 select public.email_erase_account('88888888-0000-4000-8000-000000000002');
$$;
revoke all on function public.test_mailbox_auth_erasure() from public;
grant execute on function public.test_mailbox_auth_erasure() to authenticated;
alter table public.mailbox_emails add constraint fixture_atomic_copy check(subject<>'force_copy_failure');
revoke select on auth.users from service_role;
set local role service_role;
do $$
declare u uuid:='88888888-0000-4000-8000-000000000001';v uuid:='88888888-0000-4000-8000-000000000002';k uuid:=gen_random_uuid();
 m jsonb:='{"to":"recipient@example.com","subject":"Requested reply","body_html":"<p>Private fixture</p>","body_text":"Private fixture"}';r jsonb;r2 jsonb;o uuid;c uuid;l uuid;parent uuid;n bigint;
begin
 assert not has_table_privilege('service_role','auth.users','SELECT');
 assert not has_table_privilege('service_role','public.email_mailbox_sends','INSERT');
 assert not has_function_privilege('authenticated','public.email_mailbox_prepare(uuid,uuid,jsonb)','EXECUTE');
 select count(*) into n from public.email_outbox;
 begin perform public.email_mailbox_prepare(u,gen_random_uuid(),m||'{"category":"marketing"}');raise exception 'invalid source allowed';exception when invalid_parameter_value then null;end;
 begin perform public.email_mailbox_prepare(u,gen_random_uuid(),m||jsonb_build_object('subject',E'header\r\ninjection'));raise exception 'header injection allowed';exception when invalid_parameter_value then null;end;
 begin perform public.email_mailbox_prepare(u,gen_random_uuid(),m||'{"subject":"force_copy_failure"}');raise exception 'copy failure accepted';exception when check_violation then null;end;
 assert (select count(*) from public.email_outbox)=n,'failed copy left an outbox behind';
 r:=public.email_mailbox_prepare(u,k,m);o:=(r->>'outbox_id')::uuid;c:=(r->>'email_id')::uuid;
 assert r->>'status'='queued' and (select status='queued' from public.mailbox_emails where id=c),'send was called delivered before submission';
 assert (select payload->>'from'='sender-fixture@queer.guide' from public.email_outbox where id=o),'sender not derived from owned mailbox';
 assert public.email_mailbox_prepare(u,k,m)=r,'retry did not preserve immutable identity';
 begin perform public.email_mailbox_prepare(u,k,m||'{"subject":"changed"}');raise exception 'replay changed payload';exception when invalid_parameter_value then assert sqlerrm='mailbox_request_conflict';end;
 assert public.email_mailbox_status(v,k) is null,'status crossed owners';
 r2:=public.email_mailbox_prepare(v,k,m);assert r2->>'outbox_id'<>o::text,'request IDs crossed owners';
 select lease_id into l from public.email_claim(1,o);assert public.email_dispatch_authorize(o,l);
 assert (select status='sending' from public.mailbox_emails where id=c);
 assert public.email_finish(o,l,'accepted','cf-mailbox-fixture');
 assert (select status='accepted' and resend_id='cf-mailbox-fixture' from public.mailbox_emails where id=c),'acceptance was labelled delivery';
 perform public.email_record_event('mb-defer','cf-mailbox-fixture','recipient@example.com','deferred',now());
 assert (select status='deferred' from public.mailbox_emails where id=c);
 perform public.email_record_event('mb-deliver','cf-mailbox-fixture','recipient@example.com','delivered',now());
 assert (select status='delivered' from public.mailbox_emails where id=c);
 perform public.email_record_event('mb-late-defer','cf-mailbox-fixture','recipient@example.com','deferred',now()+interval '1 second');
 assert (select status='delivered' from public.mailbox_emails where id=c),'late deferral regressed delivery';
 assert jsonb_array_length(public.email_export_for_user(u)->'mailbox_sends')=1;
 assert jsonb_array_length(public.email_export_for_user(v)->'mailbox_sends')=1;
 -- Native events can arrive before the submission response is persisted.
 r2:=public.email_mailbox_prepare(u,gen_random_uuid(),m);select lease_id into l from public.email_claim(1,(r2->>'outbox_id')::uuid);
 perform public.email_record_event('mb-early','cf-mailbox-early','recipient@example.com','delivered',now());
 assert public.email_finish((r2->>'outbox_id')::uuid,l,'accepted','cf-mailbox-early');
 assert (select status='delivered' from public.mailbox_emails where id=(r2->>'email_id')::uuid),'early native event lost';
 -- Authenticated users can organise a copy, but cannot forge its content/status.
 perform set_config('qg.mailbox_copy',c::text,true);
 perform set_config('qg.mailbox_outbox',o::text,true);
 perform set_config('qg.mailbox_request',k::text,true);
 -- Removing the visible copy must not delete the send identity or recreate it.
 delete from public.mailbox_emails where id=c;
 r:=public.email_mailbox_prepare(u,k,m);
 assert r->>'outbox_id'=o::text and r->>'email_id' is null and r->>'status'='delivered';
 -- A foreign parent cannot provide reply metadata or a source identity.
 insert into public.mailbox_emails(owner_id,direction,from_address,to_address,subject,status,message_id_header)
 values(v,'inbound','external@example.com','other-fixture@queer.guide','Parent','delivered','<fixture@example.com>') returning id into parent;
 begin perform public.email_mailbox_prepare(u,gen_random_uuid(),m||jsonb_build_object('in_reply_to_email_id',parent));raise exception 'foreign thread accepted';exception when insufficient_privilege then null;end;
 r:=public.email_mailbox_prepare(v,gen_random_uuid(),m||jsonb_build_object('in_reply_to_email_id',parent));
 assert (select payload->'headers'->>'In-Reply-To'='<fixture@example.com>' from public.email_outbox where id=(r->>'outbox_id')::uuid);
 -- Changed source after claim must fail the final transport gate.
 r:=public.email_mailbox_prepare(u,gen_random_uuid(),m);select lease_id into l from public.email_claim(1,(r->>'outbox_id')::uuid);
 update public.profiles set mailbox_address='replacement-fixture' where user_id=u;
 assert not public.email_dispatch_authorize((r->>'outbox_id')::uuid,l),'changed mailbox submitted';
 assert (select status='uncertain' from public.mailbox_emails where id=(r->>'email_id')::uuid);
 update public.profiles set mailbox_address='sender-fixture' where user_id=u;
 r:=public.email_mailbox_prepare(u,gen_random_uuid(),m);o:=(r->>'outbox_id')::uuid;
 perform public.email_erase_account(u);
 assert not exists(select 1 from public.email_mailbox_sends where owner_id=u);
 assert not exists(select 1 from public.mailbox_emails where owner_id=u);
 assert (select erased_at is not null and payload='{}' and recipient_email='erased:'||id::text from public.email_outbox where id=o),'sender body survived erasure';
 assert (select count(*)=0 from public.email_claim(1,o)),'erased sender replayed';
 assert jsonb_array_length(public.email_export_for_user(u)->'mailbox_sends')=0;
 begin perform public.email_mailbox_prepare(u,gen_random_uuid(),m);raise exception 'erased sender prepared mail';exception when insufficient_privilege then null;end;
end $$;
-- Use the second owner's remaining copy to exercise the actual authenticated role.
set local role authenticated;
select set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000002',true);
do $$ declare c uuid;
begin
 select id into c from public.mailbox_emails where direction='outbound' limit 1;
 assert c is not null;
 update public.mailbox_emails set is_starred=true,folder='archive' where id=c;
 begin update public.mailbox_emails set status='delivered' where id=c;raise exception 'forged receipt';exception when insufficient_privilege then null;end;
 begin update public.mailbox_emails set body_text='replacement' where id=c;raise exception 'changed immutable send';exception when insufficient_privilege then null;end;
end $$;
select public.test_mailbox_auth_erasure();
reset role;
do $$ begin assert not exists(select 1 from public.email_mailbox_sends where owner_id='88888888-0000-4000-8000-000000000002');end $$;
rollback;
