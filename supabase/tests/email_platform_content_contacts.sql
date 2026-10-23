begin;
insert into auth.users(id,email) values('55555555-0000-4000-8000-000000000001','content-admin@example.com'),('55555555-0000-4000-8000-000000000002','content-member@example.com');
insert into public.email_templates(template_key,name,subject,html_content,text_content,variables) values('localized-fixture','Localized','Hello {{name}}','<p>{{name}}</p>','{{name}}','[{"name":"name","required":true}]');
set local role service_role;
do $$
declare r jsonb; c jsonb; sid uuid; before_mail bigint; after_mail bigint; admin_id uuid:='55555555-0000-4000-8000-000000000001'; member_id uuid:='55555555-0000-4000-8000-000000000002';
begin
 r:=public.email_template_localization_save('localized-fixture','de','Hallo {{name}}','<h1>{{name}}</h1>','{{name}}',0,admin_id);
 assert r->>'locale'='de' and r->>'version'='1';
 assert public.email_template_resolve('localized-fixture','de-CH')->>'resolved_locale'='de';
 assert public.email_template_resolve('localized-fixture','de-CH')->>'fallback'='true';
 r:=public.email_template_localization_save('localized-fixture','de-CH','Grüezi {{name}}','<p>{{name}}</p>','{{name}}',0,admin_id);
 assert public.email_template_resolve('localized-fixture','de-CH')->>'resolved_locale'='de-ch';
 assert public.email_template_resolve('localized-fixture','de-CH')->>'fallback'='false';
 assert public.email_template_resolve('localized-fixture','fr')->>'resolved_locale'='base';
 begin
  perform public.email_template_localization_save('localized-fixture','de','Lost update {{name}}','{{name}}','{{name}}',0,admin_id);
  raise exception 'stale localization saved';
 exception when serialization_failure then null; end;
 begin
  perform public.email_template_localization_save('localized-fixture','fr','Bonjour','<p>Missing required token</p>','',0,admin_id);
  raise exception 'broken translation saved';
 exception when invalid_parameter_value then null; end;
 c:=public.email_campaign_save('{"name":"Swiss locale","template_key":"localized-fixture","topic":"newsletter","locale":"de-CH"}',admin_id);
 assert (select content->>'subject'='Grüezi {{name}}' and content->>'resolved_locale'='de-ch' from public.email_campaign_versions where campaign_id=(c->>'id')::uuid);
 perform public.email_template_localization_save('localized-fixture','de-CH','Edited {{name}}','<p>{{name}}</p>','{{name}}',1,admin_id);
 assert (select content->>'subject'='Grüezi {{name}}' from public.email_campaign_versions where campaign_id=(c->>'id')::uuid),'translation edit mutated saved campaign';
 -- Inactive locales fall back, rather than disabling the whole service.
 perform public.email_template_localization_save('localized-fixture','de-CH','Edited {{name}}','<p>{{name}}</p>','{{name}}',2,admin_id,false);
 assert public.email_template_resolve('localized-fixture','de-CH')->>'resolved_locale'='de';
 sid:=public.email_subscription_request('content-member@example.com',member_id,'en',array['newsletter'],'website','fixture',repeat('5',64));
 assert public.email_subscription_consume(repeat('5',64),'confirm');
 insert into public.email_suppressions(email,reason) values('suppressed-import@example.com','complaint');
 select count(*) into before_mail from public.email_outbox;
 r:=public.email_contacts_import('Historical CSV','fixture checksum only','[{"email":"new-import@example.com","locale":"de"},{"email":"new-import@example.com"},{"email":"content-member@example.com"},{"email":"suppressed-import@example.com"}]',admin_id);
 assert r->>'inserted_pending'='1' and r->>'skipped'='3' and r->>'messages_queued'='0';
 assert (select status='pending' and confirmed_at is null and topics='{}' from public.email_subscribers where email='new-import@example.com');
 assert (select status='subscribed' and topics=array['newsletter'] from public.email_subscribers where id=sid),'import overwrote existing consent';
 assert (select reason='complaint' from public.email_suppressions where email='suppressed-import@example.com');
 begin
  perform public.email_contacts_import('Bad input','fixture','[{"email":"forged@example.com","status":"subscribed"}]',admin_id);
  raise exception 'imported forged consent';
 exception when invalid_parameter_value then null; end;
 assert (select count(*) from public.email_outbox)=before_mail,'import queued mail';
 perform public.email_management_request('missing@example.com',repeat('a',64),'{"to":"missing@example.com","category":"transactional"}','missing-management');
 assert not exists(select 1 from public.email_management_tokens where token_hash=repeat('a',64)),'management enumerated missing mailbox';
 perform public.email_management_request('content-member@example.com',repeat('b',64),'{"to":"content-member@example.com","category":"transactional"}','member-management');
 r:=public.email_management_read(repeat('b',64));
 assert r->>'status'='subscribed' and not r?'email';
 assert public.email_management_read(repeat('b',64))=r,'GET consumed link';
 perform public.email_management_request('content-member@example.com',repeat('c',64),'{"to":"content-member@example.com","category":"transactional"}','management-too-soon');
 assert not exists(select 1 from public.email_management_tokens where token_hash=repeat('c',64)),'hourly mailbox limit bypassed';
 assert public.email_management_save(repeat('b',64),array['newsletter','events'],'de',false);
 assert not public.email_management_save(repeat('b',64),array['newsletter'],'en',false),'management link replayed';
 assert (select action='preferences_changed' and source='email_management' from public.email_consent_events where subscriber_id=sid order by created_at desc,id desc limit 1) or exists(select 1 from public.email_consent_events where subscriber_id=sid and source='email_management');
 update public.email_management_tokens set created_at=now()-interval '2 hours' where subscriber_id=sid;
 perform public.email_management_request('content-member@example.com',repeat('d',64),'{"to":"content-member@example.com","category":"transactional"}','member-unsubscribe');
 assert public.email_management_save(repeat('d',64),'{}','de',true);
 assert (select status='unsubscribed' and topics='{}' from public.email_subscribers where id=sid);
 update public.email_management_tokens set created_at=now()-interval '2 hours' where subscriber_id=sid;
 perform public.email_management_request('content-member@example.com',repeat('e',64),'{"to":"content-member@example.com","category":"transactional"}','member-resubscribe');
 assert not public.email_management_save(repeat('e',64),array['newsletter'],'de',false),'management bypassed resubscribe confirmation';
 perform public.email_erase_account(member_id);
 assert public.email_management_read(repeat('e',64)) is null;
 assert not exists(select 1 from public.email_management_tokens where subscriber_id=sid),'erasure left management token';
 perform public.email_erase_account(admin_id);
 assert not exists(select 1 from public.email_template_localizations where updated_by=admin_id);
 assert not exists(select 1 from public.email_import_batches where created_by=admin_id);
end $$;
reset role;
do $$ declare f record;t text;begin
 foreach t in array array['email_template_localizations','email_import_batches','email_import_members','email_management_tokens'] loop
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass);
  assert not has_table_privilege('authenticated','public.'||t,'SELECT');
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_management_%' or proname like 'email_template_%' or proname='email_contacts_import') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
