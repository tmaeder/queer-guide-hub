BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();other_user uuid:=gen_random_uuid();ios jsonb;android jsonb;changed jsonb;result jsonb;domain uuid;i integer;large_values jsonb;limit_reached boolean:=false;fingerprint text:=array_to_string(array_fill('AA'::text,ARRAY[32]),':');
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(other_user);INSERT INTO public.user_roles VALUES(actor,'admin');
 IF public.redirect_native_apps_public('queer.guide')<>'[]' THEN RAISE EXCEPTION 'Unconfigured built-in bindings fabricated';END IF;
 ios:=public.redirect_native_app_admin(actor,'create',p_values=>'{"label":"Private iOS label","platform":"ios","appId":"ABCDE12345.org.example.ios","paths":["/go/*"]}');
 IF (ios->>'enabled')::boolean OR ios->>'version' IS NULL OR ios->>'hostname'<>'queer.guide' THEN RAISE EXCEPTION 'App creation/defaults failed';END IF;
 IF public.redirect_native_apps_public('queer.guide')<>'[]' THEN RAISE EXCEPTION 'Disabled binding published';END IF;
 result:=public.redirect_native_app_admin(actor,'list');IF result->>'count'<>'1' OR result#>>'{data,0,id}'<>ios->>'id' THEN RAISE EXCEPTION 'App list failed';END IF;
 BEGIN PERFORM public.redirect_native_app_admin(other_user,'list');RAISE EXCEPTION 'Non-owner app list';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 changed:=public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"enabled":true}',(ios->>'version')::uuid);
 BEGIN PERFORM public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"label":"stale"}',(ios->>'version')::uuid);RAISE EXCEPTION 'Stale app update';EXCEPTION WHEN unique_violation THEN NULL;END;
 ios:=changed;result:=public.redirect_native_apps_public('www.queer.guide');
 IF result#>>'{0,appId}'<>'ABCDE12345.org.example.ios' OR result#>'{0}'?'label' OR result#>'{0}'?'created_by' OR result#>'{0}'?'version' THEN RAISE EXCEPTION 'Public projection leaked owner fields';END IF;
 BEGIN PERFORM public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"paths":["/*"]}',(ios->>'version')::uuid);RAISE EXCEPTION 'Built-in app claimed all paths';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.redirect_native_app_admin(actor,'create',p_values=>'{"label":"bad","platform":"android","appId":"org.example.android","paths":["/go/*"]}');RAISE EXCEPTION 'Unsigned Android binding';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 android:=public.redirect_native_app_admin(actor,'create',p_values=>jsonb_build_object('label','Android app','platform','android','appId','org.example.android','fingerprints',jsonb_build_array(fingerprint),'paths',jsonb_build_array('/go/*'),'enabled',true));
 IF jsonb_array_length(public.redirect_native_apps_public('queer.guide'))<>2 THEN RAISE EXCEPTION 'Android binding omitted';END IF;
 INSERT INTO public.redirect_domains(hostname,verification_token,ownership_state,verified_at,verified_until,provider_id) VALUES('apps.example.com',repeat('d',64),'verified',now(),now()+interval '1 day','fixture-app-domain') RETURNING id INTO domain;
 INSERT INTO public.redirect_domain_jobs(domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at) VALUES(domain,repeat('a',32),'links.queer.guide',actor,'ready','active','active',now());
 changed:=public.redirect_native_app_admin(actor,'create',p_values=>jsonb_build_object('label','Domain app','domainId',domain,'platform','ios','appId','ABCDE12345.org.example.domain','paths',jsonb_build_array('/*'),'enabled',true));
 result:=public.redirect_native_apps_public('apps.example.com');IF jsonb_array_length(result)<>1 OR result#>>'{0,appId}'<>'ABCDE12345.org.example.domain' THEN RAISE EXCEPTION 'Cross-host bindings disclosed';END IF;
 UPDATE public.redirect_domains SET disabled=true WHERE id=domain;
 IF public.redirect_native_apps_public('apps.example.com') IS NOT NULL THEN RAISE EXCEPTION 'Disabled domain published';END IF;
 changed:=public.redirect_native_app_admin(actor,'update',(changed->>'id')::uuid,'{"enabled":false}',(changed->>'version')::uuid);
 UPDATE public.redirect_domains SET disabled=false WHERE id=domain;
 IF public.redirect_native_apps_public('apps.example.com')<>'[]' THEN RAISE EXCEPTION 'Disabled custom binding published';END IF;
 UPDATE public.redirect_domain_jobs SET checked_at=now()-interval '20 minutes' WHERE domain_id=domain;
 IF public.redirect_native_apps_public('apps.example.com') IS NOT NULL THEN RAISE EXCEPTION 'Stale TLS/domain readiness published';END IF;
 DELETE FROM public.user_roles WHERE user_id=actor;
 IF public.redirect_native_apps_public('queer.guide')<>'[]' THEN RAISE EXCEPTION 'Lost publisher authority still published';END IF;
 BEGIN PERFORM public.redirect_native_app_admin(actor,'delete',(ios->>'id')::uuid,p_expected=>(ios->>'version')::uuid);RAISE EXCEPTION 'Lost owner removed app';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.user_roles VALUES(actor,'admin');
 PERFORM public.redirect_native_app_admin(actor,'delete',(ios->>'id')::uuid,p_expected=>(ios->>'version')::uuid);
 IF EXISTS(SELECT FROM jsonb_array_elements(public.redirect_native_apps_public('queer.guide')) app WHERE app->>'platform'='ios') THEN RAISE EXCEPTION 'Removed binding still published';END IF;
 SELECT jsonb_build_object('label','Large app','platform','android','paths',(SELECT jsonb_agg('/go/'||repeat('a',245)||'/'||lpad(v::text,2,'0')||'*') FROM generate_series(1,20) v),'fingerprints',(SELECT jsonb_agg(array_to_string(array_fill(upper(lpad(to_hex(v),2,'0')),ARRAY[32]),':')) FROM generate_series(1,10) v),'enabled',true) INTO large_values;
 FOR i IN 1..9 LOOP
  BEGIN
   PERFORM public.redirect_native_app_admin(actor,'create',p_values=>large_values||jsonb_build_object('appId','org.example.cap_'||i));
  EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE 'Published app settings are too large%' THEN RAISE;END IF;
   limit_reached:=true;EXIT;
  END;
 END LOOP;
 IF NOT limit_reached OR (SELECT count(*) FROM public.redirect_native_apps WHERE domain_id IS NULL)>=10 THEN RAISE EXCEPTION 'Publication byte budget did not roll back before host capacity';END IF;
 IF public.redirect_native_apps_public('unknown.example.com') IS NOT NULL THEN RAISE EXCEPTION 'Unknown host fabricated';END IF;
 IF has_table_privilege('authenticated','public.redirect_native_apps','SELECT') OR has_function_privilege('anon','public.redirect_native_apps_public(text)','EXECUTE') OR has_function_privilege('authenticated','public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'App registry exposed to Data API';END IF;
END $$;
ROLLBACK;
