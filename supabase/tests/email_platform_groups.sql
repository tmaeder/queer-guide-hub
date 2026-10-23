begin;
insert into auth.users(id,email) values
 ('a5555555-0000-4000-8000-000000000001','group-actor@example.com'),
 ('b5555555-0000-4000-8000-000000000001','group-member@example.com'),
 ('c5555555-0000-4000-8000-000000000001','group-outsider@example.com');
insert into public.community_groups(id) values('d5555555-0000-4000-8000-000000000001');
insert into public.group_memberships(id,group_id,user_id) values
 ('a5555555-0000-4000-8000-000000000002','d5555555-0000-4000-8000-000000000001','a5555555-0000-4000-8000-000000000001'),
 ('b5555555-0000-4000-8000-000000000002','d5555555-0000-4000-8000-000000000001','b5555555-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare a uuid:='a5555555-0000-4000-8000-000000000001'; u uuid:='b5555555-0000-4000-8000-000000000001';
 g uuid:='d5555555-0000-4000-8000-000000000001'; post uuid:='e5555555-0000-4000-8000-000000000001';
 event uuid; notice uuid; old_membership uuid; p jsonb; o public.email_outbox; legacy public.email_outbox; lease uuid; snapshot jsonb;
 v_mentions jsonb:='[{"user_id":"b5555555-0000-4000-8000-000000000001","username":"private"},{"user_id":"c5555555-0000-4000-8000-000000000001"},{"user_id":"not-a-uuid"}]';
 payload jsonb:='{"category":"transactional","from":"Queer Guide <hello@queer.guide>","to":"group-member@example.com","subject":"New group mention on Queer Guide","html":"<p>Open your groups</p>","text":"Open your groups","headers":{}}';
begin
 assert (select default_payload='{"action":"tick"}'::jsonb and not is_enabled from public.workflow_definitions where name='send-group-notifications'),'workflow contract update lost disabled state';
 update public.admin_automations set enabled=false where slug='email_group_mentions';
 -- The disabled path must return before resolving vault/net or making a request.
 perform public.run_email_group_mentions();
 update public.admin_automations set enabled=true where slug='email_group_mentions';
 assert not (public.email_delivery_preferences_get(u)->>'group_mentions_enabled')::boolean;
 insert into public.group_posts(group_id,user_id,mentions,content) values(g,a,v_mentions,'Private group content');
 assert not exists(select 1 from public.email_group_mentions),'preference created retroactive email';
 assert (select count(*)=1 from public.group_notifications where user_id=u),'in-app mention missing';
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,0,true);
 assert (p->>'group_mentions_enabled')::boolean;
 assert not exists(select 1 from public.email_group_mention_candidates()),'enabling email backfilled history';
 -- Old clients saving only DM settings must preserve the newer group switch.
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,1);
 assert (p->>'group_mentions_enabled')::boolean;
 insert into public.group_posts(id,group_id,user_id,mentions,content) values(post,g,a,v_mentions,'Private group content');
 select id,notification_id,membership_id into event,notice,old_membership from public.email_group_mentions where post_id=post;
 assert event is not null;
 assert (select count(*)=1 from public.email_group_mentions),'outsider/malformed target included';
 begin
  insert into public.group_posts(id,group_id,user_id,mentions,content) values('f5555555-0000-4000-8000-000000000001',g,a,v_mentions,'Rolled back');
  raise exception 'rollback fixture' using errcode='23514';
 exception when check_violation then null; end;
 assert not exists(select 1 from public.email_group_mentions where post_id='f5555555-0000-4000-8000-000000000001'),'source survived rollback';
 assert not exists(select 1 from public.group_notifications where related_post_id='f5555555-0000-4000-8000-000000000001'),'notification survived rollback';
 assert public.email_group_mention_current(event);
 update public.community_groups set archived_at=now() where id=g;
 assert not public.email_group_mention_current(event),'archived group remained sendable';
 update public.community_groups set archived_at=null,duplicate_of_id=gen_random_uuid() where id=g;
 assert not public.email_group_mention_current(event),'merged group remained sendable';
 update public.community_groups set duplicate_of_id=null where id=g;

 update public.group_posts set content='Edited private content',mentions=v_mentions where id=post;
 assert (select count(*)=1 from public.email_group_mentions),'unchanged update duplicated source';
 assert (select count(*)=1 from public.email_group_mention_candidates());
 update public.email_group_mentions set created_at=created_at-interval '25 hours' where id=event;
 assert not public.email_group_mention_current(event),'expired source remained eligible';
 update public.email_group_mentions set created_at=created_at+interval '25 hours' where id=event;
 o:=public.email_group_mention_enqueue(event,payload);
 assert o.recipient_user_id=u and o.activity_source_id=event;
 assert o.expires_at<=clock_timestamp()+interval '24 hours';
 assert (public.email_group_mention_enqueue(event,jsonb_set(payload,'{subject}','"Changed branding"'))).id=o.id,'retry changed identity';
 assert not exists(select 1 from public.email_group_mention_candidates()),'already queued source returned';
 select lease_id into lease from public.email_claim(1,o.id);
 assert lease is not null and public.email_dispatch_authorize(o.id,lease);
 assert public.email_dispatch_authorize(o.id,lease),'same identity retry denied';
 insert into public.user_relationships values(u,a,'block');
 assert not public.email_dispatch_authorize(o.id,lease),'recipient block ignored';
 delete from public.user_relationships;
 insert into public.user_relationships values(a,u,'block');
 assert not public.email_dispatch_authorize(o.id,lease),'author block ignored';
 delete from public.user_relationships;
 update public.group_notifications set read_at=now() where id=notice;
 assert not public.email_dispatch_authorize(o.id,lease),'read mention sent';
 update public.group_notifications set read_at=null,triggered_by_user_id=u where id=notice;
 assert not public.email_dispatch_authorize(o.id,lease),'mutable notification overrode author proof';
 update public.group_notifications set triggered_by_user_id=a where id=notice;
 update public.group_posts set mentions='[]' where id=post;
 assert not public.email_dispatch_authorize(o.id,lease),'withdrawn mention sent';
 update public.group_posts set mentions=v_mentions where id=post;
 assert (select count(*)=1 from public.email_group_mentions),'mention re-add replayed event';
 delete from public.group_memberships where id=old_membership;
 assert not public.email_dispatch_authorize(o.id,lease),'departed member sent';
 insert into public.group_memberships(group_id,user_id) values(g,u);
 assert not public.email_dispatch_authorize(o.id,lease),'rejoin revived old membership';
 update public.group_memberships set id=old_membership where group_id=g and user_id=u;
 assert public.email_dispatch_authorize(o.id,lease);
 perform public.email_fixture_change_mailbox(u,'group-changed@example.com');
 assert not public.email_dispatch_authorize(o.id,lease),'old mailbox sent';
 assert (public.email_group_mention_enqueue(event,jsonb_set(payload,'{to}','"group-changed@example.com"'))).id=o.id,'address change resent mention';
 perform public.email_fixture_change_mailbox(u,'group-member@example.com');
 -- A separate activity row cannot spend the same daily reservation.
 legacy:=public.email_enqueue('group-competing','group-member@example.com',payload,'dm_digest',null,u);
 assert public.email_activity_message_reason(legacy.id) is not null;
 delete from public.email_activity_reservations where user_id=u;
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',true,extract(hour from now() at time zone 'UTC')::integer,(extract(hour from now() at time zone 'UTC')::integer+2)%24,2,true);
 assert public.email_activity_message_reason(o.id)='activity_quiet_hours';
 update public.email_outbox set status='queued',lease_id=null,leased_until=null,attempts=0 where id=o.id;
 assert not exists(select 1 from public.email_claim(1,o.id));
 assert (select attempts=0 from public.email_outbox where id=o.id);
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,3,false);
 perform public.email_claim(1,o.id);
 assert (select status='suppressed' from public.email_outbox where id=o.id),'group opt-out ignored';
 assert (select email_cancelled from public.email_group_mentions where id=event),'group opt-out did not cancel source';
 legacy:=public.email_enqueue('group-legacy','group-member@example.com',jsonb_set(payload,'{from}','"Community Groups <noreply@queer.guide>"'),null,null,u);
 perform public.email_claim(1,legacy.id);
 assert (select status='suppressed' from public.email_outbox where id=legacy.id),'legacy unproved content remained sendable';
 snapshot:=public.email_export_for_user(u);
 assert jsonb_array_length(snapshot->'group_mention_events')=1;
 assert not (snapshot->'group_mention_events'->0 ? 'actor_user_id');
 assert not (snapshot->'group_mention_events'->0 ? 'content');
 perform public.email_erase_account(a);
 assert not exists(select 1 from public.email_group_mentions),'author erasure left source';
 assert not public.email_group_mention_current(event);
 -- Recipient erasure scrubs its new source link as well as the preference history.
 p:=public.email_delivery_preferences_save(u,false,'Etc/UTC',false,22,8,4,true);
 insert into public.group_memberships(group_id,user_id) values(g,'c5555555-0000-4000-8000-000000000001');
 insert into public.group_posts(group_id,user_id,mentions,content) values(g,'c5555555-0000-4000-8000-000000000001',v_mentions,'Private fixture');
 select id into event from public.email_group_mentions where user_id=u;
 o:=public.email_group_mention_enqueue(event,payload);
 perform public.email_erase_account(u);
 assert not exists(select 1 from public.email_group_mentions where user_id=u);
 assert (select activity_source_id is null and erased_at is not null from public.email_outbox where id=o.id);
 assert not has_table_privilege('authenticated','public.email_group_mentions','select');
 assert not has_function_privilege('authenticated','public.email_group_mention_enqueue(uuid,jsonb)','execute');
end $$;
reset role;
-- Owner-only DDL on the disposable fixture tests the earlier schema shape too.
alter table public.community_groups drop column archived_at;
set local role service_role;
do $$ begin
 assert public.email_group_available('d5555555-0000-4000-8000-000000000001'),'pre-archive-schema compatibility failed';
end $$;
reset role;
rollback;
