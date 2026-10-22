begin;
insert into auth.users(id,email) values('a4444444-0000-4000-8000-000000000001','policy@example.com');
insert into public.profiles(user_id,display_name) values('a4444444-0000-4000-8000-000000000001','Member');
insert into public.conversations(id) values('b4444444-0000-4000-8000-000000000001');
insert into public.conversation_participants(user_id,conversation_id,last_read_at)
values('a4444444-0000-4000-8000-000000000001','b4444444-0000-4000-8000-000000000001',now()-interval '1 day');
insert into public.notifications(user_id,type,related_id,created_at)
values('a4444444-0000-4000-8000-000000000001','dm','b4444444-0000-4000-8000-000000000001',now()-interval '3 hours');
set local role service_role;
do $$
declare u uuid:='a4444444-0000-4000-8000-000000000001'; p jsonb; o public.email_outbox; second public.email_outbox; essential public.email_outbox; lease uuid; n integer;
 payload jsonb:='{"category":"transactional","from":"Queer Guide <hello@queer.guide>","to":"policy@example.com","subject":"Unread message","html":"<p>Open your inbox</p>","text":"Open your inbox","headers":{}}';
begin
 assert (public.email_delivery_preferences_get(u)->>'version')::integer=0;
 assert not (public.email_delivery_preferences_get(u)->>'dm_digest_enabled')::boolean,'implicit opt-in';
 assert not exists(select 1 from public.dm_digest_candidates());
 begin
  perform public.email_delivery_preferences_save(u,true,'Not/AZone',false,22,8,0);
  raise exception 'unknown zone accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.email_delivery_preferences_save(u,true,'Etc/UTC',true,8,8,0);
  raise exception 'empty quiet window accepted';
 exception when invalid_parameter_value then null; end;
 p:=public.email_delivery_preferences_save(u,true,'Europe/Zurich',true,1,3,0);
 assert (p->>'version')::integer=1;
 begin
  perform public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,0);
  raise exception 'stale save accepted';
 exception when serialization_failure then null; end;
 -- Spring-forward gap and both repeated autumn 02:30 wall times.
 assert public.email_delivery_is_quiet(u,'2026-03-29 00:30Z');
 assert not public.email_delivery_is_quiet(u,'2026-03-29 01:30Z');
 assert public.email_delivery_is_quiet(u,'2026-10-25 00:30Z');
 assert public.email_delivery_is_quiet(u,'2026-10-25 01:30Z');
 assert not public.email_delivery_is_quiet(u,'2026-10-25 02:00Z');
 p:=public.email_delivery_preferences_save(u,true,'Etc/UTC',true,22,8,1);
 assert public.email_delivery_is_quiet(u,'2026-10-20 23:00Z');
 assert public.email_delivery_is_quiet(u,'2026-10-20 07:59Z');
 assert not public.email_delivery_is_quiet(u,'2026-10-20 08:00Z');
 p:=public.email_delivery_preferences_save(u,true,'Etc/UTC',false,22,8,2);
 assert public.email_dm_unread_count(u)=1;
 assert exists(select 1 from public.dm_digest_candidates() where user_id=u and latest_title is null and latest_preview is null);
 update public.conversation_participants set is_muted=true where user_id=u;
 assert public.email_dm_unread_count(u)=0,'muted conversation counted';
 update public.conversation_participants set is_muted=false,last_read_at=now() where user_id=u;
 assert public.email_dm_unread_count(u)=0,'already read activity counted';
 update public.conversation_participants set last_read_at=now()-interval '1 day' where user_id=u;
 o:=public.email_enqueue('policy-first','policy@example.com',payload,'dm_digest',null,u);
 assert o.expires_at<=now()+interval '24 hours','activity never expires';
 select lease_id into lease from public.email_claim(1,o.id);
 assert lease is not null;
 assert public.email_dispatch_authorize(o.id,lease);
 assert public.email_dispatch_authorize(o.id,lease),'same identity lost reservation';
 second:=public.email_enqueue('policy-second','policy@example.com',payload,'dm_digest',null,u);
 assert not exists(select 1 from public.email_claim(1,second.id)),'daily budget not held';
 assert (select attempts=0 from public.email_outbox where id=second.id);
 -- Simulate a second claimant acquired before the first reserved the budget.
 update public.email_outbox set status='processing',lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes' where id=second.id returning lease_id into lease;
 assert not public.email_dispatch_authorize(second.id,lease),'parallel identity passed daily budget';
 update public.email_outbox set status='queued',lease_id=null,leased_until=null where id=second.id;
 essential:=public.email_enqueue('policy-essential','policy@example.com',payload,'welcome',null,u);
 select lease_id into lease from public.email_claim(1,essential.id);
 assert public.email_dispatch_authorize(essential.id,lease),'activity budget blocked essential mail';
 -- Quiet hours: hold without attempts; test using a timezone whose current local
 -- hour is inside a two-hour interval (deterministic regardless of test run time).
 delete from public.email_activity_reservations where user_id=u;
 p:=public.email_delivery_preferences_save(u,true,'Etc/UTC',true,extract(hour from now() at time zone 'UTC')::integer,(extract(hour from now() at time zone 'UTC')::integer+2)%24,3);
 assert public.email_activity_message_reason(second.id)='activity_quiet_hours';
 assert not exists(select 1 from public.email_claim(1,second.id));
 assert (select attempts=0 from public.email_outbox where id=second.id);
 p:=public.email_delivery_preferences_save(u,true,'Etc/UTC',false,22,8,4);
 select lease_id into lease from public.email_claim(1,second.id);
 perform public.email_fixture_change_mailbox(u,'changed@example.com');
 assert not public.email_dispatch_authorize(second.id,lease),'old primary address sent';
 perform public.email_fixture_change_mailbox(u,'policy@example.com');
 update public.notifications set read=true where user_id=u;
 assert not public.email_dispatch_authorize(second.id,lease),'read source sent';
 update public.notifications set read=false where user_id=u;
 delete from public.conversation_participants where user_id=u;
 assert not public.email_dispatch_authorize(second.id,lease),'former participant sent';
 insert into public.conversation_participants(user_id,conversation_id,last_read_at) values(u,'b4444444-0000-4000-8000-000000000001',now()-interval '1 day');
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,5);
 assert not public.email_dispatch_authorize(second.id,lease),'opt-out after claim ignored';
 -- Keep a live lease intact so an already submitted receipt can be recorded.
 perform public.email_claim(1,second.id);
 assert (select status='processing' and activity_cancelled_at is not null from public.email_outbox where id=second.id);
 update public.email_outbox set leased_until=now()-interval '1 second' where id=second.id;
 perform public.email_claim(1,second.id);
 assert (select status='suppressed' and last_error='activity_email_disabled' from public.email_outbox where id=second.id);
 p:=public.email_delivery_preferences_save(u,true,'Etc/UTC',false,22,8,6);
 second:=public.email_enqueue('policy-expired','policy@example.com',payload,'dm_digest',null,u);
 select lease_id into lease from public.email_claim(1,second.id);
 update public.email_outbox set expires_at=now()-interval '1 second',leased_until=now()-interval '1 second' where id=second.id;
 assert not exists(select 1 from public.email_claim(1,second.id));
 assert (select status='uncertain' and last_error='activity_expired_after_claim' from public.email_outbox where id=second.id);
 assert jsonb_array_length(public.email_export_for_user(u)->'delivery_preference_events')=7;
 perform public.email_erase_account(u);
 assert not exists(select 1 from public.email_delivery_preferences where user_id=u);
 assert not exists(select 1 from public.email_delivery_preference_events where user_id=u);
 assert not exists(select 1 from public.email_activity_reservations where user_id=u);
 begin
  perform public.email_delivery_preferences_save(u,true,'Etc/UTC',false,22,8,0);
  raise exception 'erased account reenabled email';
 exception when invalid_parameter_value then null; end;
 assert not has_table_privilege('authenticated','public.email_delivery_preferences','select');
 assert not has_table_privilege('anon','public.email_activity_reservations','select');
 assert not has_function_privilege('authenticated','public.email_delivery_preferences_save(uuid,boolean,text,boolean,integer,integer,integer,boolean,boolean,text[])','execute');
 assert not has_function_privilege('anon','public.dm_digest_candidates(integer)','execute');
end $$;
reset role;
rollback;
