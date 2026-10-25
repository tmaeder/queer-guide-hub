-- Account-managed native conversion adapters use purpose-limited existing
-- credentials. Generic API-key administration stays Owner-only.
CREATE TABLE redirect_internal.integration_installations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.redirect_workspaces(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 member_id uuid,
 key_id uuid NOT NULL UNIQUE,
 provider text NOT NULL CHECK(provider IN('segment','gtm')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 request_id uuid NOT NULL,input_fingerprint text NOT NULL CHECK(input_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 UNIQUE(workspace_id,id),
 UNIQUE(workspace_id,key_id),
 UNIQUE(workspace_id,created_by,request_id),
 FOREIGN KEY(workspace_id,key_id) REFERENCES public.redirect_api_tokens(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,member_id) REFERENCES public.redirect_workspace_members(workspace_id,id) ON DELETE CASCADE,
 CONSTRAINT integration_installations_pending_tenant_fence CHECK(workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid)
);
ALTER TABLE redirect_internal.integration_installations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON redirect_internal.integration_installations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON redirect_internal.integration_installations TO service_role;
CREATE INDEX integration_installations_creator ON redirect_internal.integration_installations(created_by,workspace_id);
CREATE INDEX integration_installations_member ON redirect_internal.integration_installations(workspace_id,member_id) WHERE member_id IS NOT NULL;
CREATE TRIGGER integration_installations_acl BEFORE INSERT OR UPDATE OR DELETE ON redirect_internal.integration_installations FOR EACH STATEMENT EXECUTE FUNCTION public.redirect_acl_change_lock();
CREATE FUNCTION redirect_internal.integration_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF ROW(NEW.id,NEW.workspace_id,NEW.created_by,NEW.member_id,NEW.key_id,NEW.provider,NEW.request_id,NEW.input_fingerprint) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.created_by,OLD.member_id,OLD.key_id,OLD.provider,OLD.request_id,OLD.input_fingerprint) THEN RAISE EXCEPTION 'Integration identity is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER integration_installations_identity BEFORE UPDATE ON redirect_internal.integration_installations FOR EACH ROW EXECUTE FUNCTION redirect_internal.integration_identity_guard();
CREATE FUNCTION redirect_internal.integration_delete_revoke() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 -- Member/account deletion must not turn its member-bound installation key
 -- into an owner credential through an ON DELETE SET NULL relationship.
 UPDATE public.redirect_api_tokens SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE workspace_id=OLD.workspace_id AND id=OLD.key_id;
 RETURN OLD;
END $$;
CREATE TRIGGER integration_installations_delete AFTER DELETE ON redirect_internal.integration_installations FOR EACH ROW EXECUTE FUNCTION redirect_internal.integration_delete_revoke();
CREATE FUNCTION redirect_internal.integration_json(p_workspace uuid,p_id uuid,p_actor uuid,p_owner boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',i.id,'provider',i.provider,'name',i.name,'createdAt',i.created_at,'expiresAt',t.expires_at,'credentialPrefix',left(t.prefix,20),'credentialLastUsedAt',t.last_used_at,
 'linkCount',(SELECT count(*) FROM public.redirects r WHERE r.workspace_id=i.workspace_id AND r.id=ANY(t.redirect_ids)),
 'status',CASE WHEN i.revoked_at IS NOT NULL OR t.revoked_at IS NOT NULL THEN 'revoked' WHEN t.expires_at<=clock_timestamp() THEN 'expired'
 WHEN i.member_id IS NULL AND NOT redirect_internal.workspace_owner(i.workspace_id,i.created_by) THEN 'unavailable'
 WHEN i.member_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_workspace_members m WHERE m.workspace_id=i.workspace_id AND m.id=i.member_id AND m.user_id=i.created_by AND m.kind='user' AND m.active AND m.role='member') THEN 'unavailable'
 WHEN NOT EXISTS(SELECT FROM public.redirects r WHERE r.workspace_id=i.workspace_id AND r.id=ANY(t.redirect_ids)) THEN 'unavailable' ELSE 'configured' END,
 'canRevoke',i.revoked_at IS NULL AND t.revoked_at IS NULL AND(p_owner OR i.created_by=p_actor AND EXISTS(SELECT FROM public.redirect_workspace_members m WHERE m.workspace_id=i.workspace_id AND m.id=i.member_id AND m.user_id=p_actor AND m.kind='user' AND m.active AND m.role='member')))
 FROM redirect_internal.integration_installations i JOIN public.redirect_api_tokens t ON t.workspace_id=i.workspace_id AND t.id=i.key_id WHERE i.workspace_id=p_workspace AND i.id=p_id
