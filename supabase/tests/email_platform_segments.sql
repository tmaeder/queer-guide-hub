begin;
insert into auth.users(id,email) values('f1111111-0000-4000-8000-000000000001','segment-a@example.com');
set local role service_role;
do $$
declare a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; saved jsonb; preview jsonb; criteria jsonb; item jsonb; sid uuid;
begin
 a:=public.email_subscription_request('segment-a@example.com','f1111111-0000-4000-8000-000000000001','en',array['newsletter'],'account_settings','v1',repeat('a',64));
 assert public.email_subscription_consume(repeat('a',64),'confirm');
 b:=public.email_subscription_request('segment-b@example.com',null,'en',array['events'],'website','v1',repeat('b',64));
 c:=public.email_subscription_request('segment-c@example.com',null,'de',array['events'],'legacy','v1',repeat('c',64));
 assert public.email_subscription_consume(repeat('c',64),'confirm');
 d:=public.email_subscription_request('segment-d@example.com',null,'en',array['events'],'website','v1',repeat('d',64));
 assert public.email_subscription_consume(repeat('d',64),'confirm');
 update public.email_subscribers set status='unsubscribed' where id=d;
 e:=public.email_subscription_request('segment-e@example.com',null,'fr',array['events'],'website','v1',repeat('e',64));
 assert public.email_subscription_consume(repeat('e',64),'confirm');
 f:=public.email_subscription_request('segment-f@example.com',null,'de',array['events'],'website','v1',repeat('f',64));
 assert public.email_subscription_consume(repeat('f',64),'confirm');
 insert into public.email_suppressions(email,reason) values('segment-f@example.com','hard_bounce');
 criteria:='{"all":[{"field":"locale","op":"in","value":["en","de"]},{"any":[{"field":"topic","op":"contains","value":"events"},{"event":"consent.confirmed","within_days":30,"min_count":1}]},{"not":{"field":"source","op":"eq","value":"legacy"}}]}';
 preview:=public.email_segment_preview(criteria);
 assert (preview->>'matched')::int=4 and (preview->>'eligible')::int=1,'nested segment counts wrong';
 assert preview->'excluded'='{"pending_confirmation":1,"unsubscribed":1,"recipient_suppressed":1}'::jsonb,'missing exclusion reasons';
 assert jsonb_array_length(preview->'sample')=4;
 preview:=public.email_segment_preview(criteria,'events',1);
 assert (preview->>'eligible')::int=0 and (preview->'excluded'->>'topic_not_subscribed')::int=1,'topic opt-in bypassed';
 assert jsonb_array_length(preview->'sample')=1 and (preview->>'matched')::int=4,'preview limit changed totals';
 perform public.email_subscription_preferences('f1111111-0000-4000-8000-000000000001',array['newsletter'],'fr');
 preview:=public.email_segment_preview(criteria);
 assert (preview->>'eligible')::int=0,'saved segment used stale locale';
 perform public.email_subscription_preferences('f1111111-0000-4000-8000-000000000001',array['newsletter'],'en');
 saved:=public.email_segment_save('English and German subscriptions',criteria);
 sid:=(saved->>'id')::uuid;
 assert (saved->>'version')::int=1;
 saved:=public.email_segment_save('French subscriptions','{"field":"locale","op":"eq","value":"fr"}',null,sid,1);
 assert (saved->>'version')::int=2;
 assert (select criteria=v.rule from public.email_segment_versions v where segment_id=sid and version=1),'original version changed';
 begin
  perform public.email_segment_save('Overwrite',criteria,null,sid,1);
  raise exception 'stale segment update accepted';
 exception when serialization_failure then null; end;
 assert (select version=2 and name='French subscriptions' from public.email_segments where id=sid),'conflict modified segment';
 -- Sensitive traits, arbitrary events, malformed groups and non-integer
 -- windows are rejected before evaluation; there is no arbitrary SQL input.
 for item in select value from jsonb_array_elements('[
  {"field":"sexual_orientation","op":"eq","value":"anything"},
  {"field":"email","op":"eq","value":"person@example.com"},
  {"field":null,"op":"eq","value":"en"},
  {"field":"locale","op":null,"value":"en"},
  {"field":"created_at","op":"within_days","value":1.5},
  {"field":"status","op":"eq","value":"invented"},
  {"event":"private_message.read","within_days":1,"min_count":1},
  {"event":"consent.confirmed","within_days":0,"min_count":1},
  {"event":"consent.confirmed","within_days":30,"min_count":-1},
  {"any":[]},{"all":null},{"all":[],"any":[]},null
 ]') loop
  begin
   perform public.email_segment_preview(item);
   raise exception 'invalid segment accepted: %',item;
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.email_segment_validate(criteria,null);
  raise exception 'null depth accepted';
 exception when invalid_parameter_value then null; end;
 item:='{"field":"locale","op":"eq","value":"en"}';
 for i in 1..7 loop item:=jsonb_build_object('not',item); end loop;
 begin
  perform public.email_segment_preview(item);
  raise exception 'excessive recursion accepted';
 exception when invalid_parameter_value then null; end;
 preview:=public.email_segment_preview('{"field":"source","op":"eq","value":"x''); drop table email_subscribers; --"}');
 assert (preview->>'matched')::int=0,'source value interpreted as SQL';
 perform public.email_record_event('segment-delivery','segment-provider','segment-a@example.com','delivered',now());
 preview:=public.email_segment_preview('{"event":"delivery.delivered","within_days":1,"min_count":1}');
 assert (preview->>'eligible')::int=1,'delivery event predicate wrong';
 preview:=public.email_segment_preview('{"field":"confirmed_at","op":"within_days","value":1}');
 assert (preview->>'matched')::int=5,'unconfirmed contact matched confirmation age';
 preview:=public.email_segment_preview('{"field":"created_at","op":"older_than_days","value":1}');
 assert (preview->>'matched')::int=0;
 assert (select count(*)=5 from jsonb_array_elements(public.email_contact_timeline(a)) entry where entry->>'kind' like 'consent.%' or entry->>'kind' like 'delivery.%'),'contact timeline missing authoritative events';
 perform public.email_record_event('pending-foreign-event','pending-provider','segment-b@example.com','delivered',now());
 assert public.email_contact_timeline(b)::text not like '%delivery.delivered%','unproved mailbox disclosed delivery timeline';
 perform public.email_erase_account('f1111111-0000-4000-8000-000000000001');
 assert public.email_contact_timeline(a)='[]'::jsonb,'erasure left copied contact timeline';
 preview:=public.email_segment_preview('{"event":"delivery.delivered","within_days":1,"min_count":1}');
 assert (preview->>'matched')::int=1 and (preview->>'eligible')::int=0,'erasure kept the erased contact or removed the unrelated pending mailbox event';
end $$;
reset role;
do $$ declare f record; t text;
begin
 foreach t in array array['email_segments','email_segment_versions'] loop
  assert not has_table_privilege('anon','public.'||t,'SELECT');
  assert not has_table_privilege('authenticated','public.'||t,'UPDATE');
  assert (select relrowsecurity from pg_class where oid=('public.'||t)::regclass);
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('email_segment_validate','email_segment_matches','email_segment_preview','email_segment_save','email_subscriber_eligibility','email_contact_timeline') loop
  assert not has_function_privilege('anon',f.oid,'EXECUTE');
  assert not has_function_privilege('authenticated',f.oid,'EXECUTE');
 end loop;
end $$;
rollback;
