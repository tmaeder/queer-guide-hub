-- Run after the email platform migration in an isolated database.
begin;
-- Minimal feedback table for standalone execution; a full Supabase schema
-- already has it, so IF NOT EXISTS leaves the production shape intact.
create table if not exists public.community_submissions(id uuid primary key,content_type text not null,data jsonb not null default '{}',reviewed_by uuid,reviewed_at timestamptz);
grant select,insert,update on public.community_submissions to service_role;
insert into auth.users(id) values('ffffffff-0000-4000-8000-000000000001');
insert into public.email_templates(template_key,name,subject,html_content) values('email-platform-test','Email platform test','Hello','<p>Hello</p>');
set local role service_role;
do $$
declare r public.email_outbox; c public.email_outbox; n integer; sid uuid; out boolean;
begin
 r:=public.email_enqueue('test:1','person@example.com','{"category":"transactional","to":"person@example.com","subject":"Hello"}'::jsonb,'email-platform-test');
 c:=public.email_enqueue('test:1','person@example.com',r.payload,'email-platform-test');
 assert c.id=r.id,'same key must produce same message';
 insert into public.community_submissions(id,content_type,data) values('eeeeeeee-0000-4000-8000-000000000001','feedback','{"title":"Preserve me","replies":[{"email_id":"cf-test","body":"First reply"}]}');
 begin
  perform public.email_enqueue('test:1','other@example.com','{"category":"transactional","to":"other@example.com"}'::jsonb);
  raise exception 'changed payload accepted';
 exception when raise_exception then assert sqlerrm='email_idempotency_conflict'; end;
 begin
  perform public.email_enqueue('marketing','person@example.com','{"category":"marketing","to":"person@example.com"}'::jsonb);
  raise exception 'marketing accepted';
 exception when raise_exception then assert sqlerrm='cloudflare_transactional_only'; end;
 select * into c from public.email_claim(1,r.id);
 assert c.attempts=1 and c.lease_id is not null;
 select count(*) into n from public.email_claim(1,r.id);assert n=0,'active lease claimed twice';
 assert not public.email_finish(r.id,gen_random_uuid(),'accepted','wrong'),'stale lease accepted';
 perform public.email_record_event('event-1','cf-test','person@example.com','delivered',now());
 assert public.email_finish(r.id,c.lease_id,'accepted','cf-test');
 select * into r from public.email_outbox where id=r.id;
 assert r.status='delivered','early event lost';
 assert (select data->'replies'->0->>'delivered_at' is not null from public.community_submissions where id='eeeeeeee-0000-4000-8000-000000000001'),'feedback delivery chip missing';
 assert public.email_append_feedback_reply('eeeeeeee-0000-4000-8000-000000000001','{"id":"new-reply","body":"Second reply"}',null,now());
 assert not public.email_append_feedback_reply('eeeeeeee-0000-4000-8000-000000000001','{"id":"new-reply","body":"Second reply"}',null,now());
 assert (select jsonb_array_length(data->'replies')=2 and data->>'title'='Preserve me' and data->'replies'->0->>'delivered_at' is not null from public.community_submissions where id='eeeeeeee-0000-4000-8000-000000000001'),'append clobbered concurrent delivery state';
 perform public.email_record_event('event-2','cf-test','person@example.com','deferred',now()+interval '1 second');
 select * into r from public.email_outbox where id=r.id;
 assert r.status='delivered','deferred event regressed terminal delivery';
 assert not public.email_record_event('event-1','cf-test','person@example.com','delivered',now()),'event replay not deduplicated';
 perform public.email_record_event('event-3','cf-test','person@example.com','complained',now());
 select * into r from public.email_outbox where id=r.id;assert r.status='complained';
 assert exists(select 1 from public.email_suppressions where email='person@example.com' and reason='complaint');
 r:=public.email_enqueue('test:suppressed','person@example.com','{"category":"transactional","to":"person@example.com"}'::jsonb);
 select count(*) into n from public.email_claim(1,r.id);assert n=0,'suppressed mailbox dispatched';
 select * into r from public.email_outbox where id=r.id;assert r.status='suppressed';
 r:=public.email_enqueue('test:uncertain','uncertain@example.com','{"category":"transactional","to":"uncertain@example.com"}'::jsonb);
 select * into c from public.email_claim(1,r.id);perform public.email_finish(r.id,c.lease_id,'uncertain',null,'provider_timeout');
 select count(*) into n from public.email_claim(1,r.id);assert n=0,'uncertain message resent';
 sid:=public.email_subscription_request('Subscriber@Example.com','ffffffff-0000-4000-8000-000000000001','en',array['newsletter'],'website','v1',repeat('a',64));
 assert sid is not null;
 assert (select user_id is null from public.email_subscribers where id=sid),'account attached before proving mailbox ownership';
 assert (select status='pending' from public.email_subscribers where id=sid);
 assert public.email_subscription_request('subscriber@example.com',null,'en',array['events'],'website','v1',repeat('b',64)) is null,'confirmation flood not throttled';
 assert public.email_subscription_consume(repeat('a',64),'confirm');
 assert not public.email_subscription_consume(repeat('a',64),'confirm'),'confirmation replay accepted';
 perform public.email_subscription_preferences('ffffffff-0000-4000-8000-000000000001',array['events'],'de',false);
 assert (select topics=array['events'] from public.email_subscribers where id=sid);
 insert into public.email_subscription_tokens(token_hash,subscriber_id,purpose,expires_at) values(repeat('c',64),sid,'unsubscribe',now()+interval '1 day');
 assert public.email_subscription_consume(repeat('c',64),'unsubscribe');
 assert public.email_subscription_consume(repeat('c',64),'unsubscribe'),'one-click unsubscribe is not idempotent';
 assert (select status='unsubscribed' from public.email_subscribers where id=sid);
 assert (select count(*)=4 from public.email_consent_events where subscriber_id=sid),'consent events missing or duplicated';
 assert not public.email_subscription_consume(repeat('c',64),'confirm'),'token purpose not enforced';
 -- An existing anonymous subscription can be claimed by an account only after
 -- a fresh confirmation, without changing active consent before that proof.
 sid:=public.email_subscription_request('anon@example.com',null,'en',array['newsletter'],'website','v1',repeat('d',64));
 assert public.email_subscription_consume(repeat('d',64),'confirm');
 update public.email_subscribers set confirmation_sent_at=now()-interval '10 minutes' where id=sid;
 assert public.email_subscription_request('anon@example.com','ffffffff-0000-4000-8000-000000000001','de',array['events'],'account_settings','v2',repeat('e',64))=sid;
 assert (select user_id is null and topics=array['newsletter'] and consent_version='v1' from public.email_subscribers where id=sid),'unproved account altered active consent';
 assert public.email_subscription_consume(repeat('e',64),'confirm');
 assert (select user_id='ffffffff-0000-4000-8000-000000000001'::uuid and topics=array['events'] and consent_version='v2' from public.email_subscribers where id=sid),'confirmed preferences or account not attached';
 assert public.email_audience_count('events','de')=1;
 assert public.email_audience_count('newsletter',null)=0;
 r:=public.email_enqueue('test:daily-quota','quota@example.com','{"category":"transactional","to":"quota@example.com"}'::jsonb);
 select * into c from public.email_claim(1,r.id);
 assert public.email_finish(r.id,c.lease_id,'queued',null,'E_DAILY_LIMIT_EXCEEDED',86400);
 assert (select available_at>=now()+interval '23 hours' from public.email_outbox where id=r.id),'daily quota delay ignored';
 sid:=public.email_subscription_request('atomic@example.com',null,'en',array['newsletter'],'website','v1',repeat('f',64),
  '{"category":"transactional","to":"atomic@example.com","subject":"Confirm","html":"<p>Confirm</p>","text":"Confirm"}'::jsonb,'atomic-confirm');
 assert exists(select 1 from public.email_subscription_tokens where subscriber_id=sid and used_at is null);
 assert exists(select 1 from public.email_outbox where idempotency_key='atomic-confirm' and expires_at>now()),'confirmation was not queued with consent';
 begin
  perform public.email_subscription_request('rollback@example.com',null,'en',array['newsletter'],'website','v1',repeat('1',64),'{"category":"marketing","to":"rollback@example.com"}'::jsonb,'bad-confirm');
  raise exception 'invalid confirmation accepted';
 exception when raise_exception then assert sqlerrm='cloudflare_transactional_only'; end;
 assert not exists(select 1 from public.email_subscribers where email='rollback@example.com'),'failed queue insert left a token/subscriber behind';
 update public.email_outbox set expires_at=now()-interval '1 minute' where idempotency_key='atomic-confirm';
 select count(*) into n from public.email_claim(1,(select id from public.email_outbox where idempotency_key='atomic-confirm'));
 assert n=0,'expired confirmation dispatched';


end $$;
reset role;
do $$
declare f record; t text;
begin
 foreach t in array array['email_subscribers','email_subscription_tokens','email_consent_events','email_campaigns','email_outbox','email_delivery_events','email_suppressions'] loop
  assert not has_table_privilege('anon','public.'||t,'SELECT'),'anonymous table exposure';
  assert not has_table_privilege('authenticated','public.'||t,'UPDATE'),'member table write exposure';
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'RLS missing';
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'email_%' loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE'),'anonymous RPC exposure';
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE'),'member RPC exposure';
 end loop;
end $$;
rollback;