$$;
CREATE FUNCTION public.redirect_integration_installation(p_actor uuid,p_action text,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_limit integer DEFAULT 50,p_after uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE context jsonb;workspace uuid;principal uuid;role text;own boolean;installed redirect_internal.integration_installations;ids uuid[];allowed uuid[];expiry timestamptz;fingerprint text;token uuid;result jsonb;retry integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','revoke','lookup') THEN RAISE EXCEPTION 'Invalid integration operation' USING ERRCODE='22023';END IF;
 -- Creation/revocation also updates credential rows; acquire exclusive first.
 IF p_action IN('create','revoke') THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 context:=public.redirect_workspace_context(p_actor,p_scope=>'workspace:read');
 workspace:=(context#>>'{workspace,id}')::uuid;principal:=(context#>>'{principal,id}')::uuid;role:=context#>>'{principal,role}';own:=role='owner';
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid integration page' USING ERRCODE='22023';END IF;
  WITH all_rows AS MATERIALIZED(SELECT id FROM redirect_internal.integration_installations WHERE workspace_id=workspace),
  page AS(SELECT id FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT id FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(redirect_internal.integration_json(workspace,id,p_actor,own) ORDER BY id) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT id FROM shown ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
  RETURN result;
 END IF;
 IF p_action='lookup' THEN
  SELECT * INTO installed FROM redirect_internal.integration_installations WHERE workspace_id=workspace AND created_by=p_actor AND request_id=p_id;
  IF installed.id IS NULL THEN RETURN NULL;END IF;
  RETURN redirect_internal.integration_json(workspace,installed.id,p_actor,own);
 END IF;
 IF role NOT IN('owner','member') THEN RAISE EXCEPTION 'Current Owner or Member access is required' USING ERRCODE='42501';END IF;
 IF p_action='revoke' THEN
  SELECT * INTO installed FROM redirect_internal.integration_installations WHERE workspace_id=workspace AND id=p_id AND(own OR created_by=p_actor) FOR UPDATE;
  IF installed.id IS NULL THEN RAISE EXCEPTION 'Integration not found' USING ERRCODE='P0002';END IF;
  UPDATE public.redirect_api_tokens SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE workspace_id=workspace AND id=installed.key_id;
  UPDATE redirect_internal.integration_installations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE workspace_id=workspace AND id=installed.id;
  RETURN redirect_internal.integration_json(workspace,installed.id,p_actor,own);
 END IF;
 IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['provider','name','linkIds','expiresAt','token_hash','prefix']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid integration fields' USING ERRCODE='22023';END IF;
 IF p_values->>'provider' IS NULL OR p_values->>'provider' NOT IN('segment','gtm') OR jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'name')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_values->'expiresAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Choose Segment or Google Tag Manager, a name and an expiry' USING ERRCODE='22023';END IF;
 expiry:=(p_values->>'expiresAt')::timestamptz;
 IF NOT isfinite(expiry) THEN RAISE EXCEPTION 'Integration credentials require a finite expiry' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'linkIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_values->'linkIds') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'linkIds') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Choose 1–100 editable managed links' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO ids FROM jsonb_array_elements_text(p_values->'linkIds');
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_values->>'provider',btrim(p_values->>'name'),ids,extract(epoch FROM expiry))::text,'UTF8')),'hex');
 SELECT * INTO installed FROM redirect_internal.integration_installations WHERE workspace_id=workspace AND created_by=p_actor AND request_id=p_id FOR SHARE;
 IF installed.id IS NOT NULL THEN
  IF installed.input_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'This setup request already has different settings' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('created',false,'installation',redirect_internal.integration_json(workspace,installed.id,p_actor,own));
 END IF;
 IF expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Integration credentials must expire within one year' USING ERRCODE='22023';END IF;
 allowed:=public.redirect_management_scope(principal,'links:write');
 IF (SELECT count(*) FROM public.redirects WHERE workspace_id=workspace AND type='SHORT' AND id=ANY(ids) AND(allowed IS NULL OR id=ANY(allowed)))<>cardinality(ids) THEN RAISE EXCEPTION 'Choose only managed links you can currently edit' USING ERRCODE='42501';END IF;
 IF p_values->>'token_hash' IS NULL OR p_values->>'token_hash' !~ '^[a-f0-9]{64}$' OR p_values->>'prefix' IS NULL OR p_values->>'prefix' !~ '^qg_redirect_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Invalid integration credential digest' USING ERRCODE='22023';END IF;
 IF(SELECT count(*) FROM redirect_internal.integration_installations i JOIN public.redirect_api_tokens t ON t.workspace_id=i.workspace_id AND t.id=i.key_id WHERE i.workspace_id=workspace AND i.created_by=p_actor AND i.revoked_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp())>=20 THEN RAISE EXCEPTION 'Revoke an unused integration before creating another' USING ERRCODE='22023';END IF;
 retry:=public.redirect_report_budget('integration-install:'||workspace||':'||p_actor,30,3600);
 IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
 INSERT INTO public.redirect_api_tokens(workspace_id,name,token_hash,prefix,scopes,redirect_ids,member_id,created_by,expires_at)
 VALUES(workspace,btrim(p_values->>'name'),p_values->>'token_hash',p_values->>'prefix',ARRAY['conversions:write'],ids,principal,p_actor,expiry) RETURNING id INTO token;
 INSERT INTO redirect_internal.integration_installations(workspace_id,created_by,member_id,key_id,provider,name,request_id,input_fingerprint)
 VALUES(workspace,p_actor,principal,token,p_values->>'provider',btrim(p_values->>'name'),p_id,fingerprint) RETURNING * INTO installed;
 RETURN jsonb_build_object('created',true,'installation',redirect_internal.integration_json(workspace,installed.id,p_actor,own));
END $$;
REVOKE ALL ON FUNCTION redirect_internal.integration_identity_guard(),redirect_internal.integration_delete_revoke(),redirect_internal.integration_json(uuid,uuid,uuid,boolean),public.redirect_integration_installation(uuid,text,uuid,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.integration_json(uuid,uuid,uuid,boolean),public.redirect_integration_installation(uuid,text,uuid,jsonb,integer,uuid) TO service_role;
