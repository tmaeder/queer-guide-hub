begin;
insert into auth.users(id,email) values
 ('a6666666-0000-4000-8000-000000000001','trip-owner@example.com'),
 ('b6666666-0000-4000-8000-000000000001','trip-guest@example.com'),
 ('c6666666-0000-4000-8000-000000000001','trip-editor@example.com');
insert into public.profiles(user_id,username,display_name) values
 ('a6666666-0000-4000-8000-000000000001','trip_owner','Private owner name'),
 ('b6666666-0000-4000-8000-000000000001','trip_guest','Private guest name'),
 ('c6666666-0000-4000-8000-000000000001','trip_editor','Private editor name');
insert into public.trips(id,owner_id,title) values('d6666666-0000-4000-8000-000000000001','a6666666-0000-4000-8000-000000000001','Private destination and dates');
insert into public.trip_members(trip_id,user_id,role,accepted_at) values
 ('d6666666-0000-4000-8000-000000000001','a6666666-0000-4000-8000-000000000001','owner',now()),
 ('d6666666-0000-4000-8000-000000000001','c6666666-0000-4000-8000-000000000001','editor',now());
set local role service_role;
do $$
declare a uuid:='a6666666-0000-4000-8000-000000000001'; u uuid:='b6666666-0000-4000-8000-000000000001'; c uuid:='c6666666-0000-4000-8000-000000000001';
 t uuid:='d6666666-0000-4000-8000-000000000001'; i uuid; old_i uuid; m uuid; actor_m uuid; p jsonb; result jsonb; o public.email_outbox; lease uuid;
 payload jsonb:='{"category":"transactional","from":"Queer Guide <hello@queer.guide>","to":"trip-guest@example.com","subject":"New trip invitation on Queer Guide","html":"<p>Sign in to review invitations</p>","text":"Sign in to review invitations","headers":{}}';
