begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('77777777-0000-4000-8000-000000000001','domain-recipient@example.com',now()),
 ('77777777-0000-4000-8000-000000000002','domain-actor@example.com',now()),
 ('77777777-0000-4000-8000-000000000003','domain-outsider@example.com',now()),
 ('77777777-0000-4000-8000-000000000004','domain-unverified@example.com',null);
set local role service_role;
do $$
declare recipient uuid:='77777777-0000-4000-8000-000000000001'; actor uuid:='77777777-0000-4000-8000-000000000002';
 outsider uuid:='77777777-0000-4000-8000-000000000003'; unverified uuid:='77777777-0000-4000-8000-000000000004';
 group_key uuid:=gen_random_uuid(); post_key uuid:=gen_random_uuid(); comment_key uuid:=gen_random_uuid(); parent_key uuid:=gen_random_uuid();
 community_post uuid:=gen_random_uuid(); community_comment uuid:=gen_random_uuid(); business uuid:=gen_random_uuid();
 venue_key uuid:=gen_random_uuid(); merchant_key uuid:=gen_random_uuid(); notice uuid; marker uuid; old_notice uuid; membership uuid:=gen_random_uuid(); saved public.email_outbox; again public.email_outbox; claimed public.email_outbox; pref jsonb; count_before integer;
