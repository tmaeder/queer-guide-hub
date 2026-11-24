-- Lifecycle and authorization contracts. Run after the migration in a disposable DB.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
create function pg_temp.assert_throws(statement text, message text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'FAIL (expected rejection): %', message;
end $$;
create temp table meet_test_ids(name text primary key, id uuid);
grant all on meet_test_ids to authenticated;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into public.profiles(user_id, display_name) select id, 'Test member' from auth.users where id::text like '10000000%';
insert into public.geo_places(id, name, place_type) values ('20000000-0000-4000-8000-000000000001','Country','country'),('20000000-0000-4000-8000-000000000002','Restricted','country');
insert into public.geo_country_profiles(place_id, lgbti_criminalization) values
  ('20000000-0000-4000-8000-000000000001','{"legal":true,"death_penalty":"no"}'),
  ('20000000-0000-4000-8000-000000000002','{"legal":false,"death_penalty":"yes"}');
insert into public.geo_places(id, name, place_type, country_id) values
  ('30000000-0000-4000-8000-000000000001','City','city','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','Restricted city','city','20000000-0000-4000-8000-000000000002');
insert into public.trips(id,owner_id,status,primary_city_id,primary_country_id,start_date,end_date,is_public) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','planning','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', current_date+1,current_date+5,false);
insert into public.events(id,title,slug,city_id,status,start_date,end_date) values
  ('50000000-0000-4000-8000-000000000001','An existing event','existing-event','30000000-0000-4000-8000-000000000001','published',current_date+2,current_date+2);

set local role anon;
select pg_temp.assert_throws($$select public.travel_meet_list(null,null,null,'')$$,'anonymous listing');
select pg_temp.assert_throws($$select * from public.travel_meet_plans$$,'anonymous raw profiles');
select pg_temp.assert_throws($$select public.travel_meet_action('create','{}')$$,'anonymous publishing');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_throws($$select travel_meet_private.city_allowed(null)$$,'private helper is not client callable');
insert into meet_test_ids select 'alert', (public.travel_meet_action('alert',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+1,'end_date',current_date+4))->>'id')::uuid;
select pg_temp.assert_true((select count(*) = 1 from public.travel_meet_alerts),'own alert RLS');
select pg_temp.assert_throws($$select public.travel_meet_action('create',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+2,'end_date',current_date+2,'title','Invalid trip access','activity','coffee','host_kind','traveller','trip_id','40000000-0000-4000-8000-000000000001'))$$,'foreign trip');
select pg_temp.assert_throws($$insert into public.travel_meet_plans(owner_id,city_id,title,activity,host_kind,start_date,end_date) values(auth.uid(),'30000000-0000-4000-8000-000000000001','Bypass','coffee','traveller',current_date+1,current_date+2)$$,'raw publishing bypass');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into meet_test_ids select 'plan', (public.travel_meet_action('create',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+2,'end_date',current_date+2,'title','Go to an event together','activity','event','host_kind','traveller','trip_id','40000000-0000-4000-8000-000000000001','event_id','50000000-0000-4000-8000-000000000001'))->>'id')::uuid;
select pg_temp.assert_true((select count(*) = 1 from public.travel_meet_plans),'own plan RLS');
select pg_temp.assert_true((select count(*) = 0 from public.travel_meet_alerts),'alerts of others hidden');
select pg_temp.assert_throws($$select public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))$$,'self request');
select pg_temp.assert_throws($$select public.travel_meet_action('create',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000002','start_date',current_date+2,'end_date',current_date+2,'title','Restricted destination','activity','coffee','host_kind','traveller'))$$,'restricted city');
select pg_temp.assert_throws($$select public.travel_meet_action('create',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+4,'end_date',current_date+4,'title','Wrong event dates','activity','event','host_kind','local','event_id','50000000-0000-4000-8000-000000000001'))$$,'event dates');
select pg_temp.assert_throws($$select public.travel_meet_action('alert',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date-1,'end_date',current_date+40))$$,'invalid dates');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.travel_meet_plans),'raw plans of others hidden');
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'')->'plans') = 1,'overlapping plan');
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+3,current_date+4,'')->'plans') = 0,'nonoverlapping dates');
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'coffee')->'plans') = 0,'activity filter');
select pg_temp.assert_true(not ((public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'')->'plans'->0) ? 'trip_id'),'private trip ID redacted');
insert into meet_test_ids select 'request', (public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))->>'id')::uuid;
select pg_temp.assert_true((public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))->>'id')::uuid = (select id from meet_test_ids where name='request'),'idempotent request');
select pg_temp.assert_throws($$select public.travel_meet_action('accept',jsonb_build_object('id',(select id from meet_test_ids where name='request')))$$,'requester cannot accept');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*) = 0 from public.travel_meet_requests),'requests private');
select pg_temp.assert_throws($$select public.travel_meet_action('accept',jsonb_build_object('id',(select id from meet_test_ids where name='request')))$$,'third party cannot accept');
select pg_temp.assert_throws($$select public.travel_meet_action('cancel',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))$$,'third party cannot cancel');
reset role;
select pg_temp.assert_true((select count(*) = 0 from public.conversations),'no chat before acceptance');
select pg_temp.assert_true((select count(*) = 1 from public.notifications where title='A new travel invitation matches your alert'),'functional opted-in alert delivered');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into meet_test_ids select 'conversation', (public.travel_meet_action('accept',jsonb_build_object('id',(select id from meet_test_ids where name='request')))->>'conversation_id')::uuid;
select pg_temp.assert_true((public.travel_meet_action('accept',jsonb_build_object('id',(select id from meet_test_ids where name='request')))->>'conversation_id')::uuid = (select id from meet_test_ids where name='conversation'),'accept retry reuses chat');
reset role;
select pg_temp.assert_true((select count(*) = 1 from public.conversations),'one existing-model direct chat');
select pg_temp.assert_true((select count(*) = 2 from public.conversation_participants),'both members added');
select pg_temp.assert_true((select not is_public from public.trips where id='40000000-0000-4000-8000-000000000001'),'trip remains private');

