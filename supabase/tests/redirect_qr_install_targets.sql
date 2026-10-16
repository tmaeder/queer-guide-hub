BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();member uuid;key uuid;visible uuid;hidden uuid;folder uuid;image jsonb;profile jsonb;draft jsonb;reserved jsonb;bad jsonb;before_events bigint;before_receipts bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(outsider);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','install-qr-test','/private-destination') RETURNING id INTO visible;
 INSERT INTO public.redirect_link_folders(name,default_permission) VALUES('Hidden install images','none') RETURNING id INTO folder;
 INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','install-qr-hidden','/private-hidden') RETURNING id INTO hidden;
 INSERT INTO public.redirect_link_metadata(redirect_key,folder_id) VALUES('redirects:'||hidden,folder);
 INSERT INTO public.redirect_workspace_members(user_id,kind,role,label) VALUES(outsider,'user','viewer','Install image viewer') RETURNING id INTO member;
 INSERT INTO public.redirect_api_tokens(name,token_hash,prefix,scopes,redirect_ids,member_id,created_by,expires_at) VALUES('Install image key',repeat('e',64),'fixture',ARRAY['links:read'],ARRAY[visible],member,actor,now()+interval '1 day') RETURNING id INTO key;
 SELECT count(*) INTO before_events FROM public.redirect_events;
 SELECT count(*) INTO before_receipts FROM public.redirect_native_handoff_receipts;
 image:=public.redirect_qr_image_resource('create',p_principal=>key,p_values=>jsonb_build_object('linkId',visible,'purpose','install','entryQuery','utm_source=poster&ref=community%2Bfriends'),p_hash=>repeat('a',64));
 IF image->>'purpose'<>'install' THEN RAISE EXCEPTION 'Install purpose did not survive authoring';END IF;
 profile:=public.redirect_public_qr_image(repeat('a',64));
 IF profile->>'url'<>'https://queer.guide/go/install-qr-test?qg_handoff=install&utm_source=poster&ref=community%2Bfriends' OR NOT(profile->>'tracked')::boolean OR profile::text LIKE '%private-destination%' THEN RAISE EXCEPTION 'Install target/campaign mismatch or destination exposure';END IF;
 UPDATE public.redirects SET slug='install-qr-renamed' WHERE id=visible;
 IF public.redirect_public_qr_image(repeat('a',64))->>'url' NOT LIKE '%/install-qr-renamed?qg_handoff=install&%' THEN RAISE EXCEPTION 'Hosted install target did not follow current slug';END IF;
 draft:=public.redirect_qr_image_resource('create',actor,p_values=>jsonb_build_object('linkId',visible,'purpose','install','entryQuery','utm_source=artwork','logoMode','custom'),p_hash=>repeat('b',64));
 reserved:=public.reserve_redirect_qr_image_logo(actor,NULL,(draft->>'id')::uuid,(draft->>'version')::uuid,'image/png',100,100,100,repeat('c',64));
 IF reserved#>>'{profile,url}'<>'https://queer.guide/go/install-qr-renamed?qg_handoff=install&utm_source=artwork' THEN RAISE EXCEPTION 'Artwork verification targeted a different URL';END IF;
 FOREACH bad IN ARRAY ARRAY[
  jsonb_build_object('url','https://example.com','purpose','install'),
  jsonb_build_object('linkId',visible,'purpose',NULL),
  jsonb_build_object('linkId',visible,'purpose','resume'),
  jsonb_build_object('linkId',visible,'purpose','visit','entryQuery','utm_source=poster'),
  jsonb_build_object('linkId',visible,'purpose','install','entryQuery','password=private'),
  jsonb_build_object('linkId',visible,'purpose','install','entryQuery','%70assword=private'),
  jsonb_build_object('linkId',visible,'purpose','install','entryQuery','qg_handoff_token=private'),
  jsonb_build_object('linkId',visible,'purpose','install','entryQuery','x-qg-handoff-action=private')
 ] LOOP
  BEGIN PERFORM public.redirect_qr_image_resource('create',actor,p_values=>bad,p_hash=>repeat('d',64));RAISE EXCEPTION 'Invalid install image accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 END LOOP;
 BEGIN PERFORM public.redirect_qr_image_resource('create',p_principal=>key,p_values=>jsonb_build_object('linkId',hidden,'purpose','install'),p_hash=>repeat('d',64));RAISE EXCEPTION 'Hidden link install image accepted';EXCEPTION WHEN no_data_found THEN NULL;END;
 UPDATE public.redirect_api_tokens SET redirect_ids=ARRAY[hidden] WHERE id=key;
 IF public.redirect_public_qr_image(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Narrowed access kept install image';END IF;
 UPDATE public.redirect_api_tokens SET redirect_ids=ARRAY[visible] WHERE id=key;
 PERFORM public.redirect_qr_image_resource('revoke',p_principal=>key,p_id=>(image->>'id')::uuid,p_values=>jsonb_build_object('version',image->>'version'));
 IF public.redirect_public_qr_image(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Revoked install image survived';END IF;
 IF before_events<>(SELECT count(*) FROM public.redirect_events) OR before_receipts<>(SELECT count(*) FROM public.redirect_native_handoff_receipts) THEN RAISE EXCEPTION 'QR authoring/profile recorded a visit or private receipt';END IF;
 IF has_function_privilege('anon','public.redirect_public_qr_image(text)','execute') OR has_table_privilege('authenticated','public.redirect_qr_image_links','SELECT') THEN RAISE EXCEPTION 'Install QR change exposed private resources';END IF;
END $$;
ROLLBACK;
