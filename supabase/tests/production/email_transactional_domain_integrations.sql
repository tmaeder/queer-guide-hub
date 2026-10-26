-- Operator-only production contract. Supply qg.email_test_recipient and
-- qg.email_test_actor as transaction-local settings after BEGIN. Both must be
-- existing verified test participants. No transport call and NEVER COMMIT.
begin;
set local statement_timeout='20s';
-- TEST_ACCOUNT_SETTINGS

do $$
declare recipient uuid:=current_setting('qg.email_test_recipient')::uuid;
 actor uuid:=current_setting('qg.email_test_actor')::uuid;
 marker text:='qg-email-domain-e2e-'||gen_random_uuid()::text;
 group_key uuid:=gen_random_uuid(); group_post uuid:=gen_random_uuid(); group_comment uuid:=gen_random_uuid();
 author_post uuid:=gen_random_uuid(); author_comment uuid:=gen_random_uuid(); original_seen timestamptz; notification_count integer;
 community_post uuid:=gen_random_uuid(); community_comment uuid:=gen_random_uuid(); business uuid:=gen_random_uuid();
 fixture_city uuid; fixture_country uuid;
 venue_key uuid:=gen_random_uuid(); vendor_key uuid:=gen_random_uuid(); notice uuid; old_notice uuid;
 pref jsonb; address text; saved public.email_outbox; again public.email_outbox; leased public.email_outbox;
 baseline_outboxes integer; baseline_attempts integer;
