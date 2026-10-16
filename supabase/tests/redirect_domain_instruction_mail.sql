BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();d jsonb;s jsonb;r jsonb;job uuid;req uuid:=gen_random_uuid();lease uuid;domain uuid;payload jsonb;batch jsonb;config text:=repeat('a',64);queue_values jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(other_actor),(outsider);INSERT INTO public.user_roles VALUES(actor,'admin'),(other_actor,'admin');
 d:=public.redirect_domain_resource('create',actor,p_values=>'{"hostname":"go.forward-community.com"}');domain:=(d->>'id')::uuid;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('draft',outsider,domain,p_target=>'links.queer.guide');RAISE EXCEPTION 'Non-owner read instructions';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 s:=public.redirect_domain_instruction_mail_action('draft',actor,domain,p_target=>'links.queer.guide');
 IF s->'records'<>jsonb_build_array(jsonb_build_object('type','CNAME','name',d->>'hostname','value','links.queer.guide.'),jsonb_build_object('type','TXT','name',d#>>'{verification,name}','value',d#>>'{verification,value}')) OR length(s->>'snapshot')<>64 THEN RAISE EXCEPTION 'Exact CNAME/TXT draft failed';END IF;
 queue_values:=jsonb_build_object('version',d->>'version','snapshot',s->>'snapshot','email','dns@example.org','requestId',req);
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values||'{"snapshot":"wrong"}',p_target=>'links.queer.guide');RAISE EXCEPTION 'Malformed digest accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values||jsonb_build_object('snapshot',repeat('b',64)),p_target=>'links.queer.guide');RAISE EXCEPTION 'Changed draft accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
 r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
 IF r->>'state'<>'queued' OR NOT(r->>'canCancel')::boolean THEN RAISE EXCEPTION 'New email not queued';END IF;
 IF public.redirect_domain_instruction_mail_latest(actor,domain)->>'id' IS DISTINCT FROM job::text OR public.redirect_domain_instruction_mail_latest(other_actor,domain) IS NOT NULL THEN RAISE EXCEPTION 'Latest email leaked across accounts or was lost';END IF;
 UPDATE public.redirect_domains SET disabled=true,archived=true WHERE id=domain;
 IF public.redirect_domain_instruction_mail_latest(actor,domain)->>'id' IS DISTINCT FROM job::text THEN RAISE EXCEPTION 'Inactive domain hid existing email';END IF;
 UPDATE public.redirect_domains SET disabled=false,archived=false WHERE id=domain;
 BEGIN PERFORM public.redirect_domain_instruction_mail_latest(outsider,domain);RAISE EXCEPTION 'Non-owner read latest email';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('authenticated','public.redirect_domain_instruction_mail_latest(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.redirect_domain_instruction_mail_latest(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Latest email RPC is not service-only';END IF;

 IF public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide')->>'id'<>job::text OR (SELECT count(*) FROM public.redirect_domain_instruction_mail WHERE domain_id=domain)<>1 THEN RAISE EXCEPTION 'Request replay duplicated email';END IF;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values||'{"email":"different@example.org"}',p_target=>'links.queer.guide');RAISE EXCEPTION 'Reused request changed recipient';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF NOT(public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values||jsonb_build_object('requestId',gen_random_uuid()),p_target=>'links.queer.guide')?'retryAfter') THEN RAISE EXCEPTION 'Email cooldown absent';END IF;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('get',other_actor,domain,p_job=>job);RAISE EXCEPTION 'Another owner read private recipient';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF public.redirect_domain_instruction_mail_action('draft',actor,domain,p_target=>'links.queer.guide')#>>'{latestMail,id}'<>job::text THEN RAISE EXCEPTION 'Receipt lost across draft reload';END IF;
 batch:=public.claim_redirect_domain_instruction_mail('Queer Guide <noreply@queer.guide>','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
 IF jsonb_array_length(batch)<>1 OR batch#>>'{0,id}'<>job::text THEN RAISE EXCEPTION 'Mail claim missing';END IF;
 IF public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job)<>'[]' THEN RAISE EXCEPTION 'Live lease reclaimed';END IF;
 payload:=jsonb_build_object('from',batch#>>'{0,from}','to',jsonb_build_array('dns@example.org'),'subject','DNS fixture','text','Exact immutable instructions','html','<p>Exact immutable instructions</p>');
 IF public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload)<>payload THEN RAISE EXCEPTION 'Mail payload not persisted';END IF;
 IF public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload) IS NOT NULL THEN RAISE EXCEPTION 'One lease allowed two sends';END IF;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('cancel',actor,domain,p_job=>job);RAISE EXCEPTION 'In-flight email falsely recalled';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF NOT public.finish_redirect_domain_instruction_mail(job,lease,'unknown') THEN RAISE EXCEPTION 'Unknown outcome not stored';END IF;
 r:=public.redirect_domain_instruction_mail_action('get',actor,domain,p_job=>job);
 IF r->>'state'<>'queued' OR(r->>'canCancel')::boolean THEN RAISE EXCEPTION 'Unknown email incorrectly claimed failed/cancellable';END IF;
 UPDATE public.redirect_domain_instruction_mail SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=job;
 batch:=public.claim_redirect_domain_instruction_mail('Changed sender <changed@example.org>','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
 IF batch#>'{0,payload}'<>payload OR batch#>>'{0,from}'<>'Queer Guide <noreply@queer.guide>' THEN RAISE EXCEPTION 'Retry changed payload/sender';END IF;
 BEGIN PERFORM public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload||'{"text":"changed"}');RAISE EXCEPTION 'Retry payload changed';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config)<>payload THEN RAISE EXCEPTION 'Stable payload unavailable';END IF;
 IF NOT public.finish_redirect_domain_instruction_mail(job,lease,'sent','provider-receipt') THEN RAISE EXCEPTION 'Provider acceptance not recorded';END IF;
 r:=public.redirect_domain_instruction_mail_action('get',actor,domain,p_job=>job);
 IF r->>'state'<>'sent' OR r->>'sentAt' IS NULL OR(r->>'canCancel')::boolean OR public.redirect_domain_resource('get',actor,domain)->>'ownershipState'<>'pending' THEN RAISE EXCEPTION 'Receipt did not mean acceptance only';END IF;
 IF public.finish_redirect_domain_instruction_mail(job,lease,'sent','duplicate') THEN RAISE EXCEPTION 'Receipt replay accepted';END IF;
 -- Cancel before send and role/snapshot changes after claim must prevent transport preparation.
 UPDATE public.redirect_domain_instruction_mail SET created_at=clock_timestamp()-interval '2 minutes' WHERE id=job;
 queue_values:=queue_values||jsonb_build_object('requestId',gen_random_uuid());r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
 r:=public.redirect_domain_instruction_mail_action('cancel',actor,domain,p_job=>job);
 IF r->>'state'<>'cancelled' OR public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job)<>'[]' THEN RAISE EXCEPTION 'Cancelled email still claimable';END IF;
 UPDATE public.redirect_domain_instruction_mail SET created_at=clock_timestamp()-interval '2 minutes' WHERE id=job;
 queue_values:=queue_values||jsonb_build_object('requestId',gen_random_uuid());r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
 batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
 DELETE FROM public.user_roles WHERE user_id=actor;
 r:=public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload);
 IF r IS NOT NULL OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'cancelled' THEN RAISE EXCEPTION 'Lost owner sent email';END IF;
 INSERT INTO public.user_roles VALUES(actor,'admin');
 UPDATE public.redirect_domain_instruction_mail SET created_at=clock_timestamp()-interval '2 minutes' WHERE id=job;
 queue_values:=queue_values||jsonb_build_object('requestId',gen_random_uuid());r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
 batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
 payload:=payload||'{"from":"sender@example.org"}';PERFORM public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload);PERFORM public.finish_redirect_domain_instruction_mail(job,lease,'unknown');
 UPDATE public.redirect_domain_instruction_mail SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=job;
 batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',repeat('b',64),1,job);
 IF batch<>'[]' OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'uncertain' THEN RAISE EXCEPTION 'Unknown send retried under different credential';END IF;
 UPDATE public.redirect_domain_instruction_mail SET created_at=clock_timestamp()-interval '2 minutes' WHERE id=job;
 queue_values:=queue_values||jsonb_build_object('requestId',gen_random_uuid());r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,queue_values,p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
 d:=public.redirect_domain_resource('rotate',actor,domain,jsonb_build_object('version',d->>'version'));
 batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);
 IF batch<>'[]' OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'cancelled' THEN RAISE EXCEPTION 'Rotated DNS challenge sent';END IF;
 -- Current certificate TXT records participate in the digest, independently of domain version.
 INSERT INTO public.redirect_domain_jobs(domain_id,zone_id,cname_target,requested_by,state,desired,validation) VALUES(domain,repeat('a',32),'links.queer.guide',actor,'waiting',true,'[{"type":"TXT","name":"_acme-challenge.go.forward-community.com","value":"certificate-proof"}]');
 UPDATE public.redirect_domains SET provider_id='certificate-provider' WHERE id=domain;
 s:=public.redirect_domain_instruction_mail_action('draft',actor,domain,p_target=>'links.queer.guide');
 IF jsonb_array_length(s->'records')<>3 THEN RAISE EXCEPTION 'Certificate record omitted';END IF;
 UPDATE public.redirect_domain_jobs SET validation='[{"type":"TXT","name":"_acme-challenge.go.forward-community.com","value":"new-proof"}]' WHERE domain_id=domain;
 BEGIN PERFORM public.redirect_domain_instruction_mail_action('queue',actor,domain,jsonb_build_object('version',d->>'version','snapshot',s->>'snapshot','email','dns@example.org','requestId',gen_random_uuid()),p_target=>'links.queer.guide');RAISE EXCEPTION 'Changed provider record accepted under old domain version';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF has_table_privilege('anon','public.redirect_domain_instruction_mail','SELECT') OR has_table_privilege('authenticated','public.redirect_domain_instruction_mail','INSERT') OR has_function_privilege('authenticated','public.redirect_domain_instruction_mail_action(text,uuid,uuid,jsonb,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.claim_redirect_domain_instruction_mail(text,text,text,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private mail grants exposed';END IF;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();d jsonb;s jsonb;r jsonb;job uuid;domain uuid;batch jsonb;old_lease uuid;lease uuid;payload jsonb;scenario text;config text:=repeat('c',64);
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 FOREACH scenario IN ARRAY ARRAY['expired','unknown-expired','expired-lease','provider-change','disabled-in-flight','attempt-limit'] LOOP
  d:=public.redirect_domain_resource('create',actor,p_values=>jsonb_build_object('hostname',scenario||'.forward-fixtures.com'));domain:=(d->>'id')::uuid;
  IF scenario='provider-change' THEN
   UPDATE public.redirect_domains SET provider_id='fixture-provider' WHERE id=domain;
   INSERT INTO public.redirect_domain_jobs(domain_id,zone_id,cname_target,requested_by,state,desired,validation) VALUES(domain,repeat('a',32),'links.queer.guide',actor,'waiting',true,jsonb_build_array(jsonb_build_object('type','TXT','name','_acme-challenge.'||(d->>'hostname'),'value','old-certificate')));
  END IF;
  s:=public.redirect_domain_instruction_mail_action('draft',actor,domain,p_target=>'links.queer.guide');
  r:=public.redirect_domain_instruction_mail_action('queue',actor,domain,jsonb_build_object('version',d->>'version','snapshot',s->>'snapshot','email','dns@example.org','requestId',gen_random_uuid()),p_target=>'links.queer.guide');job:=(r->>'id')::uuid;
  IF scenario IN('expired','attempt-limit') THEN
   UPDATE public.redirect_domain_instruction_mail SET created_at=CASE WHEN scenario='expired' THEN clock_timestamp()-interval '24 hours' ELSE created_at END,attempts=CASE WHEN scenario='attempt-limit' THEN 8 ELSE attempts END WHERE id=job;
   batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);
   IF batch<>'[]' OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'failed' THEN RAISE EXCEPTION 'Known unsent expiry/limit was not terminal';END IF;
   CONTINUE;
  END IF;
  batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
  IF public.finish_redirect_domain_instruction_mail(job,lease,'sent','false-receipt') THEN RAISE EXCEPTION 'Acceptance recorded without a prepared send';END IF;
  payload:=jsonb_build_object('from','sender@example.org','to',jsonb_build_array('dns@example.org'),'subject','DNS fixture','text','Exact instructions','html','<p>Exact instructions</p>');
  IF scenario='provider-change' THEN
   UPDATE public.redirect_domain_jobs SET validation=jsonb_build_array(jsonb_build_object('type','TXT','name','_acme-challenge.'||(d->>'hostname'),'value','new-certificate')) WHERE domain_id=domain;
   r:=public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload);
   IF r IS NOT NULL OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'cancelled' THEN RAISE EXCEPTION 'Stale certificate records sent after claim';END IF;
   CONTINUE;
  END IF;
  PERFORM public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config,payload);
  IF scenario='unknown-expired' THEN
   PERFORM public.finish_redirect_domain_instruction_mail(job,lease,'unknown');
   UPDATE public.redirect_domain_instruction_mail SET created_at=clock_timestamp()-interval '24 hours',next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=job;
   batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);
   IF batch<>'[]' OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'uncertain' THEN RAISE EXCEPTION 'Expired unknown delivery called failed';END IF;
  ELSIF scenario='expired-lease' THEN
   old_lease:=lease;UPDATE public.redirect_domain_instruction_mail SET lease_until=clock_timestamp()-interval '1 second' WHERE id=job;
   batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);lease:=(batch#>>'{0,leaseId}')::uuid;
   IF lease IS NULL OR lease=old_lease OR batch#>'{0,payload}'<>payload OR public.finish_redirect_domain_instruction_mail(job,old_lease,'sent','late-receipt') THEN RAISE EXCEPTION 'Expired send lease lost immutable identity/nonce isolation';END IF;
   PERFORM public.prepare_redirect_domain_instruction_mail(job,lease,'links.queer.guide',config);PERFORM public.finish_redirect_domain_instruction_mail(job,lease,'sent','same-identity-receipt');
  ELSE
   UPDATE public.redirect_domains SET disabled=true WHERE id=domain;
   UPDATE public.redirect_domain_instruction_mail SET lease_until=clock_timestamp()-interval '1 second' WHERE id=job;
   batch:=public.claim_redirect_domain_instruction_mail('sender@example.org','links.queer.guide',config,1,job);
   IF batch<>'[]' OR(SELECT state FROM public.redirect_domain_instruction_mail WHERE id=job)<>'uncertain' THEN RAISE EXCEPTION 'Disabled in-flight send falsely recalled';END IF;
  END IF;
 END LOOP;
END $$;
ROLLBACK;
