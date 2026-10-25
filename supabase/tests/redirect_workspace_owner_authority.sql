-- Owner registry and active-owner invariants, isolated from activation rollout.
BEGIN;
DO $$ DECLARE fence text;BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fence fixture precondition';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE legacy uuid:='58aa4340-8f21-4b7f-9a10-90be2da89c01';admin uuid:=gen_random_uuid();first_owner uuid:=gen_random_uuid();second_owner uuid:=gen_random_uuid();first_workspace uuid:=gen_random_uuid();second_workspace uuid:=gen_random_uuid();owners uuid[];
BEGIN
 INSERT INTO auth.users(id) VALUES(admin),(first_owner),(second_owner);
 INSERT INTO public.user_roles VALUES(admin,'admin');
 INSERT INTO public.redirect_workspaces(id,name,slug,created_by) VALUES(first_workspace,'First owner fixture','owner-first-fixture',admin),(second_workspace,'Second owner fixture','owner-second-fixture',first_owner);
 IF redirect_internal.workspace_owner(first_workspace,admin) OR redirect_internal.workspace_owner(second_workspace,first_owner) THEN RAISE EXCEPTION 'Creator or application admin became implicit tenant owner';END IF;
 IF NOT redirect_internal.workspace_owner(legacy,admin) OR redirect_internal.workspace_owner(legacy,first_owner) OR redirect_internal.workspace_owner(legacy,NULL) OR redirect_internal.workspace_owner(NULL,admin) THEN RAISE EXCEPTION 'Legacy or null owner authority changed';END IF;
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id,granted_by) VALUES(first_workspace,first_owner,admin),(second_workspace,second_owner,admin);
 IF NOT redirect_internal.workspace_owner(first_workspace,first_owner) OR NOT redirect_internal.workspace_owner(second_workspace,second_owner) OR redirect_internal.workspace_owner(first_workspace,second_owner) OR redirect_internal.workspace_owner(second_workspace,first_owner) OR redirect_internal.workspace_owner(first_workspace,admin) THEN RAISE EXCEPTION 'Explicit owner authority crossed tenant';END IF;
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(first_workspace,second_owner);
 IF NOT redirect_internal.workspace_owner(first_workspace,second_owner) OR NOT redirect_internal.workspace_owner(second_workspace,second_owner) THEN RAISE EXCEPTION 'Explicit ownership in multiple workspaces failed';END IF;
 DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=first_workspace AND user_id=second_owner;
 SELECT array_agg(user_id) INTO owners FROM redirect_internal.workspace_owner_ids(first_workspace);
 IF owners IS DISTINCT FROM ARRAY[first_owner] THEN RAISE EXCEPTION 'Owner discovery crossed workspace';END IF;
 BEGIN INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES(legacy,first_owner);RAISE EXCEPTION 'Explicit grant rewrote legacy authority model';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE redirect_internal.workspace_owners SET workspace_id=second_workspace WHERE workspace_id=first_workspace AND user_id=first_owner;RAISE EXCEPTION 'Owner identity moved';EXCEPTION WHEN check_violation THEN NULL;END;
 INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id,active) VALUES(first_workspace,admin,false);
 IF redirect_internal.workspace_owner(first_workspace,admin) THEN RAISE EXCEPTION 'Global admin rescued inactive explicit grant';END IF;
 UPDATE public.redirect_workspaces SET status='active' WHERE id=first_workspace;
 SET CONSTRAINTS ALL IMMEDIATE;
 BEGIN INSERT INTO public.redirect_workspaces(name,slug,status) VALUES('Ownerless fixture','ownerless-fixture','active');RAISE EXCEPTION 'Ownerless workspace activated';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN UPDATE redirect_internal.workspace_owners SET active=false WHERE workspace_id=first_workspace AND user_id=first_owner;RAISE EXCEPTION 'Last active owner deactivated';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN DELETE FROM redirect_internal.workspace_owners WHERE workspace_id=first_workspace AND user_id=first_owner;RAISE EXCEPTION 'Last active owner deleted';EXCEPTION WHEN check_violation THEN NULL;END;
 -- Owner replacement is atomic; a transient ownerless state may exist only inside
 -- a deferred transaction, never at the checked/committed boundary.
 SET CONSTRAINTS ALL DEFERRED;
 UPDATE redirect_internal.workspace_owners SET active=false WHERE workspace_id=first_workspace AND user_id=first_owner;
 UPDATE redirect_internal.workspace_owners SET active=true WHERE workspace_id=first_workspace AND user_id=admin;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF redirect_internal.workspace_owner(first_workspace,first_owner) OR NOT redirect_internal.workspace_owner(first_workspace,admin) OR NOT redirect_internal.workspace_owner(second_workspace,second_owner) THEN RAISE EXCEPTION 'Atomic owner replacement or unrelated owner changed';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-qg-redirect-workspace',first_workspace,'x-qg-redirect-session-actor',admin)::text,true);
 IF public.redirect_workspace_context(admin,first_workspace)#>>'{principal,role}'<>'owner' THEN RAISE EXCEPTION 'Active explicit Owner context unavailable';END IF;
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%redirect%' AND p.proname<>'redirect_current_owner' AND p.prosrc LIKE '%public.user_roles%') THEN RAISE EXCEPTION 'Unconverted application-wide owner lookup remains';END IF;
 IF has_function_privilege('anon','redirect_internal.workspace_owner(uuid,uuid)','execute') OR has_function_privilege('authenticated','redirect_internal.workspace_owner_ids(uuid)','execute') OR has_table_privilege('authenticated','redirect_internal.workspace_owners','SELECT') OR has_schema_privilege('authenticated','redirect_internal','USAGE') THEN RAISE EXCEPTION 'Private owner registry exposed';END IF;
END $$;
ROLLBACK;
