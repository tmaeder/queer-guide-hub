-- Standalone contract suite, after both email migrations and bootstrap.
begin;
insert into auth.users(id,email) values
 ('a1111111-0000-4000-8000-000000000001','owner@example.com'),
 ('b1111111-0000-4000-8000-000000000001','other@example.com'),
 ('c1111111-0000-4000-8000-000000000001','direct@example.com'),
 ('d1111111-0000-4000-8000-000000000001','rollback@example.com'),
 ('e1111111-0000-4000-8000-000000000001','anonymize@example.com');
insert into public.profiles(user_id,display_name) select id,'Privacy test' from auth.users where email like '%@example.com';
create table public.privacy_delete_blocker(user_id uuid references public.profiles(user_id));
insert into public.privacy_delete_blocker values('d1111111-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare
 a uuid:='a1111111-0000-4000-8000-000000000001';
 b uuid:='b1111111-0000-4000-8000-000000000001';
 c uuid:='c1111111-0000-4000-8000-000000000001';
 d uuid:='d1111111-0000-4000-8000-000000000001';
 e uuid:='e1111111-0000-4000-8000-000000000001';
 sid uuid; other_sid uuid; r public.email_outbox; lease uuid; mid uuid; data jsonb;
begin
 r:=public.email_enqueue('owned','owner@example.com','{"category":"transactional","to":"owner@example.com","subject":"Hello","text":"Personal content"}',null,null,a);
 mid:=r.id;
 select lease_id into lease from public.email_claim(1,r.id);
 assert public.email_dispatch_authorize(r.id,lease),'current lease unexpectedly denied';
 assert not public.email_dispatch_authorize(r.id,gen_random_uuid()),'wrong lease allowed';
 begin
  perform public.email_enqueue('wrong-owner','other@example.com','{"category":"transactional","to":"other@example.com"}',null,null,a);
  raise exception 'wrong mailbox allowed';
 exception when raise_exception then assert sqlerrm='email_account_recipient_mismatch'; end;
 sid:=public.email_subscription_request('owner@example.com',a,'en',array['newsletter'],'account_settings','v1',repeat('2',64),
  '{"category":"transactional","to":"owner@example.com","subject":"Confirm","text":"SECRET_CONFIRMATION"}','confirm-owned');
 assert exists(select 1 from public.email_subscription_tokens where subscriber_id=sid and confirmation_outbox_id is not null),'token not connected to outbox';
 assert public.email_subscription_consume(repeat('2',64),'confirm');
 other_sid:=public.email_subscription_request('other@example.com',b,'en',array['events'],'account_settings','v1',repeat('3',64));
 assert public.email_subscription_consume(repeat('3',64),'confirm');
 update public.email_subscribers set confirmation_sent_at=now()-interval '1 hour' where id=other_sid;
 -- A still-unproved claim must not let the requesting account erase B's data.
 perform public.email_subscription_request('other@example.com',a,'de',array['newsletter'],'account_settings','v2',repeat('4',64),
  '{"category":"transactional","to":"other@example.com","text":"OTHER_CLAIM_SECRET"}','unproved-other');
 insert into public.email_suppressions(email,reason) values('other@example.com','complaint');
 perform public.email_record_event('other-event','other-provider','other@example.com','complained',now());
 data:=public.email_export_for_user(a);
 assert jsonb_array_length(data->'subscriptions')=1,'export included another subscription';
 assert jsonb_array_length(data->'messages')=2,'export message ownership wrong';
 assert data::text not like '%SECRET_CONFIRMATION%','confirmation secret exported';
 assert data::text not like '%OTHER_CLAIM_SECRET%','unproved foreign mailbox content exported';
 assert data::text like '%Personal content%','owned content missing';
 perform public._delete_user_data_core(a);
 assert not public.email_dispatch_authorize(mid,lease),'erased claimed message authorized';
 assert not public.email_finish(mid,lease,'accepted','late-provider'),'stale result restored erased row';
 assert (select payload='{}'::jsonb and erased_at is not null and recipient_user_id is null and recipient_email='erased:'||id::text
  from public.email_outbox where id=mid),'erasure retained personal payload/identity';
 assert (select last_error='account_erased' and payload='{}'::jsonb from public.email_outbox where idempotency_key='unproved-other'),'pending claim mail survived';
 assert not exists(select 1 from public.email_subscribers where user_id=a);
 assert not exists(select 1 from public.email_subscription_tokens where requested_user_id=a);
 assert not public.email_subscription_consume(repeat('4',64),'confirm'),'erased claim still usable';
 assert (select status='subscribed' and user_id=b and topics=array['events'] from public.email_subscribers where id=other_sid),'foreign subscription altered';
 assert exists(select 1 from public.email_suppressions where email='other@example.com'),'foreign suppression removed';
 assert exists(select 1 from public.email_delivery_events where event_id='other-event'),'foreign delivery history removed';
 assert not exists(select 1 from public.email_erased_mailboxes where mailbox_hash=encode(sha256(convert_to('other@example.com','UTF8')),'hex')),'unproved claim marked foreign mailbox erased';
 assert not public.email_record_event('late-erased','unknown-provider','owner@example.com','delivered',now()),'late callback recreated personal data';
 assert not exists(select 1 from public.email_suppressions where email='owner@example.com');
 assert not public.email_record_event('known-erased','late-provider','owner@example.com','delivered',now());
 begin
  perform public.email_enqueue('new-stale','owner@example.com','{"category":"transactional","to":"owner@example.com"}',null,null,a);
  raise exception 'disabled account enqueued';
 exception when raise_exception then assert sqlerrm='email_account_disabled'; end;
 begin
  perform public.email_enqueue('owned','owner@example.com','{"category":"transactional","to":"owner@example.com","subject":"Hello","text":"Personal content"}');
  raise exception 'erased identity restored';
 exception when raise_exception then assert sqlerrm='email_idempotency_conflict'; end;
 -- A fresh, separately owned message to the mailbox can still receive events
 -- after its receipt is known; erasure must not globally block a mailbox.
 r:=public.email_enqueue('fresh-after-erasure','owner@example.com','{"category":"transactional","to":"owner@example.com"}');
 select lease_id into lease from public.email_claim(1,r.id);
 assert public.email_finish(r.id,lease,'accepted','fresh-provider');
 assert public.email_record_event('fresh-event','fresh-provider','owner@example.com','delivered',now());
 assert (select status='delivered' from public.email_outbox where id=r.id);
 -- Underlying product deletion failure rolls the email work back too.
 r:=public.email_enqueue('rollback-owned','rollback@example.com','{"category":"transactional","to":"rollback@example.com"}',null,null,d);
 begin
  perform public._delete_user_data_core(d);
  raise exception 'expected product FK failure';
 exception when foreign_key_violation then null; end;
 assert (select erased_at is null and recipient_user_id=d from public.email_outbox where id=r.id),'partial deletion committed';
 assert not exists(select 1 from public.email_disabled_accounts where user_id=d),'failed deletion disabled account';
 -- Seed direct auth deletion and the anonymization wrapper cases.
 perform public.email_record_event('direct-bounce','unknown-direct','direct@example.com','bounced',now(),true);
 perform public.email_enqueue('auth-delete','direct@example.com','{"category":"transactional","to":"direct@example.com"}',null,null,c);
 perform public.email_subscription_request('direct@example.com',c,'en',array['events'],'account_settings','v1',repeat('5',64),
  '{"category":"transactional","to":"direct@example.com"}','auth-pending');
 perform public.email_enqueue('anonymize','anonymize@example.com','{"category":"transactional","to":"anonymize@example.com"}',null,null,e);
end $$;
reset role;
delete from public.profiles where user_id='c1111111-0000-4000-8000-000000000001';
delete from auth.users where id='c1111111-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 begin
  perform public.admin_anonymize_user('e1111111-0000-4000-8000-000000000001');
  raise exception 'anonymize guard bypassed';
 exception when insufficient_privilege then null; end;
end $$;
set local "request.jwt.claim.sub"='aaaaaaaa-0000-4000-8000-000000000001';
select public.admin_anonymize_user('e1111111-0000-4000-8000-000000000001');
reset role;
select public.email_enqueue('after-erased-bounce','direct@example.com','{"category":"transactional","to":"direct@example.com"}');
do $$ declare f record; t text;
begin
 assert not exists(select 1 from public.email_claim(1,(select id from public.email_outbox where idempotency_key='after-erased-bounce'))),'hashed suppression bypassed';
 assert (select erased_at is not null and payload='{}'::jsonb from public.email_outbox where idempotency_key='auth-delete'),'direct auth delete missed email';
 assert exists(select 1 from public.email_erased_mailboxes where mailbox_hash=encode(sha256(convert_to('direct@example.com','UTF8')),'hex') and suppression_reason='hard_bounce'),'erasure lost suppression';
 assert not exists(select 1 from public.email_subscription_tokens where token_hash=repeat('5',64)),'auth deletion orphaned confirmation token';
 assert (select payload='{}'::jsonb from public.email_outbox where idempotency_key='auth-pending'),'pending confirmation body survived auth deletion';
 assert (select erased_at is not null from public.email_outbox where idempotency_key='anonymize'),'anonymization missed email';
 foreach t in array array['email_disabled_accounts','email_erased_mailboxes'] loop
  assert not has_table_privilege('anon','public.'||t,'SELECT');
  assert not has_table_privilege('authenticated','public.'||t,'SELECT');
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass);
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_%' or proname in ('_delete_user_data_core','_delete_user_data_before_email','_admin_anonymize_before_email')) loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE');
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
