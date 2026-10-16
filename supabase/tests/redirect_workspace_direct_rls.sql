-- Test RLS independently of the activation checks, in a rolled-back fixture.
BEGIN;
ALTER TABLE public.redirect_link_folders DROP CONSTRAINT redirect_link_folders_pending_tenant_fence;
ALTER TABLE public.redirect_link_tags DROP CONSTRAINT redirect_link_tags_pending_tenant_fence;
ALTER TABLE public.redirect_utm_templates DROP CONSTRAINT redirect_utm_templates_pending_tenant_fence;
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000071');
INSERT INTO public.user_roles VALUES('00000000-0000-4000-8000-000000000071','admin');
INSERT INTO public.redirect_workspaces(id,name,slug) VALUES('00000000-0000-4000-8000-000000000072','Foreign RLS fixture','foreign-rls-fixture');
INSERT INTO public.redirect_link_folders(id,name,workspace_id) VALUES('00000000-0000-4000-8000-000000000073','Foreign RLS folder','00000000-0000-4000-8000-000000000072'),('00000000-0000-4000-8000-000000000074','Local RLS folder','58aa4340-8f21-4b7f-9a10-90be2da89c01');
INSERT INTO public.redirect_link_tags(name,workspace_id) VALUES('Foreign RLS tag','00000000-0000-4000-8000-000000000072');
INSERT INTO public.redirect_utm_templates(name,workspace_id) VALUES('Foreign RLS template','00000000-0000-4000-8000-000000000072');
INSERT INTO public.redirects(id,type,slug,target,workspace_id) VALUES('00000000-0000-4000-8000-000000000075','SHORT','rls-foreign-workspace','https://example.org/foreign','00000000-0000-4000-8000-000000000072');
SET LOCAL request.jwt.claims='{"role":"authenticated","user_role":"admin","sub":"00000000-0000-4000-8000-000000000071"}';
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
 IF NOT public.redirect_current_owner() OR NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE name='Local RLS folder') THEN RAISE EXCEPTION 'Legacy current-owner access regressed';END IF;
 IF EXISTS(SELECT FROM public.redirect_link_folders WHERE name='Foreign RLS folder') OR EXISTS(SELECT FROM public.redirect_link_tags WHERE name='Foreign RLS tag') OR EXISTS(SELECT FROM public.redirect_utm_templates WHERE name='Foreign RLS template') OR EXISTS(SELECT FROM public.redirects WHERE slug='rls-foreign-workspace') THEN RAISE EXCEPTION 'Direct Data API policy exposed another workspace';END IF;
 UPDATE public.redirect_link_folders SET name='Denied foreign update' WHERE id='00000000-0000-4000-8000-000000000073';GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Direct foreign update succeeded';END IF;
 DELETE FROM public.redirects WHERE id='00000000-0000-4000-8000-000000000075';GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Direct foreign delete succeeded';END IF;
 BEGIN INSERT INTO public.redirect_link_folders(name,workspace_id) VALUES('Denied foreign insert','00000000-0000-4000-8000-000000000072');RAISE EXCEPTION 'Direct foreign insert succeeded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.redirect_link_folders SET workspace_id='00000000-0000-4000-8000-000000000072' WHERE id='00000000-0000-4000-8000-000000000074';RAISE EXCEPTION 'Direct workspace move succeeded';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='redirect_legacy_direct_access' AND permissive='RESTRICTIVE' AND qual LIKE '%workspace_id%' AND with_check LIKE '%workspace_id%')<>40 THEN RAISE EXCEPTION 'Direct workspace policy inventory is incomplete';END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE id='00000000-0000-4000-8000-000000000073' AND name='Foreign RLS folder') OR NOT EXISTS(SELECT FROM public.redirects WHERE id='00000000-0000-4000-8000-000000000075') OR NOT EXISTS(SELECT FROM public.redirect_link_folders WHERE id='00000000-0000-4000-8000-000000000074' AND workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01') THEN RAISE EXCEPTION 'Denied direct actions changed tenant data';END IF;
END $$;
ROLLBACK;
