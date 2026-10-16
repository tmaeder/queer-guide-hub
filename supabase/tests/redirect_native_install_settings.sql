BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();ios jsonb;android jsonb;choices jsonb;current_app jsonb;fingerprint text:=array_to_string(array_fill('AA'::text,ARRAY[32]),':');
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 ios:=public.redirect_native_app_admin(actor,'create',p_values=>'{"label":"Private operational label","platform":"ios","appId":"ABCDE12345.org.example.install","enabled":true}');
 IF ios->>'handoffEnabled'<>'false' OR ios->'publicName'<>'null' OR public.redirect_native_install_choices('queer.guide','/go/test-install')<>'[]' THEN RAISE EXCEPTION 'Incomplete app exposed as install choice';END IF;
 BEGIN
  PERFORM public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"handoffEnabled":true}',(ios->>'version')::uuid);RAISE EXCEPTION 'Incomplete handoff enabled';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN
  UPDATE public.redirect_native_apps SET handoff_enabled=true WHERE id=(ios->>'id')::uuid;RAISE EXCEPTION 'Direct write bypassed configuration';
 EXCEPTION WHEN check_violation THEN NULL;END;
 current_app:=public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"publicName":"Visitor <app> name","storeId":"1234567890","appGroupId":"group.org.example.install","appClipId":"ABCDE12345.org.example.install.Clip","handoffEnabled":true}',(ios->>'version')::uuid);
 choices:=public.redirect_native_install_choices('queer.guide','/go/test-install');
 IF jsonb_array_length(choices)<>1 OR choices->0->>'displayName'<>'Visitor <app> name' OR choices->0->>'storeUrl'<>'https://apps.apple.com/app/id1234567890' OR choices->0->>'appClipBundleId'<>'org.example.install.Clip' OR choices::text LIKE '%Private operational label%' OR choices::text LIKE '%group.org.example.install%' OR choices::text LIKE '%version%' OR choices::text LIKE '%createdBy%' THEN RAISE EXCEPTION 'Install projection lost public/private boundary';END IF;
 IF public.redirect_native_install_choices('queer.guide','/unmatched-path')<>'[]' OR public.redirect_native_install_choices('unready.example','/go/test-install') IS NOT NULL THEN RAISE EXCEPTION 'Install choices crossed source boundary';END IF;
 BEGIN
  PERFORM public.redirect_native_app_admin(actor,'update',(ios->>'id')::uuid,'{"publicName":"Stale public name"}',(ios->>'version')::uuid);RAISE EXCEPTION 'Stale install configuration accepted';
 EXCEPTION WHEN unique_violation THEN NULL;END;
 FOR ios IN SELECT value FROM jsonb_array_elements('[{"storeId":"https://evil.example/app"},{"appGroupId":"wrong.group"},{"appGroupId":true},{"publicName":false},{"publicName":"bad\nname"},{"handoffEnabled":"yes"},{"storeId":null}]'::jsonb) LOOP
  BEGIN
   PERFORM public.redirect_native_app_admin(actor,'update',(current_app->>'id')::uuid,ios,(current_app->>'version')::uuid);RAISE EXCEPTION 'Invalid install settings accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 END LOOP;
 -- Old clients can unpublish without knowing the new flag. It is switched off,
 -- and re-publishing does not quietly turn the handoff back on.
 current_app:=public.redirect_native_app_admin(actor,'update',(current_app->>'id')::uuid,'{"enabled":false}',(current_app->>'version')::uuid);
 IF current_app->>'handoffEnabled'<>'false' OR public.redirect_native_install_choices('queer.guide','/go/test-install')<>'[]' THEN RAISE EXCEPTION 'Unpublishing retained handoffs';END IF;
 current_app:=public.redirect_native_app_admin(actor,'update',(current_app->>'id')::uuid,'{"enabled":true}',(current_app->>'version')::uuid);
 IF public.redirect_native_install_choices('queer.guide','/go/test-install')<>'[]' THEN RAISE EXCEPTION 'Re-publish silently opted in';END IF;
 android:=public.redirect_native_app_admin(actor,'create',p_values=>jsonb_build_object('label','Private Android label','platform','android','appId','org.example.install','fingerprints',jsonb_build_array(fingerprint),'enabled',true,'publicName','Public Android','storeId','org.example.install','handoffEnabled',true));
 choices:=public.redirect_native_install_choices('queer.guide','/go/test-install');
 IF jsonb_array_length(choices)<>1 OR choices->0->>'storeUrl'<>'https://play.google.com/store/apps/details?id=org.example.install' OR choices->0?'appClipBundleId' THEN RAISE EXCEPTION 'Invalid Android install choice';END IF;
 BEGIN
  PERFORM public.redirect_native_app_admin(actor,'update',(android->>'id')::uuid,'{"storeId":"org.example.other"}',(android->>'version')::uuid);RAISE EXCEPTION 'Mismatched Play package accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN
  PERFORM public.redirect_native_app_admin(actor,'update',(android->>'id')::uuid,'{"appGroupId":"group.org.example.install"}',(android->>'version')::uuid);RAISE EXCEPTION 'Android accepted App Group';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 DELETE FROM public.user_roles WHERE user_id=actor;
 IF public.redirect_native_install_choices('queer.guide','/go/test-install')<>'[]' THEN RAISE EXCEPTION 'Revoked publisher retained choices';END IF;
 IF has_function_privilege('anon','public.redirect_native_install_choices(text,text)','EXECUTE') OR has_function_privilege('authenticated','public.redirect_native_app_admin(uuid,text,uuid,jsonb,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Private configuration API grants broadened';END IF;
END $$;
ROLLBACK;
