-- Exercise composite FKs independently of the activation fence. These temporary
-- test-only fence removals and all second-tenant fixtures roll back together.
BEGIN;
ALTER TABLE public.redirect_link_folders DROP CONSTRAINT redirect_link_folders_pending_tenant_fence;
ALTER TABLE public.redirect_link_tags DROP CONSTRAINT redirect_link_tags_pending_tenant_fence;
ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;
SET LOCAL ROLE service_role;
DO $$
DECLARE legacy uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';other uuid:=gen_random_uuid();folder uuid:=gen_random_uuid();tag uuid:=gen_random_uuid();member uuid:=gen_random_uuid();metadata_key text:='fixture:workspace-relationship';d jsonb;actor uuid:=gen_random_uuid();r record;n integer:=0;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Relationship fixture','relationship-fixture');
 INSERT INTO public.redirect_link_folders(id,name,workspace_id) VALUES(folder,'Second tenant folder',other);
 INSERT INTO public.redirect_link_tags(id,name,workspace_id) VALUES(tag,'Second tenant tag',other);
 INSERT INTO public.redirect_workspace_members(id,kind,label,workspace_id) VALUES(member,'machine','Second tenant machine',other);
 INSERT INTO public.redirect_link_metadata(redirect_key) VALUES(metadata_key);
 BEGIN INSERT INTO public.redirect_link_metadata(redirect_key,folder_id) VALUES('fixture:wrong-folder',folder);RAISE EXCEPTION 'Cross-workspace folder attachment accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN INSERT INTO public.redirect_link_tag_assignments(redirect_key,tag_id) VALUES(metadata_key,tag);RAISE EXCEPTION 'Cross-workspace tag attachment accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 INSERT INTO public.redirect_link_folders(id,name) VALUES(gen_random_uuid(),'Legacy fixture folder') RETURNING id INTO folder;
 BEGIN INSERT INTO public.redirect_folder_members(folder_id,member_id,permission) VALUES(folder,member,'edit');RAISE EXCEPTION 'Cross-workspace member grant accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN INSERT INTO public.redirect_api_tokens(name,token_hash,prefix,scopes,created_by,member_id,expires_at) VALUES('Cross-workspace key',repeat('a',64),'fixture',ARRAY['links:read'],actor,member,clock_timestamp()+interval '1 day');RAISE EXCEPTION 'Cross-workspace token binding accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 INSERT INTO public.redirect_link_metadata(redirect_key,folder_id) VALUES('fixture:nullable-folder',folder);
 DELETE FROM public.redirect_link_folders WHERE id=folder;
 IF (SELECT folder_id IS NOT NULL OR workspace_id<>legacy FROM public.redirect_link_metadata WHERE redirect_key='fixture:nullable-folder') THEN RAISE EXCEPTION 'SET NULL deleted workspace identity';END IF;
 d:=public.redirect_domain_resource('create',actor,p_values=>'{"hostname":"relationship-community.example.com"}');
 UPDATE public.redirect_domain_preferences SET domain_id=(d->>'id')::uuid;
 PERFORM public.redirect_domain_resource('delete',actor,(d->>'id')::uuid,jsonb_build_object('version',d->>'version'));
 IF EXISTS(SELECT FROM public.redirect_domain_preferences WHERE domain_id IS NOT NULL OR workspace_id<>legacy) THEN RAISE EXCEPTION 'Domain deletion changed workspace preference identity';END IF;
 FOR r IN SELECT c.oid,c.conname FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_class target ON target.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=source.relnamespace WHERE c.contype='f' AND ns.nspname='public' AND(source.relname LIKE 'redirect\_%' ESCAPE '\' OR source.relname='redirects') AND(target.relname LIKE 'redirect\_%' ESCAPE '\' OR target.relname='redirects') AND source.relname<>'redirect_workspaces' AND target.relname<>'redirect_workspaces' LOOP
  IF NOT EXISTS(SELECT FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1] WHERE c.oid=r.oid AND array_length(c.conkey,1)=2 AND a.attname='workspace_id' AND b.attname='workspace_id' AND c.condeferrable AND NOT c.condeferred AND c.convalidated) THEN RAISE EXCEPTION 'Missing tenant relationship fence: %',r.conname;END IF;
  n:=n+1;
 END LOOP;
 IF n<>40 THEN RAISE EXCEPTION 'Relationship inventory changed; review tenant scope: %',n;END IF;
END $$;
ROLLBACK;
