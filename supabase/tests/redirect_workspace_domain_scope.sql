-- Private owner and worker boundaries, independently of tenant activation fences.
BEGIN;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
ALTER TABLE public.redirect_domain_jobs DROP CONSTRAINT redirect_domain_jobs_pending_tenant_fence;
ALTER TABLE public.redirect_domain_connect_operations DROP CONSTRAINT redirect_domain_connect_operations_pending_tenant_fence;
ALTER TABLE public.redirect_domain_instruction_mail DROP CONSTRAINT redirect_domain_instruction_mail_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();domain uuid:=gen_random_uuid();link uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();mail uuid:=gen_random_uuid();leased_mail uuid:=gen_random_uuid();lease uuid:=gen_random_uuid();provider uuid:=gen_random_uuid();nonce uuid:=gen_random_uuid();version uuid;link_version timestamptz;op text;result jsonb;snapshot jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Domain scope fixture','domain-scope-fixture');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(other,actor);
 INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by,provider_id,ownership_state,verified_at,verified_until,routing_provider_id,routing_protocol,routing_seen_at) VALUES(domain,other,'foreign-domain-scope.example.com',actor,provider::text,'verified',now(),now()+interval '3 hours',provider::text,1,now()) RETURNING redirect_domains.version INTO version;
 INSERT INTO public.redirect_domain_jobs(workspace_id,domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at,create_nonce) VALUES(other,domain,repeat('a',32),'links.queer.guide',actor,'ready','active','active',now(),nonce);
 INSERT INTO public.redirects(id,workspace_id,type,slug,target,notes) VALUES(link,other,'SHORT','foreign-domain-manual','https://example.org/private-domain-manual','Foreign private manual record') RETURNING updated_at INTO link_version;
 INSERT INTO public.redirect_domain_connect_operations(id,workspace_id,domain_id,actor_id,domain_version,configuration) VALUES(operation,other,domain,actor,version,repeat('b',64));
 INSERT INTO public.redirect_domain_instruction_mail(id,workspace_id,domain_id,actor_id,request_id,domain_version,snapshot,hostname,cname_target,records,recipient_email) VALUES(mail,other,domain,actor,gen_random_uuid(),version,repeat('c',64),'foreign-domain-scope.example.com','links.queer.guide','[]','foreign-domain@example.org');
 INSERT INTO public.redirect_domain_instruction_mail(id,workspace_id,domain_id,actor_id,request_id,domain_version,snapshot,hostname,cname_target,records,recipient_email,state,lease_id,lease_until,send_started_at,transport_fingerprint) VALUES(leased_mail,other,domain,actor,gen_random_uuid(),version,repeat('c',64),'foreign-domain-scope.example.com','links.queer.guide','[]','foreign-domain@example.org','leased',lease,now()+interval '2 minutes',now(),repeat('d',64));
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace','58aa4340-8f21-4b7f-9a10-90be2da89c01','x-qg-redirect-session-actor',actor)::text,true);
 SELECT jsonb_build_object('domain',(SELECT to_jsonb(d) FROM public.redirect_domains d WHERE id=domain),'job',(SELECT to_jsonb(j) FROM public.redirect_domain_jobs j WHERE domain_id=domain),'link',(SELECT to_jsonb(r) FROM public.redirects r WHERE id=link),'operations',(SELECT jsonb_agg(to_jsonb(o)) FROM public.redirect_domain_connect_operations o WHERE workspace_id=other),'mail',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.redirect_domain_instruction_mail m WHERE workspace_id=other)) INTO snapshot;
 IF public.redirect_domain_resource('list',actor)->>'count'<>'0' OR public.redirect_domain_choices()->>'count'<>'0' OR public.redirect_domain_json(domain) IS NOT NULL OR public.redirect_domain_provider_json(domain) IS NOT NULL THEN RAISE EXCEPTION 'Private domain page/count/choices/serialization leaked foreign registry';END IF;
 IF public.redirect_public_domain('foreign-domain-scope.example.com',true) IS NOT NULL OR public.record_redirect_domain_route('foreign-domain-scope.example.com') THEN RAISE EXCEPTION 'Public hostname served or refreshed inactive workspace';END IF;
 FOREACH op IN ARRAY ARRAY['get','patch','delete','rotate','reserve'] LOOP
  BEGIN PERFORM public.redirect_domain_resource(op,actor,domain,jsonb_build_object('version',version));RAISE EXCEPTION 'Foreign domain action succeeded: %',op;EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 BEGIN PERFORM public.redirect_domain_resource('create',actor,p_values=>'{"hostname":"foreign-domain-scope.example.com"}');RAISE EXCEPTION 'Foreign global hostname taken over';EXCEPTION WHEN unique_violation THEN NULL;END;
 BEGIN PERFORM public.redirect_manual_record(actor,link);RAISE EXCEPTION 'Foreign manual record read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_manual_record(actor,link,'{"notes":"denied"}',link_version);RAISE EXCEPTION 'Foreign manual record changed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_manual_record(actor,p_values=>jsonb_build_object('slug','denied-manual-domain','target','https://example.org/denied','domain_id',domain));RAISE EXCEPTION 'Manual record assigned foreign domain';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_preference(actor,jsonb_build_object('version',public.redirect_domain_preference(actor)->>'version','domainId',domain));RAISE EXCEPTION 'Foreign primary domain chosen';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_check_result(actor,domain,version,gen_random_uuid(),'verified');RAISE EXCEPTION 'Foreign DNS proof accepted';EXCEPTION WHEN no_data_found THEN NULL;END;
 FOREACH op IN ARRAY ARRAY['connect','refresh','disconnect','adopt','confirm_absence'] LOOP
  BEGIN PERFORM public.redirect_domain_provider_action(actor,domain,version,op,repeat('a',32),'links.queer.guide');RAISE EXCEPTION 'Foreign provider action succeeded: %',op;EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 BEGIN PERFORM public.request_redirect_domain_validation_restart(actor,domain,version,repeat('a',32),'links.queer.guide');RAISE EXCEPTION 'Foreign provider restart requested';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_connect_current(actor,operation,repeat('b',64));RAISE EXCEPTION 'Foreign DNS review read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_connect_operation('reserve',actor,domain,version,repeat('b',64));RAISE EXCEPTION 'Foreign DNS discovery reserved';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_connect_operation('check',actor,domain,version,repeat('b',64),operation);RAISE EXCEPTION 'Foreign DNS callback checked';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_instruction_snapshot(domain,'links.queer.guide');RAISE EXCEPTION 'Foreign DNS records read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_instruction_mail_latest(actor,domain);RAISE EXCEPTION 'Foreign latest recipient read';EXCEPTION WHEN no_data_found THEN NULL;END;
 FOREACH op IN ARRAY ARRAY['draft','queue','get','cancel','lookup'] LOOP
  BEGIN PERFORM public.redirect_domain_instruction_mail_action(op,actor,domain,p_job=>mail,p_target=>'links.queer.guide');RAISE EXCEPTION 'Foreign DNS mail action succeeded: %',op;EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 IF public.redirect_domain_instruction_mail_json(mail) IS NOT NULL OR public.redirect_domain_instruction_current(mail,'links.queer.guide') THEN RAISE EXCEPTION 'Foreign private mail fields/currentness leaked';END IF;
 IF public.claim_redirect_domain_jobs()<>'[]'::jsonb OR public.claim_redirect_domain_instruction_mail('fixture@example.org','links.queer.guide',repeat('d',64))<>'[]'::jsonb THEN RAISE EXCEPTION 'Legacy worker leased foreign work';END IF;
 IF public.prepare_redirect_domain_instruction_mail(leased_mail,gen_random_uuid(),'links.queer.guide',repeat('d',64)) IS NOT NULL OR public.finish_redirect_domain_instruction_mail(leased_mail,gen_random_uuid(),'sent','fixture-receipt') THEN RAISE EXCEPTION 'Worker prepared/acknowledged mail with a forged lease';END IF;
 IF public.begin_redirect_domain_create(domain,lease,operation) IS NOT NULL OR public.begin_redirect_domain_validation_restart(domain,lease,operation,provider,repeat('a',32),'links.queer.guide') OR public.reserve_redirect_domain_renewal(domain,lease,operation) IS NOT NULL THEN RAISE EXCEPTION 'Worker started foreign provider work';END IF;
 IF public.record_redirect_domain_provider(domain,nonce,provider) OR public.finish_redirect_domain_job(domain,lease,operation,jsonb_build_object('kind','deleted','id',provider)) THEN RAISE EXCEPTION 'Worker recorded foreign provider receipt';END IF;
 IF EXISTS(SELECT FROM public.redirect_report_budgets) OR EXISTS(SELECT FROM public.redirects WHERE slug='denied-manual-domain') THEN RAISE EXCEPTION 'Denied foreign domain work spent budget/created record';END IF;
 IF (SELECT jsonb_build_object('domain',(SELECT to_jsonb(d) FROM public.redirect_domains d WHERE id=domain),'job',(SELECT to_jsonb(j) FROM public.redirect_domain_jobs j WHERE domain_id=domain),'link',(SELECT to_jsonb(r) FROM public.redirects r WHERE id=link),'operations',(SELECT jsonb_agg(to_jsonb(o)) FROM public.redirect_domain_connect_operations o WHERE workspace_id=other),'mail',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.redirect_domain_instruction_mail m WHERE workspace_id=other)))<>snapshot THEN RAISE EXCEPTION 'Denied domain/worker operations changed foreign snapshot';END IF;
 result:=public.redirect_manual_record(actor,p_values=>'{"type":"PATH","source_path":"/local-workspace-manual","target":"/events"}');
 IF result->>'workspace_id'<>'58aa4340-8f21-4b7f-9a10-90be2da89c01' OR result->>'source_path'<>'/local-workspace-manual' THEN RAISE EXCEPTION 'Local manual creation lost workspace/defaults';END IF;
END $$;
ROLLBACK;