begin
 assert recipient<>actor,'distinct existing participants required';
 assert exists(select 1 from public.email_recipient_user_lookup where user_id=recipient),'recipient is not currently verified';
 assert exists(select 1 from public.email_recipient_user_lookup where user_id=actor),'actor is not currently verified';
 assert not exists(select 1 from public.email_disabled_accounts where user_id in(recipient,actor));
 assert exists(select 1 from public.profiles where user_id=recipient);
 assert exists(select 1 from public.profiles where user_id=actor);
 select lower(btrim(email)) into strict address from auth.users where id=recipient and email_confirmed_at is not null;
 perform set_config('role','service_role',true);
 select count(*),coalesce(sum(attempts),0) into baseline_outboxes,baseline_attempts from public.email_outbox;
 pref:=public.email_delivery_preferences_get(recipient);
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,(pref->>'version')::integer,false,false,array['group_comments','community_comments','business_updates']);
 -- This test participant's prior reservation is restored by the mandatory
 -- rollback. No other account's budget or permission is touched.
 delete from public.email_activity_reservations where user_id=recipient and day_bucket=(now() at time zone 'UTC')::date;
 insert into public.community_groups(id,name,created_by,is_private) values(group_key,marker,actor,true);
 insert into public.group_memberships(group_id,user_id)
  select group_key,recipient where not exists(select 1 from public.group_memberships where group_id=group_key and user_id=recipient);
 insert into public.group_memberships(group_id,user_id)
  select group_key,actor where not exists(select 1 from public.group_memberships where group_id=group_key and user_id=actor);
 insert into public.group_posts(id,group_id,user_id,content) values(group_post,group_key,actor,marker);
 insert into public.group_post_comments(id,post_id,user_id,content,mentions)
  values(group_comment,group_post,actor,marker,jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into strict notice from public.email_operational_notices where source_id=group_comment and user_id=recipient and kind='group_comment';
 assert public.email_notice_current(notice),'group comment source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=notice),'producer selector omitted eligible source';
 saved:=public.email_notice_enqueue(notice,jsonb_build_object('category','transactional','to',address,'from','Queer Guide <noreply@queer.guide>','subject',marker,'text','Transactional integration verification.','html','<p>Transactional integration verification.</p>'));
 again:=public.email_notice_enqueue(notice,jsonb_build_object('category','transactional','to',address,'subject','changed','html','changed'));
 assert saved.id=again.id and saved.payload=again.payload,'immutable replay failed';
 select * into strict leased from public.email_claim(1,saved.id);
 assert public.email_dispatch_authorize(leased.id,leased.lease_id),'eligible notice rejected';
 update public.group_notifications set read_at=now() where id=(select group_notification_id from public.email_comment_sources where notice_id=notice);
 assert not public.email_notice_current(notice),'read invalidation failed';
 assert not public.email_dispatch_authorize(leased.id,leased.lease_id),'dispatch accepted read source';
 update public.group_notifications set read_at=null where id=(select group_notification_id from public.email_comment_sources where notice_id=notice);
 assert not public.email_notice_current(notice),'unread restored cancelled source';
 insert into public.community_posts(id,user_id,content,visibility) values(community_post,actor,marker,'public');
 insert into public.post_comments(id,post_id,user_id,content,mentions)
  values(community_comment,community_post,actor,marker,jsonb_build_array(jsonb_build_object('user_id',recipient)));
 select id into strict notice from public.email_operational_notices where source_id=community_comment and user_id=recipient and kind='community_comment';
 assert public.email_notice_current(notice),'community comment source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=notice),'producer selector omitted eligible source';
 update public.community_posts set visibility='private' where id=community_post;
 assert not public.email_notice_current(notice),'private visibility did not invalidate source';
 update public.community_posts set visibility='public' where id=community_post;
 assert not public.email_notice_current(notice),'visibility restoration revived source';
 -- Reuse the product's existing author inbox/read contract, with no duplicate
 -- generic notification. Only the QA participant's read marker is transiently changed.
 select post_engagement_seen_at into original_seen from public.profiles where user_id=recipient;
 select count(*) into notification_count from public.notifications where user_id=recipient;
 insert into public.community_posts(id,user_id,content,visibility) values(author_post,recipient,marker,'public');
 insert into public.post_comments(id,post_id,user_id,content,mentions,created_at) values(author_comment,author_post,actor,marker,'[]',clock_timestamp());
 select id into strict old_notice from public.email_operational_notices where source_id=author_comment and user_id=recipient;
 assert public.email_notice_current(old_notice),'post author source not eligible';
 assert (select count(*)=notification_count from public.notifications where user_id=recipient),'duplicate author notification';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=old_notice),'producer selector omitted author source';
 update public.profiles set post_engagement_seen_at=clock_timestamp()+interval '1 second' where user_id=recipient;
 assert not public.email_notice_current(old_notice),'post author read not applied';
 update public.profiles set post_engagement_seen_at=original_seen where user_id=recipient;
 assert not public.email_notice_current(old_notice),'post author unread revived source';
 insert into public.organizations(id,name,slug,status,roles) values(business,marker,marker,'draft',array['community']);
 update public.organizations set claimed_by=recipient,claim_status='claimed' where id=business;
 select id into strict old_notice from public.email_operational_notices where source_id=business and kind='business_claim';
 assert public.email_notice_current(old_notice),'business claim source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=old_notice),'producer selector omitted eligible source';
 update public.organizations set claimed_by=null,claim_status='unclaimed' where id=business;
 assert not public.email_notice_current(old_notice),'claim removal did not invalidate source';
 update public.organizations set claimed_by=recipient,claim_status='claimed' where id=business;
 assert not public.email_notice_current(old_notice),'restored claim revived old generation';
 update public.organizations set status='archived' where id=business;
 select id into strict notice from public.email_operational_notices where source_id=business and kind='business_status';
 assert public.email_notice_current(notice),'business status source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=notice),'producer selector omitted eligible source';
 select id,country_id into strict fixture_city,fixture_country from public.cities where country_id is not null and duplicate_of_id is null order by id limit 1;
 -- A consistent existing public city/country prevents the geocode webhook
 -- from being queued. The test never writes that city or country.
 insert into public.venues(id,name,slug,address,category,organization_id,city_id,country_id)
  values(venue_key,marker,marker,'Verification fixture','other',business,fixture_city,fixture_country);
 update public.venues set closed_at=now() where id=venue_key;
 select id into strict old_notice from public.email_operational_notices where source_id=venue_key and kind='business_status';
 assert public.email_notice_current(old_notice),'venue source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=old_notice),'producer selector omitted eligible source';
 update public.venues set closed_at=null where id=venue_key;
 assert not public.email_notice_current(old_notice),'venue reopening revived old generation';
 insert into public.marketplace_merchants(id,display_name,slug,provider,organization_id) values(vendor_key,marker,marker,'manual',business);
 update public.marketplace_merchants set is_enabled=false where id=vendor_key;
 select id into strict old_notice from public.email_operational_notices where source_id=vendor_key and kind='business_status';
 assert public.email_notice_current(old_notice),'vendor source not eligible';
 assert exists(select 1 from public.email_notice_candidates(25) c where c.source_id=old_notice),'producer selector omitted eligible source';
 update public.marketplace_merchants set is_enabled=true where id=vendor_key;
 assert not public.email_notice_current(old_notice),'vendor reenable revived old generation';
 -- Shared daily budget remains enforced for every operational purpose.
 again:=public.email_notice_enqueue(notice,jsonb_build_object('category','transactional','to',address,'subject',marker,'html','generic'));
 assert public.email_activity_message_reason(again.id)='activity_daily_budget','new purpose bypassed shared activity budget';
 pref:=public.email_delivery_preferences_save(recipient,false,'Etc/UTC',false,22,8,(pref->>'version')::integer,false,false,'{}');
 assert not public.email_notice_current(notice),'opt-out left source eligible';
 assert (select count(*)=baseline_outboxes+2 and sum(attempts)=baseline_attempts+1 from public.email_outbox),'unexpected outbox identity or attempt count';
 assert not has_table_privilege('authenticated','public.email_comment_sources','SELECT');
 assert not has_table_privilege('service_role','public.email_comment_sources','INSERT');
 assert not has_function_privilege('anon','public.email_notice_enqueue(uuid,jsonb)','EXECUTE');
end $$;
rollback;
select jsonb_build_object('status','PASS','mode','rollback-only','source_kinds',array['group_comment','community_comment','business_claim','business_status','linked_venue_status','linked_vendor_status'],
 'post_author_existing_read_contract',true,'due_candidate_selection',true,'provider_calls',0,'committed_fixtures',0,'source_to_outbox_claim_authorization',true,'immutable_replay',true,'permanent_invalidation',true,'shared_budget',true,'opt_out',true) verification;
