BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid();recipient uuid:=gen_random_uuid();other_user uuid:=gen_random_uuid();unverified uuid:=gen_random_uuid();invite uuid;result jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,'owner-inbox@example.org',now()),(recipient,'inbox@example.org',now()),(other_user,'other-inbox@example.org',now()),(unverified,'pending-inbox@example.org',NULL);
 INSERT INTO public.user_roles VALUES(actor,'admin');
 result:=public.redirect_workspace_invitation(actor,'create',p_values=>'{"email":"inbox@example.org","label":"Inbox viewer","role":"viewer"}',p_hash=>repeat('1',64));invite:=(result->>'id')::uuid;
 result:=public.redirect_invitation_inbox(recipient);
 IF result->>'count'<>'1' OR result#>>'{data,0,id}'<>invite::text OR result#>'{data,0}'?'email' OR result#>'{data,0}'?'token_hash' OR result#>'{data,0}'?'created_by' THEN RAISE EXCEPTION 'Recipient inbox scope or private projection failed';END IF;
 IF public.redirect_invitation_inbox(other_user)->>'count'<>'0' THEN RAISE EXCEPTION 'Other recipient read invitation';END IF;
 BEGIN PERFORM public.redirect_workspace_invitation(other_user,'accept',invite);RAISE EXCEPTION 'Other recipient accepted by ID';EXCEPTION WHEN no_data_found THEN NULL;END;
 result:=public.redirect_workspace_invitation(recipient,'accept',invite);
 IF result->>'role'<>'viewer' OR public.redirect_invitation_inbox(recipient)->>'count'<>'0' THEN RAISE EXCEPTION 'Inbox acceptance failed';END IF;
 result:=public.redirect_workspace_invitation(actor,'create',p_values=>'{"email":"pending-inbox@example.org","label":"Unverified","role":"member"}',p_hash=>repeat('2',64));
 IF public.redirect_invitation_inbox(unverified)->>'count'<>'0' THEN RAISE EXCEPTION 'Unverified account inbox';END IF;
 BEGIN PERFORM public.redirect_workspace_invitation(unverified,'accept',(result->>'id')::uuid);RAISE EXCEPTION 'Unverified account accepted by ID';EXCEPTION WHEN no_data_found THEN NULL;END;
 result:=public.redirect_workspace_invitation(actor,'create',p_values=>'{"email":"inbox@example.org","label":"Revoked","role":"member"}',p_hash=>repeat('3',64));
 PERFORM public.redirect_workspace_invitation(actor,'revoke',(result->>'id')::uuid);
 IF public.redirect_invitation_inbox(recipient)->>'count'<>'0' THEN RAISE EXCEPTION 'Revoked invitation in inbox';END IF;
 result:=public.redirect_workspace_invitation(actor,'create',p_values=>'{"email":"inbox@example.org","label":"Lost publisher","role":"member"}',p_hash=>repeat('4',64));
 DELETE FROM public.user_roles WHERE user_id=actor;
 IF public.redirect_invitation_inbox(recipient)->>'count'<>'0' THEN RAISE EXCEPTION 'Lost owner invitation remained';END IF;
 IF has_function_privilege('authenticated','public.redirect_invitation_inbox(uuid,integer)','EXECUTE') OR has_function_privilege('anon','public.redirect_invitation_inbox(uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Recipient inbox callable directly';END IF;
END $$;
ROLLBACK;