-- Legal changes take effect on reads and mutations, not just creation.
update public.geo_country_profiles set lgbti_criminalization='{"legal":false}' where place_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'')->'plans') = 0,'risk change hides plan');
select pg_temp.assert_throws($$select public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))$$,'risk change blocks request');
reset role;
update public.geo_country_profiles set lgbti_criminalization='{"legal":true}' where place_id='20000000-0000-4000-8000-000000000001';
insert into public.user_relationships values ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','block');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'')->'plans') = 0,'block hides plan');
select pg_temp.assert_throws($$select public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))$$,'blocked request');
reset role;
delete from public.user_relationships;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
insert into meet_test_ids select 'withdraw', (public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))->>'id')::uuid;
select public.travel_meet_action('withdraw',jsonb_build_object('id',(select id from meet_test_ids where name='withdraw')));
select pg_temp.assert_true((select status = 'withdrawn' from public.travel_meet_requests where id=(select id from meet_test_ids where name='withdraw')),'withdraw state');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_throws($$select public.travel_meet_action('accept',jsonb_build_object('id',(select id from meet_test_ids where name='withdraw')))$$,'withdrawn request cannot be accepted');
select public.travel_meet_action('cancel',jsonb_build_object('id',(select id from meet_test_ids where name='plan')));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date+1,current_date+4,'')->'plans') = 0,'cancel hides plan');
select public.travel_meet_action('remove_alert',jsonb_build_object('id',(select id from meet_test_ids where name='alert')));
select pg_temp.assert_true((select count(*) = 0 from public.travel_meet_alerts),'remove alert');
reset role;
-- Expiry does not depend on a cron job.
update public.travel_meet_plans set cancelled_at=null, start_date=current_date-2,end_date=current_date-1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(jsonb_array_length(public.travel_meet_list('30000000-0000-4000-8000-000000000001',current_date-2,current_date+4,'')->'plans') = 0,'expired hidden');
select pg_temp.assert_throws($$select public.travel_meet_action('request',jsonb_build_object('id',(select id from meet_test_ids where name='plan')))$$,'expired request');
reset role;
-- Safety is checked across the linked itinerary as well as the advertised city.
insert into public.trip_places(id, trip_id, country_id) values ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_throws($$select public.travel_meet_action('create',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+2,'end_date',current_date+2,'title','Unsafe secondary stop','activity','coffee','host_kind','traveller','trip_id','40000000-0000-4000-8000-000000000001'))$$,'secondary trip country gate');
reset role;
update public.geo_country_profiles set lgbti_criminalization='{}' where place_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_throws($$select public.travel_meet_action('alert',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+1,'end_date',current_date+2))$$,'unknown criminalisation gate');
reset role;
update public.geo_country_profiles set lgbti_criminalization='{"legal":true,"death_penalty":"No legal certainty"}' where place_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_throws($$select public.travel_meet_action('alert',jsonb_build_object('city_id','30000000-0000-4000-8000-000000000001','start_date',current_date+1,'end_date',current_date+2))$$,'possible death penalty gate');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_throws($$select public.travel_meet_list(null,null,null,'')$$,'missing actor denied even with authenticated role');
reset role;
rollback;
