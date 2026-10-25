BEGIN;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
ALTER TABLE public.redirect_link_metadata DROP CONSTRAINT redirect_link_metadata_pending_tenant_fence;
ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
ALTER TABLE public.redirect_link_conversions DROP CONSTRAINT redirect_link_conversions_pending_tenant_fence;
ALTER TABLE public.redirect_webhooks DROP CONSTRAINT redirect_webhooks_pending_tenant_fence;
ALTER TABLE public.redirect_webhook_events DROP CONSTRAINT redirect_webhook_events_pending_tenant_fence;
ALTER TABLE public.redirect_webhook_deliveries DROP CONSTRAINT redirect_webhook_deliveries_pending_tenant_fence;
ALTER TABLE public.redirect_webhook_attempts DROP CONSTRAINT redirect_webhook_attempts_pending_tenant_fence;
ALTER TABLE public.redirect_webhook_budgets DROP CONSTRAINT redirect_webhook_budgets_pending_tenant_fence;
ALTER TABLE public.redirect_api_tokens DROP CONSTRAINT redirect_api_tokens_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE legacy uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';other uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();foreign_owner uuid:=gen_random_uuid();foreign_hook uuid:=gen_random_uuid();own_hook uuid;foreign_link uuid:=gen_random_uuid();own_link uuid;foreign_click uuid:=gen_random_uuid();own_click uuid:=gen_random_uuid();foreign_token uuid:=gen_random_uuid();foreign_filter_link uuid:=gen_random_uuid();expired_delivery uuid;expired_lease uuid:=gen_random_uuid();foreign_delivery uuid;foreign_lease uuid:=gen_random_uuid();foreign_event uuid;version uuid;snapshot jsonb;result jsonb;op text;secret text:='whsec_'||repeat('Q',43)||'=';
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Webhook scope fixture','webhook-scope-fixture');
 INSERT INTO auth.users(id) VALUES(foreign_owner);
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id,granted_by) VALUES(other,foreign_owner,actor);
 INSERT INTO public.redirect_webhooks(id,workspace_id,created_by,name,url,event_types,secret,include_customer_id,previous_secret,previous_key_version,previous_expires_at) VALUES(foreign_hook,other,foreign_owner,'Foreign private receiver','https://foreign-receiver.example.org/events',ARRAY['link.created','link.updated','link.deleted','link.clicked','lead.created','sale.created'],secret,true,secret,gen_random_uuid(),now()-interval '1 day') RETURNING redirect_webhooks.version INTO version;
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',legacy,'x-qg-redirect-session-actor',actor)::text,true);
 result:=public.redirect_webhook_resource('create',actor,NULL,p_values=>'{"name":"Local receiver","url":"https://local-receiver.example.org/events","includeCustomerId":true,"eventTypes":["link.created","link.updated","link.deleted","link.clicked","lead.created","sale.created"]}',p_secret=>secret);own_hook:=(result->>'id')::uuid;
 -- Source-row identity must win over a conflicting request workspace header.
 INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES(foreign_link,other,'SHORT','foreign-webhook-source','https://example.org/private-foreign-target');
 INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,path) VALUES(other,foreign_link,foreign_click,'/foreign-webhook-source');
 INSERT INTO public.redirect_link_conversions(workspace_id,click_id,kind,customer_key,provider_event_id,event_name) VALUES(other,foreign_click,'lead','foreign-private-customer','foreign-webhook-conversion','Foreign private conversion');
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',other)::text,true);
 INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','local-webhook-source','https://example.org/private-local-target') RETURNING id INTO own_link;
 INSERT INTO public.redirect_events(redirect_id,click_id,path) VALUES(own_link,own_click,'/local-webhook-source');
 INSERT INTO public.redirect_link_conversions(click_id,kind,customer_key,provider_event_id,event_name) VALUES(own_click,'lead','local-private-customer','local-webhook-conversion','Local private conversion');
 -- Generic inventory keys have no physical root FK: a foreign association
 -- under a local root key must not disclose that root through the elevated trigger.
 INSERT INTO public.redirect_link_metadata(workspace_id,redirect_key,comment) VALUES(other,'redirects:'||own_link,'Foreign mismatched root association');
 IF (SELECT count(*) FROM public.redirect_webhook_deliveries WHERE webhook_id=foreign_hook)<>3 OR (SELECT count(*) FROM public.redirect_webhook_deliveries WHERE webhook_id=own_hook)<>3 THEN RAISE EXCEPTION 'Producer lost events or crossed workspace subscriptions';END IF;
 IF EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE webhook_id=own_hook AND body LIKE '%foreign%') OR EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE webhook_id=foreign_hook AND body LIKE '%local%') OR EXISTS(SELECT FROM public.redirect_webhook_deliveries d JOIN public.redirect_webhook_events e ON e.id=d.event_id WHERE d.workspace_id<>e.workspace_id) THEN RAISE EXCEPTION 'Elevated producer leaked another workspace payload';END IF;
 -- Coalescing and deleted-root payloads retain authoritative source identity.
 UPDATE public.redirects SET notes='foreign update' WHERE id=foreign_link;
 DELETE FROM public.redirects WHERE id=foreign_link;
 IF NOT EXISTS(SELECT FROM public.redirect_webhook_events WHERE workspace_id=other AND redirect_id=foreign_link AND type='link.deleted') OR EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE webhook_id=own_hook AND body LIKE '%'||foreign_link||'%') THEN RAISE EXCEPTION 'Deleted foreign root event crossed workspace';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',legacy,'x-qg-redirect-session-actor',actor)::text,true);
 INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES(foreign_filter_link,other,'SHORT','foreign-webhook-filter','https://example.org/foreign-filter');
 INSERT INTO public.redirect_api_tokens(id,workspace_id,name,token_hash,prefix,scopes,created_by,expires_at) VALUES(foreign_token,other,'Foreign webhook credential',repeat('a',64),'fixture',ARRAY['workspace:read','workspace:write','events:read'],foreign_owner,now()+interval '1 day');
 SELECT id,event_id INTO foreign_delivery,foreign_event FROM public.redirect_webhook_deliveries WHERE webhook_id=foreign_hook ORDER BY sequence LIMIT 1;
 UPDATE public.redirect_webhook_deliveries SET state='leased',lease=foreign_lease,lease_until=now()+interval '1 hour',attempts=1,cycle_attempts=1 WHERE id=foreign_delivery;
 INSERT INTO public.redirect_webhook_attempts(workspace_id,delivery_id,number,lease) VALUES(other,foreign_delivery,1,foreign_lease);
 UPDATE public.redirect_webhook_deliveries SET state='delivered',finished_at=now()-interval '40 days' WHERE webhook_id=foreign_hook AND id<>foreign_delivery;
 SELECT id INTO expired_delivery FROM public.redirect_webhook_deliveries WHERE webhook_id=foreign_hook AND id<>foreign_delivery ORDER BY sequence LIMIT 1;
 UPDATE public.redirect_webhook_deliveries SET state='leased',lease=expired_lease,lease_until=now()-interval '1 second',attempts=1,cycle_attempts=1,finished_at=NULL WHERE id=expired_delivery;
 INSERT INTO public.redirect_webhook_attempts(workspace_id,delivery_id,number,lease) VALUES(other,expired_delivery,1,expired_lease);
 INSERT INTO public.redirect_webhook_events(workspace_id,id,source_key,type,data,created_at) VALUES(other,gen_random_uuid(),'foreign-orphan-history','webhook.test','{}',now()-interval '40 days');
 INSERT INTO public.redirect_webhook_budgets(workspace_id,bucket,window_at,attempts) VALUES(other,'foreign-private-budget',now()-interval '3 days',2);
 SELECT jsonb_build_object('hooks',(SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.redirect_webhooks w WHERE workspace_id=other),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.redirect_webhook_events e WHERE workspace_id=other),'deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.redirect_webhook_deliveries d WHERE workspace_id=other),'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.redirect_webhook_attempts a WHERE workspace_id=other),'budgets',(SELECT jsonb_agg(to_jsonb(b)) FROM public.redirect_webhook_budgets b WHERE workspace_id=other)) INTO snapshot;
 IF public.redirect_webhook_resource('list',actor,NULL)->>'count'<>'1' OR public.redirect_webhook_json(foreign_hook) IS NOT NULL OR public.redirect_webhook_delivery_json(foreign_delivery,true) IS NOT NULL THEN RAISE EXCEPTION 'Foreign webhook metadata/body leaked';END IF;
 FOREACH op IN ARRAY ARRAY['get','patch','archive','rotate','test'] LOOP
  BEGIN PERFORM public.redirect_webhook_resource(op,actor,NULL,foreign_hook,jsonb_build_object('version',version,'name','Denied'),secret);RAISE EXCEPTION 'Foreign webhook action succeeded: %',op;EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 FOREACH op IN ARRAY ARRAY['list','get','attempts','replay'] LOOP
  BEGIN PERFORM public.redirect_webhook_delivery_resource(op,actor,NULL,foreign_hook,foreign_delivery);RAISE EXCEPTION 'Foreign delivery action succeeded: %',op;EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 BEGIN PERFORM public.redirect_webhook_resource('create',actor,NULL,p_values=>jsonb_build_object('name','Denied filter','url','https://local-receiver.example.org/events','linkIds',jsonb_build_array(foreign_filter_link)),p_secret=>secret);RAISE EXCEPTION 'Foreign link filter assigned';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 foreign_event:=public.redirect_webhook_enqueue('webhook.test',NULL,'foreign-orphan-history','{"message":"local-only"}',own_hook);
 IF public.redirect_webhook_enqueue('webhook.test',NULL,'foreign-orphan-history','{"message":"retry"}',own_hook) IS DISTINCT FROM foreign_event OR (SELECT count(*) FROM public.redirect_webhook_events WHERE source_key='foreign-orphan-history')<>2 OR NOT EXISTS(SELECT FROM public.redirect_webhook_events WHERE id=foreign_event AND workspace_id=legacy AND data='{"message":"local-only"}') THEN RAISE EXCEPTION 'Workspace source keys lost independence or once-only idempotency';END IF;
 BEGIN PERFORM public.redirect_webhook_actor(actor,foreign_token);RAISE EXCEPTION 'Foreign owner credential accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.redirect_webhook_enqueue('webhook.test',NULL,'denied-foreign-test','{}',foreign_hook);RAISE EXCEPTION 'Foreign test event queued';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.prepare_redirect_webhook_delivery(foreign_delivery,gen_random_uuid());RAISE EXCEPTION 'Foreign signing secret/body prepared';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.finish_redirect_webhook_delivery(foreign_delivery,gen_random_uuid(),200,NULL,'private excerpt',1);RAISE EXCEPTION 'Foreign receipt acknowledged';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF (SELECT jsonb_build_object('hooks',(SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.redirect_webhooks w WHERE workspace_id=other),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.redirect_webhook_events e WHERE workspace_id=other),'deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.redirect_webhook_deliveries d WHERE workspace_id=other),'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.redirect_webhook_attempts a WHERE workspace_id=other),'budgets',(SELECT jsonb_agg(to_jsonb(b)) FROM public.redirect_webhook_budgets b WHERE workspace_id=other)))<>snapshot THEN RAISE EXCEPTION 'Denied foreground/forged worker calls changed foreign snapshot';END IF;
 result:=public.claim_redirect_webhook_deliveries();
 IF jsonb_array_length(result)<>1 OR EXISTS(SELECT FROM jsonb_array_elements(result) r JOIN public.redirect_webhook_deliveries d ON d.id=(r->>'id')::uuid WHERE d.workspace_id<>legacy) OR EXISTS(SELECT FROM public.redirect_webhook_attempts WHERE delivery_id=(result#>>'{0,id}')::uuid AND workspace_id<>legacy) THEN RAISE EXCEPTION 'Worker leased/created attempt across workspace';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE id=expired_delivery AND state='retry' AND lease IS NULL) OR NOT EXISTS(SELECT FROM public.redirect_webhook_attempts WHERE lease=expired_lease AND error_code='lease_expired' AND finished_at IS NOT NULL) THEN RAISE EXCEPTION 'Global lease recovery missed inactive workspace history';END IF;
 PERFORM public.prune_redirect_webhooks();
 IF NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE id=foreign_delivery AND state='leased' AND lease=foreign_lease) OR NOT EXISTS(SELECT FROM public.redirect_webhook_attempts WHERE lease=foreign_lease AND finished_at IS NULL) THEN RAISE EXCEPTION 'Global retention changed an in-flight receipt';END IF;
 IF EXISTS(SELECT FROM public.redirect_webhooks WHERE id=foreign_hook AND previous_secret IS NOT NULL) OR EXISTS(SELECT FROM public.redirect_webhook_events WHERE workspace_id=other AND source_key='foreign-orphan-history') OR EXISTS(SELECT FROM public.redirect_webhook_budgets WHERE workspace_id=other AND bucket='foreign-private-budget') OR EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE webhook_id=foreign_hook AND state='delivered' AND finished_at<now()-interval '30 days') THEN RAISE EXCEPTION 'Global retention left expired webhook history/secrets/budgets';END IF;

 IF has_function_privilege('authenticated','redirect_internal.enqueue_workspace_webhook(uuid,text,uuid,text,jsonb,uuid)','EXECUTE') OR has_schema_privilege('authenticated','redirect_internal','USAGE') THEN RAISE EXCEPTION 'Internal producer authority leaked';END IF;
END $$;
ROLLBACK;
