begin;
insert into auth.users(id,email) values('44444444-0000-4000-8000-000000000001','experiment-admin@example.com'),('44444444-0000-4000-8000-000000000002','activated@example.com'),('44444444-0000-4000-8000-000000000003','open-window@example.com');
insert into public.email_templates(template_key,name,subject,html_content) values('experiment-fixture','Experiment','Pinned subject','<p>Original</p>');
grant update on public.email_templates to service_role;
set local role service_role;
do $$
declare c jsonb;a uuid;experiment uuid;r jsonb;before_keys jsonb;after_keys jsonb;uid uuid:='44444444-0000-4000-8000-000000000002';second_uid uuid:='44444444-0000-4000-8000-000000000003';s uuid;o public.email_outbox;n int;
begin
 s:=public.email_subscription_request('activated@example.com',uid,'en',array['newsletter'],'website','fixture',repeat('4',64));
 assert public.email_subscription_consume(repeat('4',64),'confirm');
 s:=public.email_subscription_request('open-window@example.com',second_uid,'en',array['newsletter'],'website','fixture',repeat('3',64));
 assert public.email_subscription_consume(repeat('3',64),'confirm');
 insert into public.email_subscribers(email,status,locale,topics,source,consent_version,confirmed_at)
 select 'experiment-'||g||'@example.com','subscribed','en',array['newsletter'],'disposable_fixture','fixture_only',now() from generate_series(1,1000) g;
 s:=public.email_subscription_request('unconfirmed-experiment@example.com',null,'en',array['newsletter'],'website','fixture',repeat('2',64));
 r:=public.email_segment_save('English experiment fixture','{"field":"locale","op":"eq","value":"en"}');
 c:=public.email_campaign_save('{"name":"Experiment plan","template_key":"experiment-fixture","topic":"newsletter"}'::jsonb||jsonb_build_object('segment_id',r->>'id'),'44444444-0000-4000-8000-000000000001');
 a:=public.email_campaign_snapshot_begin((c->>'id')::uuid,1);
 for n in 1..4 loop r:=public.email_campaign_snapshot_batch(a,1000);exit when r->>'status'='ready';end loop;
 begin
  perform public.email_experiment_create((c->>'id')::uuid,1,'username_claimed',604800,'[{"key":"a","weight":50,"template_key":"experiment-fixture"},{"key":"b","weight":50,"template_key":"experiment-fixture"}]');
  raise exception 'experiment without control accepted';
 exception when invalid_parameter_value then null;end;
 experiment:=public.email_experiment_create((c->>'id')::uuid,1,'username_claimed',604800,'[{"key":"control","weight":10},{"key":"a","weight":45,"template_key":"experiment-fixture"},{"key":"b","weight":45,"template_key":"experiment-fixture"}]','44444444-0000-4000-8000-000000000001');
 begin
  update public.email_experiments set variants='[]' where id=experiment;
  raise exception 'immutable variant definitions were editable';
 exception when insufficient_privilege then null;end;
 update public.email_templates set subject='Changed after plan' where template_key='experiment-fixture';
 assert (select variants->1->'content'->>'subject'='Pinned subject' from public.email_experiments where id=experiment),'template edit rewrote experiment';
 for n in 1..20 loop r:=public.email_experiment_batch(experiment,100);exit when r->>'status'='ready';end loop;
 assert r->>'status'='ready';
 assert (select count(*)=1003 from public.email_experiment_assignments where experiment_id=experiment);
 assert (select variant_key is null and reason='pending_confirmation' from public.email_experiment_assignments where experiment_id=experiment and subscriber_id=s),'pending contact received an assignment';
 assert exists(select 1 from public.email_experiment_assignments where experiment_id=experiment and variant_key='control');
 select jsonb_object_agg(subscriber_id,variant_key) into before_keys from public.email_experiment_assignments where experiment_id=experiment;
 perform public.email_experiment_batch(experiment,1000);
 select jsonb_object_agg(subscriber_id,variant_key) into after_keys from public.email_experiment_assignments where experiment_id=experiment;
 assert before_keys=after_keys,'retry rerolled stable assignments';
 r:=public.email_experiment_report((c->>'id')::uuid)->0;
 assert r->>'exposures'='0' and r->'outcomes'='null'::jsonb and r->'causal_lift'='null'::jsonb and r->>'window_started'='false','planning fabricated exposure or outcomes';
 assert (select count(*)=0 from public.email_outbox),'experiment preparation queued email';
 assert jsonb_array_length(public.email_export_for_user(uid)->'experiment_assignments')=1;
 -- Observe a real server-captured username event after a fixture receipt, with
 -- a closed seven-day window. This is explicitly observational, not causal.
 o:=public.email_enqueue('measurement-closed','activated@example.com','{"to":"activated@example.com","category":"transactional"}','welcome',null,uid);
 update public.email_outbox set status='delivered',provider_id='measurement-provider',accepted_at=now()-interval '8 days',delivered_at=now()-interval '8 days' where id=o.id;
 insert into public.profiles(user_id,username) values(uid,'measurement_fixture');
 update public.email_lifecycle_events set occurred_at=now()-interval '6 days' where user_id=uid and event_type='profile.username.changed';
 o:=public.email_enqueue('measurement-open','open-window@example.com','{"to":"open-window@example.com","category":"transactional"}','welcome',null,second_uid);
 update public.email_outbox set status='accepted',provider_id='measurement-open-provider',accepted_at=now()-interval '1 day' where id=o.id;
 r:=public.email_measurement_report();
 assert r->'welcome_activation'->>'closed_windows'='1' and r->'welcome_activation'->>'outcome_accounts'='1' and r->'welcome_activation'->>'open_windows'='1';
 assert r->>'attribution'='observed_after_provider_acceptance_not_causal' and r->'purchases'='null'::jsonb and r->'automatic_winner'='null'::jsonb;
 perform public.email_erase_account(uid);
 assert not exists(select 1 from public.email_experiment_assignments where user_id=uid),'experiment assignment survived erasure';
 assert public.email_measurement_report()->'welcome_activation'->>'closed_windows'='0','erased activation remained linked';
 perform public.email_erase_account('44444444-0000-4000-8000-000000000001');
 assert not exists(select 1 from public.email_experiments where created_by='44444444-0000-4000-8000-000000000001');
end $$;
reset role;
do $$ declare f record;t text;begin
 foreach t in array array['email_experiments','email_experiment_assignments'] loop
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass);
  assert not has_table_privilege('authenticated','public.'||t,'SELECT');
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_experiment_%' or proname='email_measurement_report') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
