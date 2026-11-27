-- All data is synthetic and transactional; run only on disposable PostgreSQL.
begin;
insert into auth.users(id) select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,9) n;
insert into public.profiles(user_id,is_test_account) select id, id::text like '%000009' from auth.users;
insert into public.geo_places(id,name) values('20000000-0000-4000-8000-000000000001','Test city');
insert into public.travel_meet_plans(id,owner_id,city_id,title,activity,host_kind,start_date,end_date)
values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fixture invitation','coffee','traveller',current_date,current_date);
insert into public.conversations(id) select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(2,9) n;
insert into public.travel_meet_requests(id,plan_id,requester_id,status,conversation_id,created_at,responded_at)
select ('50000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000001',
 ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 case when n in (2,3,6,7,9) then 'accepted' else 'pending' end,
 ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 now()-interval '2 days',now()-interval '1 day' from generate_series(2,9) n;
-- 2: host sends after acceptance; 3: existing conversation history only;
-- 4: pending; 5: browse only; 6: no browsing consent; 7: request before browse;
-- 8: browse + fabricated reference to somebody else's request; 9: test account.
insert into public.user_events(user_id,event_type,metadata,created_at)
select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 'travel_meet_browse','{"surface":"meet_travel"}',now()-interval '3 days'
 from generate_series(2,9) n where n<>6;
insert into public.user_events(user_id,event_type,entity_type,entity_id,metadata,created_at)
select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 'travel_meet_request','travel_request',('50000000-0000-4000-8000-' || lpad(n::text,12,'0')),
 '{"surface":"meet_travel"}',now()-interval '2 days' from generate_series(2,9) n where n<>5;
update public.user_events set created_at=now()-interval '4 days' where event_type='travel_meet_request' and user_id::text like '%000007';
update public.user_events set entity_id='50000000-0000-4000-8000-000000000002' where event_type='travel_meet_request' and user_id::text like '%000008';
insert into public.messages(conversation_id,sender_id,created_at)
values('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',now()-interval '12 hours'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',now()-interval '2 days');
-- Malformed analytics references cannot break the report.
insert into public.user_events(user_id,event_type,entity_type,entity_id,metadata,created_at)
values('10000000-0000-4000-8000-000000000005','travel_meet_request','travel_request','not-a-uuid','{"surface":"meet_travel"}',now());
-- Repeated browsing, requests and messages must not inflate unique travellers.
insert into public.user_events(user_id,event_type,entity_type,entity_id,metadata,created_at)
select user_id,event_type,entity_type,entity_id,metadata,created_at from public.user_events;
insert into public.messages(conversation_id,sender_id,created_at)
select conversation_id,sender_id,created_at from public.messages;
-- Deleted and system messages, and unrelated senders, never complete the funnel.
insert into public.messages(conversation_id,sender_id,created_at,deleted_at,message_type)
values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',now(),now(),'text'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',now(),null,'system'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000008',now(),null,'text');
-- A different accepted request by the pending requester must not supply its acceptance.
insert into public.travel_meet_plans(id,owner_id,city_id,title,activity,host_kind,start_date,end_date)
values('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Another invitation','coffee','traveller',current_date,current_date);
insert into public.travel_meet_requests(id,plan_id,requester_id,status,conversation_id,created_at,responded_at)
values('50000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','accepted','40000000-0000-4000-8000-000000000002',now()-interval '2 days',now()-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin perform public.travel_meet_funnel_summary(); raise exception 'nonadmin accessed report';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.is_admin','true',true);
do $$ declare r jsonb; begin
  r:=public.travel_meet_funnel_summary(7);
  if r->>'browsed'<>'6' or r->>'requested'<>'3' or r->>'accepted'<>'2' or r->>'started'<>'1' then
    raise exception 'Wrong funnel: %',r;
  end if;
  if r->>'browse_to_request_pct'<>'50.0' or r->>'accept_to_conversation_pct'<>'50.0' then raise exception 'Wrong rates: %',r; end if;
  begin perform public.travel_meet_funnel_summary(365); raise exception 'unbounded window accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.travel_meet_funnel_summary(null); raise exception 'null window accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Window selection applies to the complete cohort, not just to request counts.
update public.user_events set created_at=created_at-interval '8 days';
update public.travel_meet_requests set created_at=created_at-interval '8 days',responded_at=responded_at-interval '8 days';
update public.messages set created_at=created_at-interval '8 days';
set local role authenticated;
do $$ declare r jsonb; begin
  r:=public.travel_meet_funnel_summary(7);
  if r->>'browsed'<>'0' then raise exception 'Window did not filter cohort: %',r; end if;
  r:=public.travel_meet_funnel_summary(30);
  if r->>'browsed'<>'6' or r->>'started'<>'1' then raise exception 'Larger window lost cohort: %',r; end if;
end $$;
reset role;
-- No browsing = no eligible cohort, regardless of operational activity.
delete from public.user_events;
set local role authenticated;
do $$ declare r jsonb; begin
  r:=public.travel_meet_funnel_summary(30);
  if r->>'browsed'<>'0' or r->>'started'<>'0' or r->>'browse_to_request_pct' is not null then raise exception 'Empty funnel: %',r; end if;
  if has_function_privilege('anon','public.travel_meet_funnel_summary(integer)','execute') then raise exception 'anon execution granted'; end if;
  if has_function_privilege('anon','travel_meet_private.funnel_summary(integer)','execute') then raise exception 'anon private execution granted'; end if;
end $$;
rollback;
