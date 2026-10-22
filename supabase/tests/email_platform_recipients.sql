begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('66666666-0000-4000-8000-000000000001','entity-admin@example.com',now()),
 ('66666666-0000-4000-8000-000000000002','shared-business@example.com',now()),
 ('66666666-0000-4000-8000-000000000003','unverified@example.com',null);
insert into public.organizations(id,name,email) values ('66666666-0000-4000-8000-000000000011','Organisation fixture',' SHARED-business@example.com ');
insert into public.venues(id,name,email) values ('66666666-0000-4000-8000-000000000012','Venue fixture','shared-business@example.com');
insert into public.marketplace_merchants(id,display_name,organization_id) values ('66666666-0000-4000-8000-000000000013','Vendor fixture','66666666-0000-4000-8000-000000000011');
insert into public.email_templates(template_key,name,subject,html_content) values('entity-fixture','Entity fixture','Service fixture','<p>Fixture</p>');
set local role service_role;
do $$
declare r jsonb;s public.email_subscribers;uid uuid:='66666666-0000-4000-8000-000000000002';before_mail bigint;segment jsonb;campaign jsonb;audience uuid;experiment uuid;aid uuid:='66666666-0000-4000-8000-000000000001';
begin
 select count(*) into before_mail from public.email_outbox;
 r:=public.email_recipient_directory('organization');
 assert r->'recipients'->0->>'email'='shared-business@example.com' and r->'recipients'->0->>'eligibility'='no_subscription';
 assert not exists(select 1 from jsonb_array_elements(public.email_recipient_directory('user')->'recipients') x where x->>'id'='66666666-0000-4000-8000-000000000003'),'unverified account enumerated';
 r:=public.email_recipient_import('vendor','66666666-0000-4000-8000-000000000013',aid);
 assert r->>'inserted_pending'='1' and r->>'messages_queued'='0' and r->>'consent_granted'='false';
 select * into s from public.email_subscribers where email='shared-business@example.com';
 assert s.status='pending' and s.user_id is null and s.topics='{}' and s.confirmed_at is null,'entity association invented account ownership or consent';
 r:=public.email_recipient_import('venue','66666666-0000-4000-8000-000000000012',aid);
 assert r->>'inserted_pending'='0','shared business mailbox duplicated';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"in","value":["organization","venue","vendor","user"]}','newsletter')->>'matched'='1';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"organization"}','newsletter')->>'eligible'='0','pending business eligible';
 assert public.email_segment_preview('{"all":[{"field":"recipient_kind","op":"eq","value":"vendor"},{"field":"locale","op":"eq","value":"en"}]}','newsletter')->>'matched'='1','nested recipient rules not supported';
 begin perform public.email_segment_validate('{"field":"recipient_kind","op":"eq","value":"secret"}');raise exception 'invalid recipient kind accepted';exception when invalid_parameter_value then null;end;
 perform public.email_subscription_request('shared-business@example.com',uid,'en',array['newsletter'],'website','fixture',repeat('6',64));
 assert public.email_subscription_consume(repeat('6',64),'confirm');
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"vendor"}','newsletter')->>'eligible'='1';
 segment:=public.email_segment_save('Current vendor contacts','{"field":"recipient_kind","op":"eq","value":"vendor"}',aid);
 campaign:=public.email_campaign_save(jsonb_build_object('name','Entity fixture','template_key','entity-fixture','topic','newsletter','segment_id',segment->>'id'),aid);
 audience:=public.email_campaign_snapshot_begin((campaign->>'id')::uuid,1,aid);
 r:=public.email_campaign_snapshot_batch(audience,1000);
 experiment:=public.email_experiment_create((campaign->>'id')::uuid,1,'username_claimed',604800,'[{"key":"control","weight":50},{"key":"a","weight":50,"template_key":"entity-fixture"}]',aid);
 -- Current entity contact changes invalidate the association; consent never
 -- follows the entity to its new mailbox.
 update public.organizations set email='replacement@example.com' where id='66666666-0000-4000-8000-000000000011';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"vendor"}','newsletter')->>'matched'='0';
 r:=public.email_experiment_batch(experiment,1000);
 assert (select reason='no_longer_matches' and variant_key is null from public.email_experiment_assignments where experiment_id=experiment and subscriber_id=s.id),'experiment assigned an obsolete entity contact';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"venue"}','newsletter')->>'eligible'='1';
 r:=public.email_recipient_import('organization','66666666-0000-4000-8000-000000000011',aid);
 assert (select status='pending' and topics='{}' from public.email_subscribers where email='replacement@example.com');
 update public.organizations set status='archived' where id='66666666-0000-4000-8000-000000000011';
 assert jsonb_array_length(public.email_recipient_directory('vendor')->'recipients')=0;
 begin perform public.email_recipient_import('vendor','66666666-0000-4000-8000-000000000013',aid);raise exception 'archived vendor imported';exception when invalid_parameter_value then null;end;
 insert into public.email_suppressions(email,reason) values('shared-business@example.com','complaint');
 assert public.email_recipient_directory('venue')->'recipients'->0->>'eligibility'='recipient_suppressed';
 assert public.email_segment_preview('{"field":"recipient_kind","op":"eq","value":"venue"}','newsletter')->>'eligible'='0';
 assert (select count(*) from public.email_outbox)=before_mail,'directory or import sent mail';
 -- Erasure must also hide source associations and prevent reimport.
 perform public.email_erase_account(uid);
 assert not exists(select 1 from jsonb_array_elements(public.email_recipient_directory('venue')->'recipients') x where x->>'email'='shared-business@example.com');
 r:=public.email_recipient_import('venue','66666666-0000-4000-8000-000000000012',aid);
 assert r->>'inserted_pending'='0','erased entity mailbox recreated';
end $$;
reset role;
do $$ declare f record;begin
 assert not has_table_privilege('anon','public.email_recipient_sources','SELECT') and not has_table_privilege('authenticated','public.email_recipient_sources','SELECT');
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_recipient_%' or proname like 'email_segment_%') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
