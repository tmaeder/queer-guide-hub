-- Foreign data exists only inside this rolled-back fixture. Product activation
-- fences stay intact; private source/policy boundaries are tested independently.
BEGIN;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
ALTER TABLE public.redirect_link_folders DROP CONSTRAINT redirect_link_folders_pending_tenant_fence;
ALTER TABLE public.redirect_link_tags DROP CONSTRAINT redirect_link_tags_pending_tenant_fence;
ALTER TABLE public.redirect_link_metadata DROP CONSTRAINT redirect_link_metadata_pending_tenant_fence;
ALTER TABLE public.redirect_link_tag_assignments DROP CONSTRAINT redirect_link_tag_assignments_pending_tenant_fence;
ALTER TABLE public.redirect_link_policies DROP CONSTRAINT redirect_link_policies_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE legacy uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';other uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();foreign_link uuid:=gen_random_uuid();local_link uuid;foreign_folder uuid:=gen_random_uuid();foreign_tag uuid:=gen_random_uuid();foreign_domain uuid:=gen_random_uuid();foreign_key text;local_key text;version uuid;manifest jsonb:='[{"id":"static:/workspace-scope","source":"/workspace-scope","target":"/events","origin":"static","kind":"Static"}]';result jsonb;own_snapshot jsonb;foreign_snapshot jsonb;policy_snapshot jsonb;op jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Private link fixture','private-link-fixture');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(other,actor);
 INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by) VALUES(foreign_domain,other,'foreign-sql-scope.example.com',actor);
 INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES(foreign_link,other,'SHORT','foreign-sql-scope','https://example.org/foreign-private-link');
 INSERT INTO public.redirect_link_folders(id,workspace_id,name) VALUES(foreign_folder,other,'Foreign private link folder');
 INSERT INTO public.redirect_link_tags(id,workspace_id,name) VALUES(foreign_tag,other,'Foreign private link tag');
 foreign_key:='redirects:'||foreign_link::text;
 INSERT INTO public.redirect_link_metadata(workspace_id,redirect_key,folder_id,comment) VALUES(other,foreign_key,foreign_folder,'Foreign private link comment') RETURNING metadata_revision INTO version;
 INSERT INTO public.redirect_link_tag_assignments(workspace_id,redirect_key,tag_id) VALUES(other,foreign_key,foreign_tag);
 INSERT INTO public.redirect_link_policies(workspace_id,redirect_id,policy) VALUES(other,foreign_link,'{"preview":{"title":"Foreign private preview"}}');
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',legacy,'x-qg-redirect-session-actor',actor)::text,true);
 result:=public.redirect_management_mutate('[{"operation":"create","data":{"slug":"local-sql-scope","target":"https://example.org/local"}}]',p_actor_id=>actor);local_link:=(result#>>'{0,link,id}')::uuid;local_key:='redirects:'||local_link::text;
 SELECT to_jsonb(r) INTO own_snapshot FROM public.redirects r WHERE id=local_link;
 SELECT to_jsonb(r) INTO foreign_snapshot FROM public.redirects r WHERE id=foreign_link;
 SELECT to_jsonb(p) INTO policy_snapshot FROM public.redirect_link_policies p WHERE redirect_id=foreign_link;
 IF public.redirect_management_link(foreign_link) IS NOT NULL OR public.redirect_inventory_rank(NULL,foreign_key)<>0 THEN RAISE EXCEPTION 'Foreign link helper leaked data/capability';END IF;
 result:=public.redirect_management_list();
 IF result->>'count'<>'1' OR result::text LIKE '%foreign-private%' THEN RAISE EXCEPTION 'Managed link page/count leaked another workspace';END IF;
 IF EXISTS(SELECT FROM public.redirect_inventory_records(manifest) WHERE key=foreign_key) OR NOT EXISTS(SELECT FROM public.redirect_inventory_records(manifest) WHERE key='static:/workspace-scope') OR NOT EXISTS(SELECT FROM public.redirect_inventory_records(manifest) WHERE key=local_key) THEN RAISE EXCEPTION 'Inventory projection lost local/static coverage or leaked foreign link';END IF;
 result:=public.redirect_inventory_page(manifest);
 IF result::text LIKE '%foreign-private%' OR result::text LIKE '%Foreign private%' THEN RAISE EXCEPTION 'Inventory leaked another workspace';END IF;
 BEGIN PERFORM public.redirect_inventory_metadata(manifest,foreign_key);RAISE EXCEPTION 'Foreign inventory metadata read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_inventory_metadata(manifest,foreign_key,'{"comment":"changed"}',version);RAISE EXCEPTION 'Foreign inventory metadata changed';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF EXISTS(SELECT FROM public.redirect_inventory_records(jsonb_build_array(jsonb_build_object('id',foreign_key,'source','/forged','target','/events'))) WHERE key=foreign_key) THEN RAISE EXCEPTION 'Manifest impersonated a managed foreign link';END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('operation','update','id',foreign_link,'data',jsonb_build_object('target','https://example.org/denied')),jsonb_build_object('operation','delete','id',foreign_link))) LOOP
  BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(op),p_actor_id=>actor);RAISE EXCEPTION 'Foreign link mutation succeeded';EXCEPTION WHEN no_data_found THEN NULL;END;
 END LOOP;
 BEGIN PERFORM public.redirect_management_mutate('[{"operation":"upsert","data":{"slug":"foreign-sql-scope","target":"https://example.org/denied-upsert"}}]',p_actor_id=>actor);RAISE EXCEPTION 'Upsert stole a foreign public namespace';EXCEPTION WHEN unique_violation THEN NULL;END;
 BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(jsonb_build_object('operation','update','id',local_link,'data',jsonb_build_object('notes','rolled back')),jsonb_build_object('operation','update','id',foreign_link,'data',jsonb_build_object('notes','denied'))),p_actor_id=>actor);RAISE EXCEPTION 'Mixed-tenant batch succeeded';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF (SELECT to_jsonb(r) FROM public.redirects r WHERE id=local_link)<>own_snapshot THEN RAISE EXCEPTION 'Failed batch left partial local changes';END IF;
 BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(jsonb_build_object('operation','update','id',local_link,'data',jsonb_build_object('folderId',foreign_folder))),p_actor_id=>actor);RAISE EXCEPTION 'Foreign destination folder assigned';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(jsonb_build_object('operation','update','id',local_link,'data',jsonb_build_object('tagIds',jsonb_build_array(foreign_tag)))),p_actor_id=>actor);RAISE EXCEPTION 'Foreign tag assigned';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(jsonb_build_object('operation','create','data',jsonb_build_object('domainId',foreign_domain,'target','https://example.org/denied-domain'))),p_actor_id=>actor);RAISE EXCEPTION 'Foreign domain assigned';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_policy_resource(foreign_link,'get');RAISE EXCEPTION 'Foreign policy read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_policy_resource(foreign_link,'patch','{"cloaked":true}');RAISE EXCEPTION 'Foreign policy changed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_presentation(foreign_link,'get');RAISE EXCEPTION 'Foreign preview read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_presentation(foreign_link,'patch','{"preview":{"title":"denied"}}');RAISE EXCEPTION 'Foreign preview changed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.reserve_redirect_preview(foreign_link,p_actor_id=>actor);RAISE EXCEPTION 'Foreign preview budget reserved';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.reserve_redirect_policy_password(foreign_link,p_actor_id=>actor);RAISE EXCEPTION 'Foreign password budget reserved';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_scoped_variant_performance(foreign_link);RAISE EXCEPTION 'Foreign experiment stats read';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_password_branding_actor(actor,NULL,foreign_link);RAISE EXCEPTION 'Foreign password branding authorized';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF EXISTS(SELECT FROM public.redirect_preview_requests) OR EXISTS(SELECT FROM public.redirect_policy_password_limits) THEN RAISE EXCEPTION 'Foreign denial spent provider/CPU budgets';END IF;
 IF public.redirect_linked_domains()->>'builtinCount'<>'1' THEN RAISE EXCEPTION 'Domain facets counted another workspace link';END IF;
 IF (SELECT to_jsonb(r) FROM public.redirects r WHERE id=foreign_link)<>foreign_snapshot OR (SELECT to_jsonb(p) FROM public.redirect_link_policies p WHERE redirect_id=foreign_link)<>policy_snapshot OR NOT EXISTS(SELECT FROM public.redirect_link_metadata WHERE redirect_key=foreign_key AND metadata_revision=version AND comment='Foreign private link comment') THEN RAISE EXCEPTION 'Denied operations changed foreign state';END IF;
 -- Defend global legacy metadata keys from an inconsistent foreign association.
 -- A conflict must roll back the root change, not silently update/ignore metadata.
 DELETE FROM public.redirect_link_metadata WHERE redirect_key=local_key;
 INSERT INTO public.redirect_link_metadata(workspace_id,redirect_key,folder_id,comment) VALUES(other,local_key,foreign_folder,'Foreign private key collision') RETURNING metadata_revision INTO version;
 BEGIN PERFORM public.redirect_management_mutate(jsonb_build_array(jsonb_build_object('operation','update','id',local_link,'data',jsonb_build_object('comment','denied collision'))),p_actor_id=>actor);RAISE EXCEPTION 'Metadata conflict silently crossed workspace';EXCEPTION WHEN unique_violation THEN NULL;END;
 BEGIN PERFORM public.redirect_inventory_metadata(manifest,local_key,'{"comment":"denied collision"}',NULL);RAISE EXCEPTION 'Inventory conflict silently crossed workspace';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF (SELECT to_jsonb(r) FROM public.redirects r WHERE id=local_link)<>own_snapshot OR NOT EXISTS(SELECT FROM public.redirect_link_metadata WHERE redirect_key=local_key AND workspace_id=other AND metadata_revision=version AND comment='Foreign private key collision') THEN RAISE EXCEPTION 'Metadata conflict changed root/foreign record';END IF;
 IF (public.redirect_management_link(local_link)->>'comment') IS DISTINCT FROM '' THEN RAISE EXCEPTION 'Private metadata collision leaked its comment';END IF;
END $$;
ROLLBACK;
