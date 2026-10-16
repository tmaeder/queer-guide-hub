BEGIN;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
ALTER TABLE public.redirect_link_conversions DROP CONSTRAINT redirect_link_conversions_pending_tenant_fence;
ALTER TABLE public.redirect_link_customers DROP CONSTRAINT redirect_link_customers_pending_tenant_fence;
ALTER TABLE public.redirect_customer_profiles DROP CONSTRAINT redirect_customer_profiles_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000081';other uuid:='00000000-0000-4000-8000-000000000082';foreign_link uuid:='00000000-0000-4000-8000-000000000083';local_link uuid;foreign_click uuid:=gen_random_uuid();local_click uuid:=gen_random_uuid();orphan_click uuid:=gen_random_uuid();foreign_version uuid;result jsonb;snapshot jsonb;event jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Customer analytics fixture','customer-analytics-fixture');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(other,actor);
 INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES(foreign_link,other,'SHORT','foreign-customer-analytics','https://example.org/foreign-customer');
 INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','local-customer-analytics','https://example.org/local-customer') RETURNING id INTO local_link;
 INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,ts,path,variant_id,status) VALUES(other,foreign_link,foreign_click,now()-interval '1 hour','/foreign-private-customer','foreign-private-variant',302);
 INSERT INTO public.redirect_events(redirect_id,click_id,ts,path,variant_id,status) VALUES(local_link,local_click,now()-interval '1 hour','/local-customer','local-variant',302),(NULL,orphan_click,now()-interval '1 hour','/local-orphan',NULL,302);
 INSERT INTO public.redirect_link_conversions(workspace_id,click_id,kind,customer_key,provider_event_id,event_name,occurred_at) VALUES(other,foreign_click,'lead','foreign-customer:ü','foreign-customer-event','Foreign private event',now()-interval '30 minutes');
 INSERT INTO public.redirect_link_customers(workspace_id,customer_key,click_id) VALUES(other,'foreign-customer:ü',foreign_click);
 INSERT INTO public.redirect_customer_profiles(workspace_id,customer_key,name,email) VALUES(other,'foreign-customer:ü','Foreign private customer','foreign-customer@example.org') RETURNING version INTO foreign_version;
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace','58aa4340-8f21-4b7f-9a10-90be2da89c01','x-qg-redirect-session-actor',actor)::text,true);
 event:=jsonb_build_object('clickId',local_click,'kind','lead','customerExternalId','local-customer:ü','eventId','local-customer-event','eventName','Local lead');PERFORM public.record_redirect_conversion(event);
 SELECT jsonb_build_object('events',(SELECT jsonb_agg(to_jsonb(e)) FROM public.redirect_events e WHERE workspace_id=other),'conversions',(SELECT jsonb_agg(to_jsonb(c)) FROM public.redirect_link_conversions c WHERE workspace_id=other),'customers',(SELECT jsonb_agg(to_jsonb(c)) FROM public.redirect_link_customers c WHERE workspace_id=other),'profiles',(SELECT jsonb_agg(to_jsonb(p)) FROM public.redirect_customer_profiles p WHERE workspace_id=other)) INTO snapshot;
 BEGIN PERFORM public.redirect_customer_profile('get','foreign-customer:ü',actor,NULL);RAISE EXCEPTION 'Foreign customer profile read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_customer_profile('patch','foreign-customer:ü',actor,NULL,jsonb_build_object('version',foreign_version,'name','Denied'));RAISE EXCEPTION 'Foreign customer profile changed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_customer_profile('clear','foreign-customer:ü',actor,NULL,jsonb_build_object('version',foreign_version));RAISE EXCEPTION 'Foreign customer profile cleared';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_customer_events('foreign-customer:ü',actor,NULL);RAISE EXCEPTION 'Foreign customer events read';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF public.redirect_customer_journey('foreign-customer:ü')->'data'<>'[]'::jsonb THEN RAISE EXCEPTION 'Foreign legacy journey leaked';END IF;
 IF EXISTS(SELECT FROM public.redirect_variant_performance(foreign_link)) THEN RAISE EXCEPTION 'Foreign variants leaked';END IF;
 result:=public.redirect_scoped_analytics('report');
 IF result#>>'{totals,clicks}'<>'2' OR result#>>'{totals,leads}'<>'1' OR result::text LIKE '%foreign-private%' THEN RAISE EXCEPTION 'Analytics totals/breakdowns leaked foreign events or lost local orphan';END IF;
 result:=public.redirect_analytics_page('{}',p_limit=>100);
 IF jsonb_array_length(result->'data')<>3 OR result::text LIKE '%foreign-private%' THEN RAISE EXCEPTION 'Analytics page leaked foreign events or lost legacy coverage';END IF;
 IF EXISTS(SELECT FROM public.redirect_analytics_filtered(jsonb_build_object('linkIds',jsonb_build_array(foreign_link)),ARRAY[foreign_link])) THEN RAISE EXCEPTION 'Explicit IDs bypassed analytics workspace';END IF;
 BEGIN PERFORM public.record_redirect_conversion(event||jsonb_build_object('clickId',foreign_click,'eventId','denied-foreign-click'));RAISE EXCEPTION 'Foreign click conversion attributed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.record_redirect_conversion((event-'clickId')||'{"customerExternalId":"foreign-customer:ü","eventId":"denied-foreign-anchor"}');RAISE EXCEPTION 'Foreign customer anchor attributed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.record_redirect_conversion(event||jsonb_build_object('clickId',foreign_click,'eventId','denied-native-foreign'),NULL,now());RAISE EXCEPTION 'Native signup attributed foreign click';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF EXISTS(SELECT FROM public.redirect_link_conversions WHERE provider_event_id LIKE 'denied-%') OR (SELECT count(*) FROM public.redirect_link_conversions WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01')<>1 THEN RAISE EXCEPTION 'Denied conversion left local mutation';END IF;
 -- Independently exercise the profile predicate when the same external key
 -- appears on local conversion activity. The foreign anchor/profile must stay private.
 INSERT INTO public.redirect_link_conversions(click_id,kind,customer_key,provider_event_id,event_name) VALUES(local_click,'lead','foreign-customer:ü','local-customer-collision','Local collision event');
 result:=public.redirect_customer_profile('get','foreign-customer:ü',actor,NULL);
 IF result->>'name' IS NOT NULL OR result->>'email' IS NOT NULL OR result->>'version' IS NOT NULL THEN RAISE EXCEPTION 'Foreign identity leaked through local customer activity';END IF;
 result:=public.redirect_customer_events('foreign-customer:ü',actor,NULL);
 IF jsonb_array_length(result->'data')<>2 OR result::text LIKE '%foreign-private%' OR result::text LIKE '%Foreign private%' THEN RAISE EXCEPTION 'Same-key customer journey crossed workspace';END IF;
 result:=public.redirect_customer_profile('patch','foreign-customer:ü',actor,NULL,'{"version":null,"name":"Local independent profile"}');
 IF result->>'name'<>'Local independent profile' OR result->>'version'=foreign_version::text THEN RAISE EXCEPTION 'Local same-key enrichment crossed workspace';END IF;
 IF (SELECT jsonb_build_object('events',(SELECT jsonb_agg(to_jsonb(e)) FROM public.redirect_events e WHERE workspace_id=other),'conversions',(SELECT jsonb_agg(to_jsonb(c)) FROM public.redirect_link_conversions c WHERE workspace_id=other),'customers',(SELECT jsonb_agg(to_jsonb(c)) FROM public.redirect_link_customers c WHERE workspace_id=other),'profiles',(SELECT jsonb_agg(to_jsonb(p)) FROM public.redirect_customer_profiles p WHERE workspace_id=other)))<>snapshot THEN RAISE EXCEPTION 'Denied customer/tracking work changed foreign data';END IF;
END $$;
-- The existing browser RPCs keep legacy current-role RLS and gain no ability to
-- invoke the service selector, including when a caller supplies a foreign header.
RESET ROLE;
SET LOCAL request.jwt.claims='{"role":"authenticated","user_role":"admin","sub":"00000000-0000-4000-8000-000000000081"}';
SET LOCAL request.headers='{"x-qg-redirect-workspace":"00000000-0000-4000-8000-000000000082"}';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.redirect_request_workspace(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private selector grant widened';END IF;
 IF public.redirect_analytics_report('{}')#>>'{totals,clicks}'<>'2' OR jsonb_array_length(public.redirect_analytics_page('{}')->'data')<>4 THEN RAISE EXCEPTION 'Legacy authenticated analytics compatibility or isolation failed';END IF;
 IF (jsonb_array_length(public.redirect_customer_journey('foreign-customer:ü')->'data')<>2 OR public.redirect_customer_journey('foreign-customer:ü')::text LIKE '%foreign-private%') OR jsonb_array_length(public.redirect_customer_journey('local-customer:ü')->'data')<>2 OR EXISTS(SELECT FROM public.redirect_variant_performance('00000000-0000-4000-8000-000000000083')) THEN RAISE EXCEPTION 'Legacy authenticated journey/variant isolation failed';END IF;
END $$;
RESET ROLE;
DELETE FROM public.user_roles WHERE user_id='00000000-0000-4000-8000-000000000081';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.redirect_analytics_report('{}')#>>'{totals,clicks}'<>'0' OR public.redirect_analytics_page('{}')->'data'<>'[]'::jsonb OR public.redirect_customer_journey('local-customer:ü')->'data'<>'[]'::jsonb THEN RAISE EXCEPTION 'Stale browser admin claim read analytics';END IF;
END $$;
RESET ROLE;
ROLLBACK;
