begin;
insert into auth.users(id,email) values
 ('a2222222-0000-4000-8000-000000000001','lifecycle-a@example.com'),
 ('b2222222-0000-4000-8000-000000000001','lifecycle-b@example.com');
set local role service_role;
do $$
declare
 uid uuid:='a2222222-0000-4000-8000-000000000001';
 source uuid:='a2222222-0000-4000-8000-000000000002';
 parent uuid:='a2222222-0000-4000-8000-000000000003';
 sid uuid; n integer; eid uuid; exported jsonb;
begin
 assert (select count(*)=1 from public.email_lifecycle_events where user_id=uid and event_type='account.created');
 insert into public.profiles(user_id,display_name,username) values(uid,'PRIVATE_DISPLAY_NAME','PRIVATE_USERNAME');
 assert (select count(*)=1 from public.email_lifecycle_events where user_id=uid and event_type='profile.username.changed');
 update public.profiles set username=username where user_id=uid;
 assert (select count(*)=1 from public.email_lifecycle_events where user_id=uid and event_type='profile.username.changed'),'unchanged username emitted';
 insert into public.event_attendees(id,event_id,user_id,status) values(source,parent,uid,'interested');
 update public.event_attendees set status='going' where id=source;
 update public.event_attendees set status='going' where id=source;
 assert (select count(*)=2 from public.email_lifecycle_events where user_id=uid and event_type='event.rsvp.changed'),'RSVP changes not deduplicated';
 begin
  update public.event_attendees set status='not_going' where id=source;
  raise exception 'rollback_fixture';
 exception when raise_exception then assert sqlerrm='rollback_fixture'; end;
 assert (select status='going' from public.event_attendees where id=source);
 assert (select count(*)=2 from public.email_lifecycle_events where user_id=uid and event_type='event.rsvp.changed'),'rolled-back RSVP event persisted';
 delete from public.event_attendees where id=source;
 assert exists(select 1 from public.email_lifecycle_events where user_id=uid and event_type='event.rsvp.changed' and state='removed');
 insert into public.group_memberships(id,group_id,user_id) values(source,parent,uid);
 update public.group_memberships set role='moderator' where id=source;
 delete from public.group_memberships where id=source;
 insert into public.group_memberships(id,group_id,user_id) values(source,parent,uid);
 assert (select count(*)=3 from public.email_lifecycle_events where user_id=uid and event_type='group.membership.changed'),'rejoin transition lost or role update treated as join';
 insert into public.trip_members(id,trip_id,user_id,role) values(source,parent,uid,'editor');
 update public.trip_members set accepted_at=now() where id=source;
 update public.trip_members set accepted_at=now()+interval '1 day' where id=source;
 assert (select count(*)=2 from public.email_lifecycle_events where user_id=uid and event_type='trip.membership.changed'),'timestamp edit treated as second acceptance';
 delete from public.trip_members where id=source;
 assert (select count(*)=3 from public.email_lifecycle_events where user_id=uid and event_type='trip.membership.changed');
 eid:=public.email_emit_lifecycle_event('verified-replay',uid,'event.rsvp.changed',source,'going');
 assert public.email_emit_lifecycle_event('verified-replay',uid,'event.rsvp.changed',source,'going')=eid;
 begin
  perform public.email_emit_lifecycle_event('verified-replay',uid,'event.rsvp.changed',source,'not_going');
  raise exception 'changed replay accepted';
 exception when invalid_parameter_value then assert sqlerrm='email_lifecycle_identity_conflict'; end;
 begin
  perform public.email_emit_lifecycle_event('unsupported',uid,'private_message.read',source,'read');
  raise exception 'unsupported event accepted';
 exception when check_violation then null; end;
 begin
  perform public.email_emit_lifecycle_event('invalid-state',uid,'event.rsvp.changed',source,'purchased');
  raise exception 'invalid event state accepted';
 exception when check_violation then null; end;
 exported:=public.email_export_for_user(uid);
 assert jsonb_array_length(exported->'lifecycle_events')=12,'member lifecycle export missing events';
 assert exported::text not like '%PRIVATE_USERNAME%' and exported::text not like '%PRIVATE_DISPLAY_NAME%','profile text entered lifecycle metadata';
 assert exported::text not like '%verified-replay%','internal dedupe key exported';
 sid:=public.email_subscription_request('lifecycle-a@example.com',uid,'en',array['events'],'account_settings','v1',repeat('7',64));
 assert jsonb_array_length(public.email_contact_timeline(sid))=1,'unproved subscriber gained account timeline';
 assert public.email_subscription_consume(repeat('7',64),'confirm');
 assert jsonb_array_length(public.email_contact_timeline(sid))=14,'verified contact timeline missing lifecycle';
 assert jsonb_array_length(public.email_contact_timeline(sid,3))=3,'timeline limit ignored';
 begin
  perform public.email_segment_preview('{"event":"group.membership.changed","within_days":30,"min_count":1}');
  raise exception 'operational membership used as a marketing predicate';
 exception when invalid_parameter_value then null; end;
 perform public._delete_user_data_core(uid);
 assert not exists(select 1 from public.email_lifecycle_events where user_id=uid),'product erasure left lifecycle metadata';
 assert public.email_emit_lifecycle_event('stale-job',uid,'event.rsvp.changed',source,'going') is null,'disabled account recreated event';
 assert public.email_emit_lifecycle_event('missing-user','f2222222-0000-4000-8000-000000000001','account.created',source,'created') is null,'missing account recreated';
 assert exists(select 1 from public.email_lifecycle_events where user_id='b2222222-0000-4000-8000-000000000001'),'erasure removed another account events';
end $$;
reset role;
delete from auth.users where id='b2222222-0000-4000-8000-000000000001';
do $$ declare f record;
begin
 assert not exists(select 1 from public.email_lifecycle_events),'direct Auth deletion left lifecycle data';
 assert not has_table_privilege('anon','public.email_lifecycle_events','SELECT');
 assert not has_table_privilege('authenticated','public.email_lifecycle_events','INSERT');
 assert (select relrowsecurity from pg_class where oid='public.email_lifecycle_events'::regclass);
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('email_emit_lifecycle_event','email_export_for_user','email_contact_timeline','email_export_before_lifecycle','email_contact_timeline_before_lifecycle') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE');
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
 assert not has_function_privilege('authenticated','email_private.capture_lifecycle_event()','EXECUTE');
end $$;
rollback;
