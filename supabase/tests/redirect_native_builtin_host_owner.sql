BEGIN;
ALTER TABLE public.redirect_native_apps DROP CONSTRAINT redirect_native_apps_pending_tenant_fence;
ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();one uuid;two uuid;app uuid;result jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Native host fixture','native-host-fixture');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(other,actor);
 INSERT INTO public.redirect_domains(workspace_id,hostname,created_by) VALUES(other,'native-host-one.example.org',actor) RETURNING id INTO one;
 INSERT INTO public.redirect_domains(workspace_id,hostname,created_by) VALUES(other,'native-host-two.example.org',actor) RETURNING id INTO two;
 BEGIN
  INSERT INTO public.redirect_native_apps(workspace_id,label,platform,app_id,paths,created_by) VALUES(other,'Forbidden built-in host','android','org.qg.ForbiddenHost',ARRAY['/go/*'],actor);
  RAISE EXCEPTION 'Foreign workspace acquired built-in Android association';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%redirect_native_apps_builtin_host_workspace%' THEN RAISE;END IF;
 END;
 BEGIN
  INSERT INTO public.redirect_native_apps(workspace_id,label,platform,app_id,app_clip_id,paths,created_by) VALUES(other,'Forbidden built-in iOS','ios','ABCDE12345.org.qg.HostScope','ABCDE12345.org.qg.HostScope.Clip',ARRAY['/go/*'],actor);
  RAISE EXCEPTION 'Foreign workspace acquired built-in iOS association';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%redirect_native_apps_builtin_host_workspace%' THEN RAISE;END IF;
 END;
 INSERT INTO public.redirect_native_apps(workspace_id,domain_id,label,platform,app_id,app_clip_id,paths,created_by) VALUES(other,one,'Custom host one','ios','ABCDE12345.org.qg.HostScope','ABCDE12345.org.qg.HostScope.Clip',ARRAY['/*'],actor) RETURNING id INTO app;
 INSERT INTO public.redirect_native_apps(workspace_id,domain_id,label,platform,app_id,app_clip_id,paths,created_by) VALUES(other,two,'Custom host two','ios','ABCDE12345.org.qg.HostScope','ABCDE12345.org.qg.HostScope.Clip',ARRAY['/*'],actor);
 BEGIN UPDATE public.redirect_native_apps SET domain_id=NULL WHERE id=app;RAISE EXCEPTION 'Custom binding moved to built-in host';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN
  INSERT INTO public.redirect_native_apps(workspace_id,domain_id,label,platform,app_id,paths,created_by) VALUES(other,one,'Duplicate host binding','ios','ABCDE12345.org.qg.HostScope',ARRAY['/*'],actor);
  RAISE EXCEPTION 'Duplicate identity on one host accepted';
 EXCEPTION WHEN unique_violation THEN NULL;END;
 -- The existing composite FK still rejects attaching a foreign domain locally.
 BEGIN
  INSERT INTO public.redirect_native_apps(domain_id,label,platform,app_id,paths,created_by) VALUES(one,'Cross-tenant domain','android','org.qg.CrossTenant',ARRAY['/*'],actor);
  RAISE EXCEPTION 'Cross-tenant native domain accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 result:=public.redirect_native_app_admin(actor,'create',p_values=>'{"label":"Legacy host binding","platform":"ios","appId":"ABCDE12345.org.qg.HostScope","appClipId":"ABCDE12345.org.qg.HostScope.Clip","enabled":true}');
 IF result->>'hostname'<>'queer.guide' THEN RAISE EXCEPTION 'Legacy built-in app compatibility changed';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',other)::text,true);
 result:=public.redirect_native_apps_public('queer.guide');
 IF jsonb_array_length(result)<>1 OR result#>>'{0,appId}'<>'ABCDE12345.org.qg.HostScope' THEN RAISE EXCEPTION 'Built-in publication lost legacy host binding';END IF;
 IF public.redirect_native_apps_public('native-host-one.example.org')<>'[]'::jsonb THEN RAISE EXCEPTION 'Provisioning foreign host became public';END IF;
END $$;
ROLLBACK;
