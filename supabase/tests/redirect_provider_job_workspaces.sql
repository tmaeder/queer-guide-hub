BEGIN;
ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
ALTER TABLE public.redirect_domain_jobs DROP CONSTRAINT redirect_domain_jobs_pending_tenant_fence;
DO $$ DECLARE fence text; BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fence';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE workspace uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();domain uuid:=gen_random_uuid();provider uuid:=gen_random_uuid();lease uuid;operation uuid;nonce uuid;batch jsonb;proof jsonb;result jsonb;before jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(workspace,'Provider worker fixture','provider-worker-fixture');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(workspace,actor);
 INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by,ownership_state,verified_at,verified_until) VALUES(domain,workspace,'future-provider.example.org',actor,'verified',clock_timestamp(),clock_timestamp()+interval '3 hours');
 INSERT INTO public.redirect_domain_jobs(workspace_id,domain_id,zone_id,cname_target,requested_by) VALUES(workspace,domain,repeat('a',32),'links.queer.guide',actor);
 PERFORM set_config('request.headers','{"x-qg-redirect-workspace":"not-a-workspace"}',true);
 batch:=public.claim_redirect_domain_jobs(1);
 IF batch<>'[]'::jsonb THEN RAISE EXCEPTION 'Inactive provider job claimed';END IF;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 batch:=public.claim_redirect_domain_jobs(1);
 IF jsonb_array_length(batch)<>1 OR batch#>>'{0,id}' IS DISTINCT FROM domain::text OR batch#>>'{0,kind}'<>'preflight' THEN RAISE EXCEPTION 'Active provider source not claimed';END IF;
 lease:=(batch#>>'{0,lease}')::uuid;operation:=(batch#>>'{0,operation}')::uuid;
 IF public.begin_redirect_domain_create(domain,gen_random_uuid(),operation) IS NOT NULL THEN RAISE EXCEPTION 'Forged lease began provider create';END IF;
 nonce:=public.begin_redirect_domain_create(domain,lease,operation);
 IF nonce IS NULL THEN RAISE EXCEPTION 'Source-bound create intent missing';END IF;
 UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=workspace;
 DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=workspace;
 IF public.record_redirect_domain_provider(domain,gen_random_uuid(),provider) OR NOT public.record_redirect_domain_provider(domain,nonce,provider) THEN RAISE EXCEPTION 'Nonce-bound external creation truth lost after deactivation';END IF;
 result:=jsonb_build_object('kind','status','id',provider,'hostname','future-provider.example.org','hostnameStatus','active','sslStatus','active','validation','[]'::jsonb);
 IF NOT public.finish_redirect_domain_job(domain,lease,operation,result) THEN RAISE EXCEPTION 'Provider status receipt lost after role/status change';END IF;
 IF public.redirect_public_domain('future-provider.example.org',true) IS NOT NULL THEN RAISE EXCEPTION 'Stored receipt activated an inactive workspace';END IF;
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(workspace,actor);
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 UPDATE public.redirect_domain_jobs SET next_attempt_at=clock_timestamp() WHERE domain_id=domain;
 batch:=public.claim_redirect_domain_jobs(1);lease:=(batch#>>'{0,lease}')::uuid;operation:=(batch#>>'{0,operation}')::uuid;
 proof:=public.reserve_redirect_domain_renewal(domain,lease,operation);
 IF proof->>'actor' IS DISTINCT FROM actor::text OR proof->>'attempt' IS NULL OR proof#>>'{verification,name}'<>'_qg-redirect.future-provider.example.org' THEN RAISE EXCEPTION 'Source-bound background DNS reservation failed';END IF;
 SELECT to_jsonb(d) INTO before FROM public.redirect_domains d WHERE id=domain;
 IF public.finish_redirect_domain_renewal(domain,gen_random_uuid(),operation,(proof->>'version')::uuid,(proof->>'attempt')::uuid,'verified') THEN RAISE EXCEPTION 'Forged renewal lease accepted';END IF;
 IF (SELECT to_jsonb(d) FROM public.redirect_domains d WHERE id=domain) IS DISTINCT FROM before THEN RAISE EXCEPTION 'Forged renewal changed source';END IF;
 UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=workspace;
 IF public.finish_redirect_domain_renewal(domain,lease,operation,(proof->>'version')::uuid,(proof->>'attempt')::uuid,'verified') THEN RAISE EXCEPTION 'Inactive workspace renewed ownership';END IF;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 IF NOT public.finish_redirect_domain_renewal(domain,lease,operation,(proof->>'version')::uuid,(proof->>'attempt')::uuid,'verified') THEN RAISE EXCEPTION 'Valid source-bound DNS proof not persisted';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=domain AND verified_until>clock_timestamp()+interval '23 hours' AND verification_attempt IS NULL) THEN RAISE EXCEPTION 'Source DNS proof did not renew exact domain';END IF;
 IF NOT public.finish_redirect_domain_job(domain,lease,operation,result) THEN RAISE EXCEPTION 'Provider refresh completion failed';END IF;
 -- An active workspace with a different current owner cannot continue the
 -- previous owner's refresh/create/adoption permission.
 INSERT INTO auth.users(id) VALUES(gen_random_uuid()) RETURNING id INTO lease;
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(workspace,lease);
 DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=workspace AND user_id=actor;
 UPDATE public.redirect_domain_jobs SET next_attempt_at=clock_timestamp() WHERE domain_id=domain;
 batch:=public.claim_redirect_domain_jobs(1);
 IF batch<>'[]'::jsonb OR (SELECT state FROM public.redirect_domain_jobs WHERE domain_id=domain)<>'failed' THEN RAISE EXCEPTION 'Revoked provider creator retained refresh permission';END IF;
 IF has_function_privilege('authenticated','public.finish_redirect_domain_renewal(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.finish_redirect_domain_renewal(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Background DNS receipt callable by public roles';END IF;
END $$;
ROLLBACK;
