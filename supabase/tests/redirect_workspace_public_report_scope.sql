BEGIN;
-- Only this rolled-back fixture can create active foreign resource rows.
ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
ALTER TABLE public.redirect_saved_reports DROP CONSTRAINT redirect_saved_reports_pending_tenant_fence;
ALTER TABLE public.redirect_report_shares DROP CONSTRAINT redirect_report_shares_pending_tenant_fence;
DO $$ DECLARE fence text; BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE legacy uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';actor uuid:=gen_random_uuid();human uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();other uuid:=gen_random_uuid();member uuid;folder uuid;one uuid;foreign_link uuid;foreign_report uuid;foreign_share uuid;foreign_version uuid;r jsonb;owner_share jsonb;member_share jsonb;checked jsonb;result jsonb;expected jsonb;click uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(human),(other_owner);
 INSERT INTO public.user_roles VALUES(actor,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug) VALUES(other,'Public report fixture','public-report-scope');
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(other,other_owner);
 BEGIN PERFORM redirect_internal.analytics_report_for_workspace(other,'{}');RAISE EXCEPTION 'Provisioning workspace analytics read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=other;
 INSERT INTO public.redirect_workspace_members(user_id,kind,label) VALUES(human,'user','Public report publisher') RETURNING id INTO member;
 INSERT INTO public.redirect_link_folders(name,default_permission) VALUES('Public report folder','edit') RETURNING id INTO folder;
 INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','public-report-scope','https://example.org/local') RETURNING id INTO one;
 INSERT INTO public.redirect_link_metadata(redirect_key,folder_id) VALUES('redirects:'||one,folder);
 click:=public.record_redirect_visit(one,'/go/public-report-scope',NULL,NULL,'fixture','CH',NULL,302,NULL,NULL,'{"city":"Zürich"}');
 PERFORM public.record_redirect_conversion(jsonb_build_object('kind','lead','clickId',click,'customerExternalId','public-report-scope','eventId','public-report-scope','eventName','Signup'));
 INSERT INTO public.redirects(workspace_id,type,slug,target) VALUES(other,'SHORT','foreign-public-report-scope','https://example.org/foreign') RETURNING id INTO foreign_link;
 INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,ts,path,status) VALUES(other,foreign_link,gen_random_uuid(),now()-interval '1 hour','/foreign-private-report',302);
 INSERT INTO public.redirect_saved_reports(workspace_id,owner_user_id,name,filters) VALUES(other,other_owner,'Foreign report','{}') RETURNING id INTO foreign_report;
 INSERT INTO public.redirect_report_shares(workspace_id,report_id,owner_user_id,title,filters,link_ids,requires_workspace_owner) VALUES(other,foreign_report,other_owner,'Foreign dashboard','{}',ARRAY[foreign_link],true) RETURNING id,version INTO foreign_share,foreign_version;
 r:=public.redirect_saved_report_resource('create',actor,NULL,p_values=>jsonb_build_object('name','Public owner report','filters',jsonb_build_object('linkIds',jsonb_build_array(one))));
 owner_share:=public.redirect_report_share_resource('create',actor,NULL,(r->>'id')::uuid,p_values=>jsonb_build_object('reportVersion',r->>'version','title','Owner dashboard','includeConversions',true));
 r:=public.redirect_saved_report_resource('create',human,member,p_values=>jsonb_build_object('name','Public member report','filters',jsonb_build_object('linkIds',jsonb_build_array(one))));
 member_share:=public.redirect_report_share_resource('create',human,member,(r->>'id')::uuid,p_values=>jsonb_build_object('reportVersion',r->>'version','title','Member dashboard'));
 expected:=public.redirect_analytics_report(jsonb_build_object('linkIds',jsonb_build_array(one)),ARRAY[one]);
 -- Visitors cannot select the publisher or select a foreign analytics workspace.
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',other,'x-qg-redirect-session-actor',other_owner)::text,true);
 checked:=public.redirect_public_report_check((owner_share->>'id')::uuid,repeat('a',64));
 result:=public.redirect_public_report_read((owner_share->>'id')::uuid,(checked->>'version')::uuid,false,'{}');
 IF result->'report' IS DISTINCT FROM expected OR result::text LIKE '%foreign-private-report%' THEN RAISE EXCEPTION 'Public owner analytics changed with visitor context';END IF;
 checked:=public.redirect_public_report_check((member_share->>'id')::uuid,repeat('b',64));
 result:=public.redirect_public_report_read((member_share->>'id')::uuid,(checked->>'version')::uuid,false,'{}');
 IF result#>>'{report,totals,clicks}'<>'1' OR result#>>'{report,totals,leads}'<>'0' OR result->>'linkCount'<>'1' THEN RAISE EXCEPTION 'Public member scope or conversion privacy changed';END IF;
 IF redirect_internal.analytics_report_for_workspace(legacy,'{}',ARRAY[foreign_link])#>>'{totals,clicks}'<>'0' OR redirect_internal.analytics_report_for_workspace(other,'{}',ARRAY[one])#>>'{totals,clicks}'<>'0' OR redirect_internal.analytics_report_for_workspace(other,'{}',ARRAY[foreign_link])#>>'{totals,clicks}'<>'1' THEN RAISE EXCEPTION 'Explicit analytics workspace crossed link identity';END IF;
 BEGIN PERFORM public.redirect_public_report_check(foreign_share,repeat('c',64));RAISE EXCEPTION 'Foreign public report activated';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.redirect_public_report_read(foreign_share,foreign_version,true,'{}');RAISE EXCEPTION 'Foreign public report read';EXCEPTION WHEN no_data_found THEN NULL;END;
 -- Retaining read permission cannot preserve publication after losing edit.
 INSERT INTO public.redirect_folder_members VALUES(folder,member,'view');
 BEGIN PERFORM public.redirect_public_report_check((member_share->>'id')::uuid,repeat('b',64));RAISE EXCEPTION 'Lost folder edit retained public report';EXCEPTION WHEN no_data_found THEN NULL;END;
 UPDATE public.redirect_folder_members SET permission='edit' WHERE folder_id=folder AND member_id=member;
 UPDATE public.redirect_workspace_members SET active=false WHERE id=member;
 BEGIN PERFORM public.redirect_public_report_check((member_share->>'id')::uuid,repeat('b',64));RAISE EXCEPTION 'Inactive publisher retained public report';EXCEPTION WHEN no_data_found THEN NULL;END;
 DELETE FROM public.user_roles WHERE user_id=actor;
 BEGIN PERFORM public.redirect_public_report_check((owner_share->>'id')::uuid,repeat('a',64));RAISE EXCEPTION 'Former owner retained public report';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF has_function_privilege('anon','redirect_internal.analytics_report_for_workspace(uuid,jsonb,uuid[])','execute') OR has_function_privilege('authenticated','redirect_internal.analytics_report_for_workspace(uuid,jsonb,uuid[])','execute') OR has_function_privilege('anon','redirect_internal.analytics_filtered_for_workspace(uuid,jsonb,uuid[],timestamptz)','execute') OR has_function_privilege('authenticated','redirect_internal.analytics_filtered_for_workspace(uuid,jsonb,uuid[],timestamptz)','execute') THEN RAISE EXCEPTION 'Private analytics grants widened';END IF;
END $$;
ROLLBACK;
