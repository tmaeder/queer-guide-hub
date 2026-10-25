BEGIN;
ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;
ALTER TABLE public.redirect_link_folders DROP CONSTRAINT redirect_link_folders_pending_tenant_fence;
ALTER TABLE public.redirect_access_requests DROP CONSTRAINT redirect_access_requests_pending_tenant_fence;
ALTER TABLE public.redirect_access_mail DROP CONSTRAINT redirect_access_mail_pending_tenant_fence;
ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
ALTER TABLE public.redirect_domain_instruction_mail DROP CONSTRAINT redirect_domain_instruction_mail_pending_tenant_fence;
DO $$ DECLARE fence text; BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing workspace activation fence';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE workspace uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();domain uuid:=gen_random_uuid();job uuid:=gen_random_uuid();lease uuid;batch jsonb;snapshot jsonb;payload jsonb;before jsonb;op text;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(workspace,'Instruction worker scope','instruction-worker-scope');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(workspace,actor);
 INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by) VALUES(domain,workspace,'future-mail.example.org',actor);
 snapshot:=redirect_internal.domain_instruction_snapshot(workspace,domain,'links.queer.guide');
 INSERT INTO public.redirect_domain_instruction_mail(id,workspace_id,domain_id,actor_id,request_id,domain_version,snapshot,hostname,cname_target,records,recipient_email)
 SELECT job,workspace,id,actor,gen_random_uuid(),version,snapshot->>'snapshot',hostname,'links.queer.guide',snapshot->'records','dns@example.org' FROM public.redirect_domains WHERE id=domain;
 -- Malformed visitor headers must never select a worker's private tenant.
 PERFORM set_config('request.headers','{"x-qg-redirect-workspace":"not-a-workspace"}',true);
 batch:=public.claim_redirect_domain_instruction_mail('Queer Guide <noreply@queer.guide>','links.queer.guide',repeat('a',64),1,job);
 IF batch<>'[]'::jsonb OR public.redirect_domain_instruction_current(job,'links.queer.guide') THEN RAISE EXCEPTION 'Provisioning workspace authorized mail';END IF;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 batch:=public.claim_redirect_domain_instruction_mail('Queer Guide <noreply@queer.guide>','links.queer.guide',repeat('a',64),1,job);
 IF jsonb_array_length(batch)<>1 OR batch#>>'{0,id}' IS DISTINCT FROM job::text OR batch#>>'{0,hostname}'<>'future-mail.example.org' THEN RAISE EXCEPTION 'Active source job claim failed';END IF;
 lease:=(batch#>>'{0,leaseId}')::uuid;
 payload:=jsonb_build_object('from','Queer Guide <noreply@queer.guide>','to',jsonb_build_array('dns@example.org'),'subject','DNS instructions','text','Fixture DNS instructions','html','<p>Fixture DNS instructions</p>');
 IF public.prepare_redirect_domain_instruction_mail(job,gen_random_uuid(),'links.queer.guide',repeat('a',64),payload) IS NOT NULL THEN RAISE EXCEPTION 'Forged mail lease prepared';END IF;
 UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=workspace;
 IF public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',repeat('a',64),payload) IS NOT NULL THEN RAISE EXCEPTION 'Inactive workspace prepared transport';END IF;
 IF (SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'cancelled' THEN RAISE EXCEPTION 'Pre-send deactivation did not close job';END IF;
 -- A new attempt may be queued only by the isolated fixture, then it must again
 -- pass current workspace/owner/snapshot checks before setting send_started_at.
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 UPDATE public.redirect_domain_instruction_mail SET state='queued',next_attempt_at=clock_timestamp() WHERE id=job;
 batch:=public.claim_redirect_domain_instruction_mail('Queer Guide <noreply@queer.guide>','links.queer.guide',repeat('a',64),1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
 IF public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',repeat('a',64),payload) IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Source workspace payload preparation failed';END IF;
 UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=workspace;
 DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=workspace;
 IF NOT public.finish_redirect_domain_instruction_mail(job,lease,'sent','fixture-provider-receipt') THEN RAISE EXCEPTION 'Postflight receipt lost after deactivation/owner loss';END IF;
 SELECT to_jsonb(m) INTO before FROM public.redirect_domain_instruction_mail m WHERE id=job;
 IF before->>'state'<>'sent' OR before->>'provider_id'<>'fixture-provider-receipt' OR before->>'sent_at' IS NULL THEN RAISE EXCEPTION 'Provider receipt was not durable';END IF;
 IF public.finish_redirect_domain_instruction_mail(job,lease,'sent','replayed-receipt') OR public.finish_redirect_domain_instruction_mail(job,gen_random_uuid(),'sent','forged-receipt') THEN RAISE EXCEPTION 'Replayed/forged completion accepted';END IF;
 IF (SELECT to_jsonb(m) FROM public.redirect_domain_instruction_mail m WHERE id=job) IS DISTINCT FROM before THEN RAISE EXCEPTION 'Rejected receipt changed source job';END IF;
 FOREACH op IN ARRAY ARRAY['redirect_internal.domain_instruction_snapshot(uuid,uuid,text)','public.redirect_domain_instruction_current(uuid,text)','public.claim_redirect_domain_instruction_mail(text,text,text,integer,uuid)','public.prepare_redirect_domain_instruction_mail(uuid,uuid,text,text,jsonb)','public.finish_redirect_domain_instruction_mail(uuid,uuid,text,text,integer,boolean)'] LOOP
  IF has_function_privilege('authenticated',op,'EXECUTE') OR has_function_privilege('anon',op,'EXECUTE') THEN RAISE EXCEPTION 'Private mail worker grant exposed: %',op;END IF;
 END LOOP;
END $$;
DO $$
DECLARE workspace uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();requester uuid:=gen_random_uuid();folder uuid:=gen_random_uuid();member uuid:=gen_random_uuid();request uuid:=gen_random_uuid();job uuid:=gen_random_uuid();lease uuid;batch jsonb;receipt jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,'future-owner@example.org',clock_timestamp()),(requester,'future-requester@example.org',clock_timestamp());
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(workspace,'Access notification worker','access-notification-worker');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(workspace,actor);
 INSERT INTO public.redirect_workspace_members(id,workspace_id,user_id,kind,label,role) VALUES(member,workspace,requester,'user','Fixture requester','viewer');
 INSERT INTO public.redirect_link_folders(id,workspace_id,name) VALUES(folder,workspace,'Future fixture folder');
 INSERT INTO public.redirect_access_requests(id,workspace_id,folder_id,member_id) VALUES(request,workspace,folder,member);
 INSERT INTO public.redirect_access_mail(id,workspace_id,request_id,recipient_user_id,recipient_email,event) VALUES(job,workspace,request,actor,'future-owner@example.org','requested');
 batch:=public.claim_redirect_access_mail('Queer Guide <noreply@queer.guide>',1);
 IF batch<>'[]'::jsonb THEN RAISE EXCEPTION 'Inactive workspace leased an access notification';END IF;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=workspace;
 batch:=public.claim_redirect_access_mail('Queer Guide <noreply@queer.guide>',1);
 IF jsonb_array_length(batch)<>1 OR batch#>>'{0,id}' IS DISTINCT FROM job::text OR batch#>>'{0,email}'<>'future-owner@example.org' THEN RAISE EXCEPTION 'Source folder-owner notification claim failed';END IF;
 lease:=(batch#>>'{0,leaseId}')::uuid;
 IF public.finish_redirect_access_mail(job,gen_random_uuid(),'forged') THEN RAISE EXCEPTION 'Forged notification receipt accepted';END IF;
 UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=workspace;
 DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=workspace;
 IF NOT public.finish_redirect_access_mail(job,lease,'fixture-access-receipt') THEN RAISE EXCEPTION 'Access notification postflight receipt was lost';END IF;
 SELECT to_jsonb(m) INTO receipt FROM public.redirect_access_mail m WHERE id=job;
 IF receipt->>'state'<>'sent' OR receipt->>'provider_id'<>'fixture-access-receipt' OR receipt->>'lease_id' IS NOT NULL THEN RAISE EXCEPTION 'Access receipt did not close exact source lease';END IF;
 IF public.finish_redirect_access_mail(job,lease,'replay') THEN RAISE EXCEPTION 'Notification receipt replay accepted';END IF;
 IF has_function_privilege('authenticated','redirect_internal.folder_owner_ids(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','redirect_internal.folder_owner_ids(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Explicit folder owner helper exposed';END IF;
END $$;
ROLLBACK;