begin
 assert not (public.email_delivery_preferences_get(u)->>'trip_invites_enabled')::boolean;
 begin
  perform public.trip_invitation_create(u,t,'trip_editor','viewer');
  raise exception 'outsider invited member';
 exception when insufficient_privilege then null; end;
 begin
  perform public.trip_invitation_create(a,t,'trip_guest','owner');
  raise exception 'owner role invitation accepted';
 exception when invalid_parameter_value then null; end;
 insert into public.trip_invitation_rate_limits values(a,date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC',20);
 begin
  perform public.trip_invitation_create(a,t,'trip_guest','viewer');
  raise exception 'hourly quota bypassed';
 exception when invalid_parameter_value then null; end;
 assert not exists(select 1 from public.trip_member_invitations);
 assert not exists(select 1 from public.trip_members where trip_id=t and user_id=u),'quota failure left membership';
 delete from public.trip_invitation_rate_limits where user_id=a;
 i:=public.trip_invitation_create(a,t,'trip_guest','viewer');
 assert public.trip_invitation_current(i);
 assert (select count(*)=1 from public.trip_member_invitations);
 assert not exists(select 1 from public.email_trip_invitation_candidates()),'implicit email enrollment';
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,0,false,true);
 assert not exists(select 1 from public.email_trip_invitation_candidates()),'opt-in backfilled email';
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,1);
 assert (p->>'trip_invites_enabled')::boolean,'old client disabled new preference';
 assert public.trip_invitation_create(a,t,'trip_guest','viewer')=i,'retry recreated invitation';
 assert (select sum(invitations)=1 from public.trip_invitation_rate_limits where user_id=a),'replay spent invitation budget';
 begin
  perform public.trip_invitation_respond(c,i,'accept');
  raise exception 'other account accepted';
 exception when insufficient_privilege then null; end;
 result:=public.trip_invitation_respond(u,i,'decline');
 assert result->>'status'='declined';
 assert (public.trip_invitation_respond(u,i,'decline'))->>'status'='declined';
 assert not exists(select 1 from public.trip_members where trip_id=t and user_id=u),'decline kept access';
 old_i:=i;
 i:=public.trip_invitation_create(c,t,'TRIP_GUEST','viewer');
 assert i<>old_i and public.trip_invitation_current(i);
 assert (select count(*)=1 from public.email_trip_invitation_candidates());
 assert (public.trip_invitation_list(u)->'invitations'->0->>'id')::uuid=i;
 assert jsonb_array_length(public.trip_invitation_list(a)->'invitations')=0,'recipient list leaked others';
 assert not (public.trip_invitation_list(u,t)->>'can_invite')::boolean,'pending recipient could invite';
 select membership_id,inviter_membership_id into m,actor_m from public.trip_member_invitations where id=i;
 -- Raw pending-member updates cannot self-escalate or accept a revoked/expired source.
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin
  update public.trip_members set role='editor',accepted_at=now() where id=m;
  raise exception 'recipient changed invited role';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin
  update public.trip_members set accepted_at=now() where id=m;
  raise exception 'inviter accepted on behalf of recipient';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 o:=public.email_trip_invitation_enqueue(i,payload);
 assert o.recipient_user_id=u and o.activity_source_id=i;
 assert (public.email_trip_invitation_enqueue(i,jsonb_set(payload,'{subject}','"Updated"'))).id=o.id;
 select lease_id into lease from public.email_claim(1,o.id);
 assert public.email_dispatch_authorize(o.id,lease);
 insert into public.user_relationships values(u,c,'block');
 assert not public.email_dispatch_authorize(o.id,lease),'block ignored';
 assert jsonb_array_length(public.trip_invitation_list(u)->'invitations')=0,'blocked invitation metadata leaked';
 delete from public.user_relationships;
 insert into public.user_relationships values(c,u,'block');
 assert not public.email_dispatch_authorize(o.id,lease),'reverse block ignored';
 delete from public.user_relationships;
 insert into public.user_relationships values(a,u,'block');
 assert not public.email_dispatch_authorize(o.id,lease),'owner block ignored';
 delete from public.user_relationships;
 update public.trips set status='archived' where id=t;
 assert not public.email_dispatch_authorize(o.id,lease),'archived trip sent';
 update public.trips set status='planning' where id=t;
 update auth.users set email='changed-trip@example.com' where id=u;
 assert not public.email_dispatch_authorize(o.id,lease),'stale mailbox sent';
 assert (public.email_trip_invitation_enqueue(i,jsonb_set(payload,'{to}','"changed-trip@example.com"'))).id=o.id,'address change resent invite';
 update auth.users set email='trip-guest@example.com' where id=u;
 update public.trip_members set accepted_at=null where id=actor_m;
 assert not public.email_dispatch_authorize(o.id,lease),'pending inviter granted access';
 update public.trip_members set accepted_at=now() where id=actor_m;
 assert public.email_dispatch_authorize(o.id,lease);
 result:=public.trip_invitation_respond(u,i,'accept');
 assert result->>'status'='accepted';
 assert (public.trip_invitation_respond(u,i,'accept'))->>'status'='accepted';
 assert not public.email_dispatch_authorize(o.id,lease),'accepted invitation still sent';
 assert (select accepted_at is not null and role='viewer' from public.trip_members where id=m);
 assert not public.trip_invitation_revoke(c,i),'revoke removed accepted access';
 -- Explicit fresh invite after removing an old membership gets a new identity.
 delete from public.trip_members where id=m;
 old_i:=i;
 i:=public.trip_invitation_create(a,t,'trip_guest','editor');
 assert i<>old_i;
 update public.trip_member_invitations set expires_at=now()-interval '1 second' where id=i;
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin
  update public.trip_members set accepted_at=now() where id=(select membership_id from public.trip_member_invitations where id=i);
  raise exception 'raw acceptance revived expired invitation';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 old_i:=i;
 i:=public.trip_invitation_create(a,t,'trip_guest','editor');
 assert i<>old_i and public.trip_invitation_current(i),'expired invite did not renew explicitly';
 assert public.trip_invitation_revoke(a,i);
 assert public.trip_invitation_revoke(a,i),'revoke not idempotent';
 assert not public.trip_invitation_current(i);
 i:=public.trip_invitation_create(a,t,'trip_guest','viewer');
 o:=public.email_trip_invitation_enqueue(i,payload);
 update public.email_outbox set status='queued',attempts=0 where id=o.id;
 delete from public.email_activity_reservations where user_id=u;
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',true,extract(hour from now() at time zone 'UTC')::integer,(extract(hour from now() at time zone 'UTC')::integer+2)%24,2,false,true);
 assert not exists(select 1 from public.email_claim(1,o.id));
 assert (select attempts=0 from public.email_outbox where id=o.id);
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,3,false,false);
 perform public.email_claim(1,o.id);
 assert (select status='suppressed' and activity_cancelled_at is not null from public.email_outbox where id=o.id),'opt-out ignored';
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,4,false,true);
 assert (select email_requested and email_cancelled from public.trip_member_invitations where id=i),'opt-back-in revived old invitation mail or lost original consent proof';
 assert public.email_activity_message_reason(o.id) is not null,'cancelled snapshot became sendable';
 assert jsonb_array_length(public.email_export_for_user(u)->'trip_invitations')>0;
 perform public.email_erase_account(a);
 assert not exists(select 1 from public.trip_member_invitations where inviter_user_id=a),'inviter erasure left invitations';
 assert not exists(select 1 from public.trip_invitation_rate_limits where user_id=a),'inviter erasure left quota metadata';
 assert not public.trip_invitation_current(i);
 perform public.email_erase_account(u);
 assert not exists(select 1 from public.trip_member_invitations where user_id=u);
 assert (select erased_at is not null and activity_source_id is null from public.email_outbox where id=o.id);
 assert not has_table_privilege('authenticated','public.trip_member_invitations','select');
 assert not has_function_privilege('authenticated','public.trip_invitation_create(uuid,uuid,text,text)','execute');
 update public.admin_automations set enabled=false where slug='email_trip_invitations';
 perform public.run_email_trip_invitations();
end $$;
reset role;
rollback;