begin
 insert into public.profiles(user_id) values(recipient),(actor),(outsider),(unverified);
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,0,false,false,array['group_comments','community_comments','business_updates']);
 assert jsonb_array_length(pref->'operational_topics')=3;
 -- Old clients preserve new topics; unsupported/duplicate topics fail.
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,1,false,false);
 assert jsonb_array_length(pref->'operational_topics')=3;
 begin
  perform public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,2,false,false,array['business_updates','business_updates']);
  raise exception 'duplicate topic accepted';
 exception when invalid_parameter_value then null; end;
 insert into public.community_groups(id) values(group_key);
 insert into public.group_memberships(id,group_id,user_id) values(membership,group_key,recipient),(gen_random_uuid(),group_key,actor);
 insert into public.group_posts(id,group_id,user_id,content) values(post_key,group_key,recipient,'private content must stay in app');
 insert into public.group_post_comments(id,post_id,user_id,content,mentions) values(comment_key,post_key,actor,'private comment',
  jsonb_build_array(jsonb_build_object('user_id',recipient),jsonb_build_object('user_id',recipient),jsonb_build_object('user_id',outsider),jsonb_build_object('user_id','malformed')));
 select id into notice from public.email_operational_notices where source_id=comment_key and user_id=recipient;
 assert notice is not null and public.email_notice_current(notice),'group mention not captured';
 assert (select count(*)=1 from public.email_operational_notices where source_id=comment_key),'duplicates/outsider processed';
 saved:=public.email_notice_enqueue(notice,'{"category":"transactional","to":"domain-recipient@example.com","subject":"generic","html":"generic"}');
 again:=public.email_notice_enqueue(notice,'{"category":"transactional","to":"domain-recipient@example.com","subject":"changed","html":"changed"}');
 assert saved.id=again.id and again.payload->>'subject'='generic','notice replay mutated payload';
 select * into claimed from public.email_claim(1,saved.id);
 assert public.email_dispatch_authorize(claimed.id,claimed.lease_id),'eligible source not authorized';
 select group_notification_id into marker from public.email_comment_sources where notice_id=notice;
 update public.group_notifications set read_at=now() where id=marker;
 assert not public.email_notice_current(notice),'read source remained eligible';
 update public.group_notifications set read_at=null where id=marker;
 assert not public.email_notice_current(notice),'marking unread revived source';
 assert not public.email_dispatch_authorize(claimed.id,claimed.lease_id),'final dispatch ignored source invalidation';
 -- Reply adapter and original membership generation.
 insert into public.group_post_comments(id,post_id,user_id,content) values(parent_key,post_key,recipient,'parent');
 comment_key:=gen_random_uuid();
 insert into public.group_post_comments(id,post_id,user_id,parent_comment_id,content) values(comment_key,post_key,actor,parent_key,'reply');
 select id into notice from public.email_operational_notices where source_id=comment_key and user_id=recipient;
 assert public.email_notice_current(notice),'direct reply missing';
 delete from public.group_memberships where id=membership;
 insert into public.group_memberships(id,group_id,user_id) values(membership,group_key,recipient);
 assert not public.email_notice_current(notice),'same-ID rejoin revived source';
 -- Removal/re-addition cannot create a fresh email for one logical comment.
 comment_key:=gen_random_uuid();
 insert into public.group_post_comments(id,post_id,user_id,content,mentions) values(comment_key,post_key,actor,'mention',jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into notice from public.email_operational_notices where source_id=comment_key and user_id=recipient;
 update public.group_post_comments set mentions='[]' where id=comment_key;
 update public.group_post_comments set mentions=jsonb_build_array(jsonb_build_object('user_id',recipient)) where id=comment_key;
 assert not public.email_notice_current(notice),'mention restoration revived source';
 assert (select count(*)=1 from public.email_operational_notices where source_id=comment_key),'readd duplicated notice';
 -- Community visibility is checked for actor and recipient, despite service RLS bypass.
 insert into public.community_posts(id,user_id,visibility) values(community_post,actor,'private');
 insert into public.post_comments(id,post_id,user_id,content,mentions) values(community_comment,community_post,actor,'private',jsonb_build_array(jsonb_build_object('user_id',recipient)));
 assert not exists(select 1 from public.email_operational_notices where source_id=community_comment),'private mention leaked';
 update public.community_posts set visibility='followers' where id=community_post;
 insert into public.user_follows values(recipient,actor);
 community_comment:=gen_random_uuid();
 insert into public.post_comments(id,post_id,user_id,content,mentions) values(community_comment,community_post,actor,'allowed',jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into notice from public.email_operational_notices where source_id=community_comment and user_id=recipient;
 assert public.email_notice_current(notice),'follower mention missing';
 delete from public.user_follows where follower_id=recipient and following_id=actor;
 insert into public.user_follows values(recipient,actor);
 assert not public.email_notice_current(notice),'refollow revived source';
 update public.community_posts set visibility='public' where id=community_post;
 community_comment:=gen_random_uuid();
 insert into public.post_comments(id,post_id,user_id,content,mentions) values(community_comment,community_post,actor,'new',jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into notice from public.email_operational_notices where source_id=community_comment and user_id=recipient;
 assert public.email_notice_current(notice);
 insert into public.user_relationships values(recipient,actor,'block');
 delete from public.user_relationships where user_id=recipient and target_user_id=actor;
 assert not public.email_notice_current(notice),'unblocking revived source';
 -- New independent opt-in is not retroactive.
 insert into public.post_comments(post_id,user_id,content,mentions) values(community_post,actor,'unverified',jsonb_build_array(jsonb_build_object('user_id',unverified)));
 assert not exists(select 1 from public.email_operational_notices where user_id=unverified);
 pref:=public.email_delivery_preferences_save(outsider,false,'Etc/UTC',false,22,8,0,false,false,'{}');
 community_comment:=gen_random_uuid();
 insert into public.post_comments(id,post_id,user_id,content,mentions) values(community_comment,community_post,actor,'not opted in',jsonb_build_array(jsonb_build_object('user_id',outsider)));
 pref:=public.email_delivery_preferences_save(outsider,false,'Etc/UTC',false,22,8,1,false,false,array['community_comments']);
 update public.post_comments set content='edited' where id=community_comment;
 assert not exists(select 1 from public.email_operational_notices where source_id=community_comment and user_id=outsider),'opt-in backfilled comment';
 -- Directory contacts do not become owners. Only actual claimant transitions emit.
 insert into public.organizations(id,name,email) values(business,'Fixture business','domain-recipient@example.com');
 update public.organizations set status='archived' where id=business;
 assert not exists(select 1 from public.email_operational_notices where source_id=business),'public contact treated as claimant';
 update public.organizations set claimed_by=recipient,claim_status='claimed',status='active' where id=business;
 select id into notice from public.email_operational_notices where source_id=business;
 assert public.email_notice_current(notice),'verified claimant notice missing';
 old_notice:=notice;
 update public.organizations set claimed_by=null,claim_status='unclaimed' where id=business;
 assert not public.email_notice_current(old_notice),'revocation left old source valid';
 select id into notice from public.email_operational_notices where source_id=business and id<>old_notice;
 assert public.email_notice_current(notice),'revocation notice absent';
 update public.organizations set claimed_by=recipient,claim_status='claimed' where id=business;
 assert not public.email_notice_current(old_notice),'claim restoration revived generation';
 update public.organizations set status='archived' where id=business;
 select id into notice from public.email_operational_notices where source_id=business and kind='business_status';
 assert public.email_notice_current(notice),'business service change missing';
 -- Venue/merchant events resolve the canonical verified organization claimant.
 insert into public.venues(id,name,organization_id) values(venue_key,'Venue fixture',business);
 update public.venues set closed_at=now() where id=venue_key;
 select id into old_notice from public.email_operational_notices where source_id=venue_key;
 assert public.email_notice_current(old_notice),'linked venue service notice missing';
 update public.venues set closed_at=null where id=venue_key;
 assert not public.email_notice_current(old_notice),'venue reopen revived prior close snapshot';
 insert into public.marketplace_merchants(id,display_name,organization_id) values(merchant_key,'Merchant fixture',business);
 update public.marketplace_merchants set is_enabled=false where id=merchant_key;
 select id into old_notice from public.email_operational_notices where source_id=merchant_key;
 assert public.email_notice_current(old_notice),'linked vendor service notice missing';
 update public.marketplace_merchants set is_enabled=true where id=merchant_key;
 assert not public.email_notice_current(old_notice),'merchant reenable revived prior snapshot';
 delete from public.venues where id=venue_key;
 assert not exists(select 1 from public.email_operational_notices where source_id=venue_key and not cancelled),'entity delete left eligible snapshot';

 saved:=public.email_notice_enqueue(notice,'{"category":"transactional","to":"domain-recipient@example.com","subject":"business","html":"generic"}');
 assert public.email_activity_message_reason(saved.id)='activity_daily_budget','business adapter bypassed shared limit';
 perform public.email_fixture_change_mailbox(recipient,'changed-domain-recipient@example.com');
 assert public.email_activity_message_reason(saved.id)='activity_recipient_changed','recipient mailbox change ignored';
 perform public.email_fixture_change_mailbox(recipient,'domain-recipient@example.com');
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,2,false,false,'{}');
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,3,false,false,array['business_updates']);
 assert not public.email_notice_current(notice),'opt-back-in revived cancelled business notice';
 assert jsonb_array_length(public.email_export_for_user(recipient)->'operational_notices')>=4;
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,4,false,false,array['community_comments','business_updates']);
 community_comment:=gen_random_uuid();
 insert into public.post_comments(id,post_id,user_id,content,mentions) values(community_comment,community_post,actor,'erasure source',jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into notice from public.email_operational_notices where source_id=community_comment and user_id=recipient;
 assert public.email_notice_current(notice);
 perform public.email_erase_account(actor);
 assert not exists(select 1 from public.email_operational_notices where id=notice),'actor erasure left source metadata';
 perform public.email_erase_account(recipient);
 assert not exists(select 1 from public.email_operational_notices where user_id=recipient),'erasure left notices';
 assert not exists(select 1 from public.email_business_sources where claimant_user_id=recipient),'erasure left claimant source';
end $$;
reset role;
do $$ declare item text;
begin
 foreach item in array array['email_comment_sources','email_business_sources','email_business_notice_state'] loop
  assert (select relrowsecurity from pg_class where oid=('public.'||item)::regclass);
  assert not has_table_privilege('authenticated','public.'||item,'SELECT');
  assert not has_table_privilege('service_role','public.'||item,'INSERT');
 end loop;
 assert not has_function_privilege('authenticated','public.email_notice_current(uuid)','EXECUTE');
 assert not has_function_privilege('anon','email_private.capture_comment_notice()','EXECUTE');
end $$;
rollback;
