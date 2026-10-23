begin;
insert into auth.users(id,email) values
 ('77777777-0000-4000-8000-000000000001','group-inviter-fixture@example.com'),
 ('77777777-0000-4000-8000-000000000002','group-invitee-fixture@example.com'),
 ('77777777-0000-4000-8000-000000000003','group-other-fixture@example.com');
insert into public.community_groups(id) values('77777777-0000-4000-8000-000000000010');
insert into public.group_memberships(id,group_id,user_id) values('77777777-0000-4000-8000-000000000011','77777777-0000-4000-8000-000000000010','77777777-0000-4000-8000-000000000001');
revoke select on auth.users from service_role;
set local role service_role;
do $$
declare a uuid:='77777777-0000-4000-8000-000000000001';u uuid:='77777777-0000-4000-8000-000000000002';g uuid:='77777777-0000-4000-8000-000000000010';i uuid; n uuid; notification uuid; r jsonb; o public.email_outbox;lease uuid;mail_count bigint;
begin
 select count(*) into mail_count from public.email_outbox;
 assert not has_table_privilege('service_role','auth.users','SELECT');
 -- No retroactive email when enabling the setting after a source was created.
 insert into public.group_invites(group_id,invited_by,invited_user_id) values(g,a,u) returning id into i;
 assert not exists(select 1 from public.email_operational_notices where source_id=i);
 r:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,0,false,false,array['group_invitations','payments']);
 assert r->'operational_topics' @> '["group_invitations"]'::jsonb;
 assert not exists(select 1 from public.email_operational_notices where source_id=i);
 update public.group_invites set status='revoked' where id=i;
 -- An old client must preserve the new independent opt-in.
 r:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,1,false,false);
 assert r->'operational_topics' @> '["group_invitations"]'::jsonb;
 insert into public.group_invites(group_id,invited_by,invited_user_id) values(g,a,u) returning id into i;
 select id into n from public.email_operational_notices where source_id=i;
 assert n is not null and not public.email_notice_current(n),'invitation without notification became sendable';
 insert into public.group_notifications(group_id,user_id,notification_type,triggered_by_user_id) values(g,u,'group_invite',a) returning id into notification;
 assert public.email_notice_current(n),'valid unread invitation not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) where source_id=n);
 assert jsonb_array_length(public.email_group_invitation_review(u)->'invitations')=1;
 assert jsonb_array_length(public.email_group_invitation_review('77777777-0000-4000-8000-000000000003')->'invitations')=0,'review crossed owners';
 -- Review is independently useful without an email opt-in, and is bounded.
 insert into public.community_groups(id) select ('77777777-0000-4000-8000-'||lpad((100+x)::text,12,'0'))::uuid from generate_series(1,21) x;
 insert into public.group_memberships(group_id,user_id) select ('77777777-0000-4000-8000-'||lpad((100+x)::text,12,'0'))::uuid,a from generate_series(1,21) x;
 insert into public.group_invites(group_id,invited_by,invited_user_id) select ('77777777-0000-4000-8000-'||lpad((100+x)::text,12,'0'))::uuid,a,'77777777-0000-4000-8000-000000000003'::uuid from generate_series(1,21) x;
 r:=public.email_group_invitation_review('77777777-0000-4000-8000-000000000003');
 assert jsonb_array_length(r->'invitations')=20 and r->>'next' is not null,'review page unbounded';
 assert jsonb_array_length(public.email_group_invitation_review('77777777-0000-4000-8000-000000000003',(r->>'next')::uuid)->'invitations')=1,'review cursor skipped rows';
 assert public.email_export_for_user(u)->'group_invitation_sources'->0->>'invitation_id'=i::text;
 assert not (public.email_export_for_user(u)->'group_invitation_sources'->0 ? 'token'),'export exposed invitation token';
 begin
  update public.email_group_invitation_sources set actor_membership_id=gen_random_uuid() where notice_id=n;
  raise exception 'transport forged source proof';
 exception when insufficient_privilege then null; end;
 o:=public.email_notice_enqueue(n,'{"category":"transactional","to":"group-invitee-fixture@example.com"}');
 assert (public.email_notice_enqueue(n,'{"category":"transactional","to":"group-invitee-fixture@example.com"}')).id=o.id,'retry duplicated notice';
 select lease_id into lease from public.email_claim(1,o.id);
 assert public.email_dispatch_authorize(o.id,lease),'valid invitation not authorized';
 update public.group_notifications set read_at=now() where id=notification;
 assert not public.email_dispatch_authorize(o.id,lease),'read invitation sent';
 update public.group_notifications set read_at=null where id=notification;
 update public.group_invites set status='accepted',accepted_at=now(),accepted_by=u where id=i;
 assert not public.email_notice_current(n),'accepted invitation remained current';
 update public.group_invites set status='pending',accepted_at=null,accepted_by=null,expires_at=now()-interval '1 second' where id=i;
 assert not public.email_notice_current(n),'expired invitation remained current';
 update public.group_invites set expires_at=now()+interval '1 day' where id=i;
 update public.group_memberships set id=gen_random_uuid() where group_id=g and user_id=a;
 assert not public.email_notice_current(n),'inviter rejoin revived original invitation';
 update public.group_memberships set id='77777777-0000-4000-8000-000000000011' where group_id=g and user_id=a;
 insert into public.user_relationships(user_id,target_user_id,relationship_type) values(u,a,'block');
 assert not public.email_notice_current(n),'blocked invitation remained current';
 delete from public.user_relationships where user_id=u and target_user_id=a;
 update public.community_groups set archived_at=now() where id=g;
 assert not public.email_notice_current(n),'archived group remained current';
 update public.community_groups set archived_at=null where id=g;
 perform public.email_fixture_change_mailbox(u,'changed-group-invitee@example.com');
 assert not public.email_dispatch_authorize(o.id,lease),'stale mailbox sent';
 perform public.email_fixture_change_mailbox(u,'group-invitee-fixture@example.com');
 r:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,2,false,false,array['payments']);
 assert not public.email_notice_current(n),'opt-out did not cancel original invitation';
 r:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,3,false,false,array['group_invitations']);
 assert not public.email_notice_current(n),'re-opt-in revived cancelled invitation';
 -- Unowned free-text addresses and forged notification-only sources never mail.
 insert into public.group_invites(group_id,invited_by,email) values(g,a,'unowned@example.com') returning id into i;
 assert not exists(select 1 from public.email_operational_notices where source_id=i);
 insert into public.group_notifications(group_id,user_id,notification_type,triggered_by_user_id) values(g,'77777777-0000-4000-8000-000000000003','group_invite',a);
 assert not exists(select 1 from public.email_operational_notices where user_id='77777777-0000-4000-8000-000000000003');
 perform public.email_erase_account(a);
 assert not exists(select 1 from public.email_group_invitation_sources where actor_user_id=a),'sender erasure retained metadata';
 assert not exists(select 1 from public.email_operational_notices where id=n),'sender erasure retained source';
 assert (select count(*) from public.email_outbox)=mail_count+1,'source capture sent or duplicated email';
end $$;
reset role;
do $$ begin
 assert (select relrowsecurity from pg_class where oid='public.email_group_invitation_sources'::regclass);
 assert not has_table_privilege('anon','public.email_group_invitation_sources','SELECT');
 assert not has_table_privilege('authenticated','public.email_group_invitation_sources','SELECT');
 assert not has_function_privilege('anon','public.email_group_invitation_review(uuid,uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.email_group_invitation_review(uuid,uuid)','EXECUTE');
end $$;
rollback;
