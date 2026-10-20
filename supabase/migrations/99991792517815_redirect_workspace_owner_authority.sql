-- Explicit tenant ownership. Legacy app admins retain legacy ownership only.
-- New workspace/resource activation fences remain intact; no owner rows are seeded.
CREATE TABLE redirect_internal.workspace_owners(
 workspace_id uuid NOT NULL REFERENCES public.redirect_workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id),
 CHECK(workspace_id<>'58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid)
);
ALTER TABLE redirect_internal.workspace_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON redirect_internal.workspace_owners FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON redirect_internal.workspace_owners TO service_role;
CREATE INDEX workspace_owners_account ON redirect_internal.workspace_owners(user_id,workspace_id) WHERE active;
CREATE TRIGGER workspace_owners_acl BEFORE INSERT OR UPDATE OR DELETE ON redirect_internal.workspace_owners FOR EACH STATEMENT EXECUTE FUNCTION public.redirect_acl_change_lock();
CREATE TRIGGER redirect_workspaces_acl BEFORE INSERT OR UPDATE OR DELETE ON public.redirect_workspaces FOR EACH STATEMENT EXECUTE FUNCTION public.redirect_acl_change_lock();

CREATE FUNCTION redirect_internal.workspace_owner(p_workspace uuid,p_actor uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE allowed boolean;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT EXISTS(SELECT FROM public.redirect_workspaces w WHERE w.id=p_workspace AND (
  w.is_legacy AND w.status='active' AND EXISTS(SELECT FROM public.user_roles WHERE user_id=p_actor AND role='admin')
  OR NOT w.is_legacy AND EXISTS(SELECT FROM redirect_internal.workspace_owners o WHERE o.workspace_id=w.id AND o.user_id=p_actor AND o.active)
 )) INTO allowed;
 RETURN allowed;
END $$;
CREATE FUNCTION redirect_internal.workspace_owner_ids(p_workspace uuid) RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 RETURN QUERY SELECT r.user_id FROM public.user_roles r JOIN public.redirect_workspaces w ON w.id=p_workspace AND w.is_legacy AND w.status='active' WHERE r.role='admin'
 UNION SELECT o.user_id FROM redirect_internal.workspace_owners o JOIN public.redirect_workspaces w ON w.id=o.workspace_id AND NOT w.is_legacy WHERE o.workspace_id=p_workspace AND o.active;
END $$;
CREATE FUNCTION redirect_internal.workspace_owner_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Workspace owner identity is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_owner_identity BEFORE UPDATE ON redirect_internal.workspace_owners FOR EACH ROW EXECUTE FUNCTION redirect_internal.workspace_owner_identity_guard();
CREATE FUNCTION redirect_internal.workspace_owner_required() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[];workspace uuid;
BEGIN
 IF TG_TABLE_NAME='redirect_workspaces' THEN ids:=ARRAY[NEW.id];
 ELSE
  IF TG_OP<>'INSERT' THEN ids:=ARRAY[OLD.workspace_id];END IF;
  IF TG_OP<>'DELETE' THEN ids:=coalesce(ids,ARRAY[]::uuid[])||NEW.workspace_id;END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 FOR workspace IN SELECT DISTINCT value FROM unnest(ids) value LOOP
  IF EXISTS(SELECT FROM public.redirect_workspaces WHERE id=workspace AND NOT is_legacy AND status='active') AND NOT EXISTS(SELECT FROM redirect_internal.workspace_owners WHERE workspace_id=workspace AND active) THEN
   RAISE EXCEPTION 'An active workspace must retain an active owner' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER workspace_owner_required AFTER INSERT OR UPDATE OR DELETE ON redirect_internal.workspace_owners DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION redirect_internal.workspace_owner_required();
CREATE CONSTRAINT TRIGGER redirect_workspace_owner_required AFTER INSERT OR UPDATE ON public.redirect_workspaces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION redirect_internal.workspace_owner_required();
REVOKE ALL ON FUNCTION redirect_internal.workspace_owner(uuid,uuid),redirect_internal.workspace_owner_ids(uuid),redirect_internal.workspace_owner_identity_guard(),redirect_internal.workspace_owner_required() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION redirect_internal.workspace_owner(uuid,uuid),redirect_internal.workspace_owner_ids(uuid),redirect_internal.workspace_owner_identity_guard(),redirect_internal.workspace_owner_required() TO service_role;

CREATE OR REPLACE FUNCTION public.redirect_principal_member(p_principal uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();t public.redirect_api_tokens;m public.redirect_workspace_members;
BEGIN
 IF p_principal IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO t FROM public.redirect_api_tokens WHERE id=p_principal AND workspace_id=selected_workspace;
 IF t.id IS NOT NULL THEN
  IF t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Credential is no longer active' USING ERRCODE='42501';END IF;
  IF t.member_id IS NULL THEN
   IF NOT redirect_internal.workspace_owner(t.workspace_id,t.created_by) THEN RAISE EXCEPTION 'Credential owner access is no longer active' USING ERRCODE='42501';END IF;
   RETURN NULL;
  END IF;
  SELECT * INTO m FROM public.redirect_workspace_members WHERE id=t.member_id AND workspace_id=selected_workspace AND active;
 ELSE
  SELECT * INTO m FROM public.redirect_workspace_members WHERE id=p_principal AND workspace_id=selected_workspace AND kind='user' AND active;
  IF m.id IS NOT NULL THEN PERFORM public.redirect_request_workspace(m.user_id);END IF;
 END IF;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Principal is not active in this workspace' USING ERRCODE='42501';END IF;
 RETURN m.id;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_folder_owners(p_folder uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH context AS MATERIALIZED(SELECT public.redirect_request_workspace() AS workspace)
 SELECT r.user_id FROM context CROSS JOIN LATERAL redirect_internal.workspace_owner_ids(context.workspace) r WHERE EXISTS(SELECT FROM public.redirect_link_folders WHERE id=p_folder AND workspace_id=context.workspace)
 UNION SELECT m.user_id FROM public.redirect_folder_members f JOIN public.redirect_workspace_members m ON m.id=f.member_id CROSS JOIN context
 WHERE f.workspace_id=context.workspace AND m.workspace_id=context.workspace AND f.folder_id=p_folder AND f.permission='owner' AND m.kind='user' AND m.active AND m.role='member'
$function$;

CREATE OR REPLACE FUNCTION public.redirect_report_actor(p_actor uuid, p_principal uuid, p_write boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);
BEGIN
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'events:read');
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM public.redirect_management_scope(p_principal,'events:read');
  IF NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND user_id=p_actor AND kind='user' AND active) THEN RAISE EXCEPTION 'Account session required' USING ERRCODE='42501';END IF;
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_saved_report_resource(p_action text, p_actor uuid, p_principal uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_saved_reports;result jsonb;allowed uuid[];view_mode text;can_publish boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','get','create','patch','delete','run') THEN RAISE EXCEPTION 'Invalid report action' USING ERRCODE='22023';END IF;
 PERFORM public.redirect_report_actor(p_actor,p_principal,p_action IN('create','patch','delete'));
 can_publish:=redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid report page' USING ERRCODE='22023';END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['view']::text[]<>'{}' OR p_values?'view' AND(jsonb_typeof(p_values->'view')<>'string' OR coalesce(p_values->>'view','') NOT IN('personal','team','all')) THEN RAISE EXCEPTION 'Invalid report view' USING ERRCODE='22023';END IF;
  view_mode:=coalesce(p_values->>'view','personal');
  WITH all_rows AS MATERIALIZED(SELECT * FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND((view_mode IN('personal','all') AND owner_user_id=p_actor) OR(view_mode IN('team','all') AND visibility='team' AND redirect_internal.workspace_owner(selected_workspace,owner_user_id)))),
  page AS MATERIALIZED(SELECT * FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce(jsonb_agg((CASE WHEN owner_user_id=p_actor THEN to_jsonb(shown) ELSE to_jsonb(shown)-'owner_user_id' END)||jsonb_build_object('canEdit',owner_user_id=p_actor) ORDER BY id),'[]'::jsonb),'canPublishToTeam',can_publish,'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN max(id::text) ELSE NULL END) INTO result FROM shown;
  RETURN result;
 END IF;
 IF p_action<>'create' THEN
  SELECT * INTO r FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND id=p_id AND(owner_user_id=p_actor OR(p_action IN('get','run') AND visibility='team' AND redirect_internal.workspace_owner(selected_workspace,owner_user_id)));
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002';END IF;
 END IF;
 IF p_action='get' THEN RETURN(CASE WHEN r.owner_user_id=p_actor THEN to_jsonb(r) ELSE to_jsonb(r)-'owner_user_id' END)||jsonb_build_object('canEdit',r.owner_user_id=p_actor);END IF;
 IF p_action='run' THEN allowed:=public.redirect_management_scope(p_principal,'events:read');SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO allowed FROM public.redirects WHERE workspace_id=selected_workspace AND(allowed IS NULL OR id=ANY(allowed));RETURN public.redirect_analytics_report(r.filters,allowed);END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_saved_reports WHERE workspace_id=selected_workspace AND id=r.id;RETURN jsonb_build_object('id',r.id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['name','filters','version','visibility']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid report fields' USING ERRCODE='22023';END IF;
 IF p_action='patch' AND (p_values->>'version')::uuid IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Report changed; reload before saving' USING ERRCODE='23505';END IF;
 IF p_values?'visibility' AND(jsonb_typeof(p_values->'visibility')<>'string' OR coalesce(p_values->>'visibility','') NOT IN('private','team')) THEN RAISE EXCEPTION 'Invalid report visibility' USING ERRCODE='22023';END IF;
 IF coalesce(p_values->>'visibility',r.visibility,'private')='team' AND NOT can_publish THEN RAISE EXCEPTION 'Workspace owner required to publish a team report' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_saved_reports(workspace_id,owner_user_id,name,filters,visibility) VALUES(selected_workspace,p_actor,btrim(p_values->>'name'),p_values->'filters',coalesce(p_values->>'visibility','private')) RETURNING * INTO r;
 ELSE
  UPDATE public.redirect_saved_reports SET visibility=coalesce(p_values->>'visibility',visibility),name=CASE WHEN p_values?'name' THEN btrim(p_values->>'name') ELSE name END,filters=CASE WHEN p_values?'filters' THEN p_values->'filters' ELSE filters END,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=r.id RETURNING * INTO r;
 END IF;
 -- Validate SQL filter semantics without exposing any unscoped data.
 PERFORM public.redirect_analytics_report(r.filters,ARRAY[]::uuid[]);
 RETURN to_jsonb(r)||jsonb_build_object('canEdit',true);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_report_share_ids(p_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();s public.redirect_report_shares;principal uuid;allowed uuid[];ids uuid[];owner boolean:=false;
BEGIN
 SELECT * INTO s FROM public.redirect_report_shares WHERE workspace_id=selected_workspace AND id=p_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(s.workspace_id,s.owner_user_id);
 owner:=FOUND;
 IF NOT owner THEN
  IF s.requires_workspace_owner THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  SELECT id INTO principal FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND user_id=s.owner_user_id AND active AND kind='user' AND role='member' FOR SHARE;
  IF principal IS NULL THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
  allowed:=public.redirect_management_scope(principal,'events:read');
 END IF;
 SELECT coalesce(array_agg(d.id),ARRAY[]::uuid[]) INTO ids FROM public.redirects d LEFT JOIN public.redirect_link_metadata m ON m.workspace_id=selected_workspace AND m.redirect_key='redirects:'||d.id::text
 WHERE d.workspace_id=selected_workspace AND d.type='SHORT' AND (s.scope_mode='folder' OR d.id=ANY(s.link_ids))
 AND (allowed IS NULL OR d.id=ANY(allowed)) AND (owner OR public.redirect_folder_rank(principal,m.folder_id)>=2)
 AND (NOT(s.filters?'folderId') OR m.folder_id=(s.filters->>'folderId')::uuid)
 AND (NOT(s.filters?'tagId') OR EXISTS(SELECT FROM public.redirect_link_tag_assignments t WHERE t.workspace_id=selected_workspace AND t.redirect_key='redirects:'||d.id::text AND t.tag_id=(s.filters->>'tagId')::uuid))
 AND (NOT(s.filters?'linkIds') OR d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(s.filters->'linkIds')));
 IF NOT owner AND cardinality(ids)=0 THEN RAISE EXCEPTION 'Dashboard unavailable' USING ERRCODE='P0002';END IF;
 RETURN ids;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_domain_actor(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_handoff_app(p_app uuid, p_hostname text, p_path text)
 RETURNS redirect_native_apps
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; app public.redirect_native_apps;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO app FROM public.redirect_native_apps a WHERE a.workspace_id=selected_workspace AND a.id=p_app AND a.enabled AND a.handoff_enabled
 AND redirect_internal.workspace_owner(a.workspace_id,a.created_by)
 AND (a.domain_id IS NULL AND p_hostname IN('queer.guide','www.queer.guide') OR a.domain_id IS NOT NULL AND EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=a.domain_id AND hostname=p_hostname))
 AND EXISTS(SELECT FROM unnest(a.paths) pattern WHERE pattern=p_path OR right(pattern,1)='*' AND left(p_path,length(pattern)-1)=left(pattern,length(pattern)-1));
 IF app.id IS NOT NULL AND app.domain_id IS NOT NULL AND public.redirect_public_domain(p_hostname) IS NULL THEN RETURN NULL;END IF;
 RETURN app;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_domain_provider_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('provider',jsonb_build_object('id',d.provider_id,'state',coalesce(j.state,'not_requested'),'desired',coalesce(j.desired,false),'cnameTarget',j.cname_target,
 'hostnameStatus',j.provider_status,'certificateStatus',j.ssl_status,'validationRecords',coalesce(j.validation,'[]'),'candidates',coalesce(j.candidates,'[]'),
 'validationRestartRequestedAt',j.validation_restart_requested_at,'validationRestartStartedAt',j.validation_restart_started_at,
 'validationRestartPending',coalesce(j.validation_restart_operation=j.operation,false),
 'canRestartValidation',coalesce(d.provider_id IS NOT NULL AND j.desired AND NOT d.disabled AND d.ownership_state='verified' AND d.verified_until>clock_timestamp() AND j.state NOT IN('review','disconnected') AND j.validation_restart_operation IS DISTINCT FROM j.operation AND (j.validation_restart_requested_at IS NULL OR j.validation_restart_requested_at<=clock_timestamp()-interval '5 minutes'),false),
 'checkedAt',j.checked_at,'nextAttemptAt',j.next_attempt_at,'error',j.last_error,
 'canConfirmAbsence',coalesce(j.state='review' AND d.provider_id IS NULL AND j.create_started_at<clock_timestamp()-interval '15 minutes' AND j.reconciled_at>clock_timestamp()-interval '5 minutes' AND j.candidates='[]'::jsonb,false),
 'certificateReady',coalesce(d.provider_id IS NOT NULL AND j.desired AND NOT d.disabled AND d.ownership_state='verified' AND d.verified_until>clock_timestamp() AND j.state NOT IN('failed','review','disconnected') AND j.provider_status='active' AND j.ssl_status='active' AND j.checked_at>clock_timestamp()-interval '15 minutes' AND redirect_internal.workspace_owner(j.workspace_id,j.requested_by),false)))
 FROM public.redirect_domains d LEFT JOIN public.redirect_domain_jobs j ON j.workspace_id=d.workspace_id AND j.domain_id=d.id WHERE d.workspace_id=public.redirect_request_workspace() AND d.id=p_id;
$function$;

CREATE OR REPLACE FUNCTION public.begin_redirect_domain_create(p_id uuid, p_lease uuid, p_operation uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); j public.redirect_domain_jobs;d public.redirect_domains;
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=p_id FOR UPDATE;SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.state<>'leased' OR p_lease IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_operation IS DISTINCT FROM j.operation OR NOT j.desired OR j.create_started_at IS NOT NULL OR d.provider_id IS NOT NULL OR d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN NULL;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.redirect_domain_jobs SET create_nonce=gen_random_uuid(),create_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id RETURNING create_nonce INTO j.create_nonce;
 RETURN j.create_nonce;
END $function$;

CREATE OR REPLACE FUNCTION public.record_redirect_domain_provider(p_id uuid, p_nonce uuid, p_provider uuid, p_mode text DEFAULT 'created'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); j public.redirect_domain_jobs;d public.redirect_domains;
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=p_id FOR UPDATE;SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR p_provider IS NULL OR p_nonce IS NULL THEN RETURN false;END IF;
 IF p_mode='created' THEN IF p_nonce IS DISTINCT FROM j.create_nonce THEN RETURN false;END IF;
 ELSIF p_mode='adopted' THEN
  IF p_nonce IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_provider IS DISTINCT FROM j.adopt_id THEN RETURN false;END IF;
  PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);IF NOT FOUND THEN RETURN false;END IF;
  IF j.desired AND (d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp()) THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 IF d.provider_id IS NOT NULL AND d.provider_id<>p_provider::text THEN
  UPDATE public.redirect_domain_jobs SET state='review',last_error='Conflicting provider receipt requires review',candidates=jsonb_build_array(jsonb_build_object('id',p_provider,'hostname',d.hostname)) WHERE workspace_id=selected_workspace AND domain_id=p_id;RETURN false;
 END IF;
 UPDATE public.redirect_domains SET provider_id=p_provider::text,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=p_id;
 UPDATE public.redirect_domain_jobs SET adopt_id=NULL,candidates='[]',state=CASE WHEN state='leased' AND lease_until>clock_timestamp() THEN state ELSE 'queued' END,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.reserve_redirect_domain_renewal(p_id uuid, p_lease uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); d public.redirect_domains;j public.redirect_domain_jobs;reserved jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=p_id FOR UPDATE;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR d.id IS NULL OR j.state<>'leased' OR j.lease IS DISTINCT FROM p_lease OR j.operation IS DISTINCT FROM p_operation OR j.lease_until<=clock_timestamp() OR NOT j.desired OR d.provider_id IS NULL OR d.disabled OR d.verified_at IS NULL OR d.verified_until>clock_timestamp()+interval '6 hours' THEN RETURN NULL;END IF;
 IF NOT redirect_internal.workspace_owner(j.workspace_id,j.requested_by) THEN RETURN NULL;END IF;
 reserved:=public.redirect_domain_resource('reserve',j.requested_by,d.id,jsonb_build_object('version',d.version));
 IF reserved?'retryAfter' THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('actor',j.requested_by,'version',d.version,'attempt',reserved->'attempt','verification',reserved#>'{domain,verification}');
END $function$;

CREATE OR REPLACE FUNCTION public.begin_redirect_domain_validation_restart(p_id uuid, p_lease uuid, p_operation uuid, p_provider uuid, p_zone text, p_target text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); d public.redirect_domains;j public.redirect_domain_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=p_id FOR UPDATE;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
 IF j.domain_id IS NULL OR j.state<>'leased' OR p_lease IS DISTINCT FROM j.lease OR j.lease_until<=clock_timestamp() OR p_operation IS DISTINCT FROM j.operation OR j.validation_restart_operation IS DISTINCT FROM j.operation OR p_provider IS NULL OR d.provider_id IS NULL OR p_provider::text IS DISTINCT FROM d.provider_id OR p_zone IS DISTINCT FROM j.zone_id OR p_target IS DISTINCT FROM j.cname_target OR NOT j.desired OR d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN false;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE public.redirect_domain_jobs SET validation_restart_operation=NULL,validation_restart_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=p_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_image_resource(p_action text, p_actor uuid DEFAULT NULL::uuid, p_principal uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT NULL::jsonb, p_hash text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_after uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);v_principal_key text;member_id uuid;key_id uuid;allowed uuid[];link public.redirects;r public.redirect_qr_image_links;effective jsonb;overrides jsonb;url text;expires timestamptz;rows jsonb;next_id uuid;owner boolean:=p_principal IS NULL;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','list','revoke') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid QR image action' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF owner THEN
  PERFORM public.redirect_management_scope(NULL,'links:read');
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  v_principal_key:='owner:'||p_actor::text;
 ELSE
  allowed:=public.redirect_management_scope(p_principal,'links:read');
  SELECT id INTO key_id FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal;
  IF key_id IS NULL THEN
   SELECT id INTO member_id FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND user_id=p_actor AND active;
   IF member_id IS NULL THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
  END IF;
  v_principal_key:=CASE WHEN key_id IS NOT NULL THEN 'key:' ELSE 'member:' END||p_principal::text;
 END IF;
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid image page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_qr_image_link_json(id) ORDER BY id),'[]') INTO rows
  FROM(SELECT id FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND(owner OR q.principal_key=v_principal_key) AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit) page;
  IF jsonb_array_length(rows)=p_limit THEN
   next_id:=(rows->(p_limit-1)->>'id')::uuid;
   IF NOT EXISTS(SELECT FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND(owner OR q.principal_key=v_principal_key) AND id>next_id) THEN next_id:=NULL;END IF;
  END IF;
  RETURN jsonb_build_object('data',rows,'nextCursor',next_id);
 END IF;
 IF p_action='revoke' THEN
  IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['version']::text[]<>'{}' OR NOT(p_values?'version') THEN RAISE EXCEPTION 'Provide the current image version' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND id=p_id AND(owner OR q.principal_key=v_principal_key) FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'QR image link not found' USING ERRCODE='P0002';END IF;
  IF r.version IS DISTINCT FROM (p_values->>'version')::uuid THEN RAISE EXCEPTION 'QR image link changed; reload before revoking' USING ERRCODE='23505';END IF;
  IF r.revoked_at IS NULL THEN UPDATE public.redirect_qr_image_links SET revoked_at=clock_timestamp(),version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=r.id;END IF;
  RETURN public.redirect_qr_image_link_json(r.id);
 END IF;
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['linkId','url','label','expiresAt','style','logoMode','purpose','entryQuery']::text[]<>'{}' OR ((p_values?'linkId')=(p_values?'url')) THEN RAISE EXCEPTION 'Choose a link or an explicit URL' USING ERRCODE='22023';END IF;
 IF p_values?'purpose' AND (jsonb_typeof(p_values->'purpose')<>'string' OR coalesce(p_values->>'purpose','') NOT IN('visit','install')) OR p_values->>'purpose'='install' AND NOT(p_values?'linkId') THEN RAISE EXCEPTION 'Choose visit or app installation for a managed link' USING ERRCODE='22023';END IF;
 IF p_values?'linkId' THEN
  SELECT * INTO link FROM public.redirects WHERE workspace_id=selected_workspace AND id=(p_values->>'linkId')::uuid AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RAISE EXCEPTION 'Link not found' USING ERRCODE='P0002';END IF;
 ELSE
  IF NOT owner THEN RAISE EXCEPTION 'Explicit URL images require workspace owner access' USING ERRCODE='42501';END IF;
  url:=p_values->>'url';
  IF url IS NULL OR octet_length(url)>2048 OR url ~ '[[:space:][:cntrl:]]' OR url !~ '^https?://[^/@?#[:space:]]+([/?#]|$)' THEN RAISE EXCEPTION 'Provide an HTTP(S) URL without credentials up to 2048 bytes' USING ERRCODE='22023';END IF;
 END IF;
 IF p_values?'entryQuery' AND(jsonb_typeof(p_values->'entryQuery')<>'string' OR coalesce(p_values->>'purpose','visit')<>'install') THEN RAISE EXCEPTION 'Entry query requires app installation' USING ERRCODE='22023';END IF;
 IF cardinality(string_to_array(coalesce(p_values->>'entryQuery',''),'&'))>32 OR octet_length(coalesce(p_values->>'entryQuery',''))>2048 OR(coalesce(p_values->>'entryQuery','')<>'' AND p_values->>'entryQuery' !~ '^([A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)(&[A-Za-z][A-Za-z0-9_.-]*=([A-Za-z0-9*_.+~-]|%[A-Fa-f0-9]{2})*)*$') OR coalesce(p_values->>'entryQuery','') ~* '(^|&)(pw|password|qg_click_id|qg_handoff|qg_app_choice|qg_handoff_(token|app|action)|x-qg-handoff-(token|app|action))=' THEN RAISE EXCEPTION 'Provide a public campaign query without credentials or handoff fields' USING ERRCODE='22023';END IF;
 IF p_values->>'purpose'='install' AND octet_length(public.redirect_management_link(link.id)->>'shortUrl')+octet_length(coalesce(p_values->>'entryQuery',''))+20>2048 THEN RAISE EXCEPTION 'Install entry URL exceeds 2048 bytes' USING ERRCODE='22023';END IF;
 IF p_values?'expiresAt' AND p_values->'expiresAt'<>'null'::jsonb THEN
  expires:=(p_values->>'expiresAt')::timestamptz;
  IF NOT isfinite(expires) OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Choose expiry within one year or no expiry' USING ERRCODE='22023';END IF;
 END IF;
 IF p_values?'label' AND(jsonb_typeof(p_values->'label')<>'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100) OR p_values?'logoMode' AND coalesce(p_values->>'logoMode','') NOT IN('inherit','none','custom') OR p_values?'style' AND jsonb_typeof(p_values->'style') NOT IN('object','null') THEN RAISE EXCEPTION 'Invalid image branding fields' USING ERRCODE='22023';END IF;
 IF coalesce(nullif(p_values->'style','null'::jsonb),'{}')-ARRAY['dots','border','center','foreground','background']::text[]<>'{}' THEN RAISE EXCEPTION 'Unknown image appearance field' USING ERRCODE='22023';END IF;
 overrides:=jsonb_strip_nulls(coalesce(nullif(p_values->'style','null'::jsonb),'{}'));
 effective:=public.redirect_qr_effective_style(link.domain_id)||overrides;
 IF NOT public.redirect_qr_style_valid(effective) THEN RAISE EXCEPTION 'Use supported shapes and dark-on-light colors with at least 4.5:1 contrast' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_qr_image_links q WHERE q.workspace_id=selected_workspace AND q.principal_key=v_principal_key AND revoked_at IS NULL AND(publication_state='published' OR draft_expires_at>clock_timestamp()) AND(expires_at IS NULL OR expires_at>clock_timestamp()))>=100 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log q WHERE q.workspace_id=selected_workspace AND q.principal_key=v_principal_key AND created_at>clock_timestamp()-interval '1 hour')>=60 OR
 (SELECT count(*) FROM public.redirect_qr_image_creation_log WHERE created_at>clock_timestamp()-interval '1 hour')>=600 THEN
  RETURN jsonb_build_object('retryAfter',3600);
 END IF;
 INSERT INTO public.redirect_qr_image_links(workspace_id,token_hash,creator_user_id,creator_member_id,creator_key_id,principal_key,link_id,encoded_url,purpose,entry_query,label,style,logo_mode,expires_at,publication_state,draft_expires_at)
 VALUES(selected_workspace,p_hash,CASE WHEN owner THEN p_actor END,member_id,key_id,v_principal_key,link.id,url,coalesce(p_values->>'purpose','visit'),coalesce(p_values->>'entryQuery',''),coalesce(btrim(p_values->>'label'),'QR image'),overrides,coalesce(p_values->>'logoMode','inherit'),expires,CASE WHEN p_values->>'logoMode'='custom' THEN 'pending' ELSE 'published' END,CASE WHEN p_values->>'logoMode'='custom' THEN clock_timestamp()+interval '15 minutes' END)
 RETURNING * INTO r;
 RETURN public.redirect_qr_image_link_json(r.id);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_public_qr_image(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.redirect_qr_image_links;allowed uuid[];link public.redirects;url text;style jsonb;logo jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND token_hash=p_hash AND publication_state='published' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF r.id IS NULL THEN RETURN NULL;END IF;
 BEGIN
  IF r.creator_user_id IS NOT NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(r.workspace_id,r.creator_user_id);
   IF NOT FOUND THEN RETURN NULL;END IF;
  ELSE allowed:=public.redirect_management_scope(coalesce(r.creator_key_id,r.creator_member_id),'links:read');END IF;
 EXCEPTION WHEN insufficient_privilege THEN RETURN NULL;
 END;
 IF r.link_id IS NOT NULL THEN
  SELECT * INTO link FROM public.redirects WHERE workspace_id=r.workspace_id AND id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed));
  IF link.id IS NULL THEN RETURN NULL;END IF;
  url:=CASE WHEN link.domain_id IS NULL THEN 'https://queer.guide/go/'||link.slug ELSE 'https://'||link.domain_hostname||'/'||CASE WHEN link.is_domain_root THEN '' ELSE link.slug END END;
 ELSE url:=r.encoded_url;END IF;
 IF r.purpose='install' THEN url:=url||'?qg_handoff=install'||CASE WHEN r.entry_query<>'' THEN '&'||r.entry_query ELSE '' END;END IF;
 style:=redirect_internal.qr_style_for_workspace(r.workspace_id,link.domain_id)||r.style;
 IF NOT public.redirect_qr_style_valid(style) THEN RAISE EXCEPTION 'Saved QR branding is invalid; review its settings' USING ERRCODE='22023';END IF;
 logo:=CASE WHEN r.logo_mode='none' THEN jsonb_build_object('effectiveLogo',NULL,'logoSource','hidden') WHEN r.logo_mode='custom' THEN jsonb_build_object('effectiveLogo',redirect_internal.qr_asset_for_workspace(r.workspace_id,r.logo_asset_id),'logoSource','custom') ELSE redirect_internal.qr_logo_for_workspace(r.workspace_id,link.domain_id) END;
 IF r.logo_mode='custom' AND(logo->'effectiveLogo'='null'::jsonb OR logo->'effectiveLogo' IS NULL) THEN RAISE EXCEPTION 'Custom QR artwork is unavailable' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('url',url,'tracked',r.link_id IS NOT NULL,'style',style)||logo;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_qr_image_draft(p_actor uuid, p_principal uuid, p_image uuid)
 RETURNS redirect_qr_image_links
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);r public.redirect_qr_image_links;allowed uuid[];key text;is_key boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'links:read');
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  key:='owner:'||p_actor::text;
 ELSE
  allowed:=public.redirect_management_scope(p_principal,'links:read');
  is_key:=EXISTS(SELECT FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal);
  IF NOT is_key AND NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND active AND user_id=p_actor) THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
  key:=CASE WHEN is_key THEN 'key:' ELSE 'member:' END||p_principal::text;
 END IF;
 SELECT * INTO r FROM public.redirect_qr_image_links WHERE workspace_id=selected_workspace AND id=p_image AND principal_key=key AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR UPDATE;
 IF r.id IS NULL OR r.publication_state<>'pending' OR r.draft_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'QR image draft expired or is unavailable' USING ERRCODE='P0002';END IF;
 IF r.link_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirects WHERE workspace_id=selected_workspace AND id=r.link_id AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed))) THEN RAISE EXCEPTION 'Link is no longer accessible' USING ERRCODE='42501';END IF;
 RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_customer_access(p_customer text, p_actor uuid, p_principal uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); allowed uuid[];ids uuid[];editable boolean;
BEGIN
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_customer IS NULL OR length(p_customer) NOT BETWEEN 1 AND 256 OR btrim(p_customer)='' OR p_customer ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a customer ID' USING ERRCODE='22023';END IF;
 IF p_principal IS NULL THEN
  PERFORM public.redirect_management_scope(NULL,'events:read');
  IF NOT redirect_internal.workspace_owner(selected_workspace,p_actor) THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501';END IF;
 ELSIF NOT EXISTS(SELECT FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal) AND NOT EXISTS(SELECT FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND user_id=p_actor AND active AND kind='user') THEN
  RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';
 END IF;
 allowed:=public.redirect_management_scope(p_principal,'events:read');
 PERFORM pg_advisory_xact_lock(hashtextextended('redirect-customer:'||CASE WHEN selected_workspace='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid THEN '' ELSE selected_workspace::text||':' END||p_customer,0));
 SELECT array_agg(DISTINCT redirect_id) INTO ids FROM (
  SELECT e.redirect_id FROM public.redirect_events e JOIN public.redirect_link_conversions c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id WHERE e.workspace_id=selected_workspace AND c.customer_key=p_customer
  UNION SELECT e.redirect_id FROM public.redirect_events e JOIN public.redirect_link_customers c ON c.workspace_id=e.workspace_id AND c.click_id=e.click_id WHERE e.workspace_id=selected_workspace AND c.customer_key=p_customer
 ) links;
 IF ids IS NULL OR(allowed IS NOT NULL AND NOT(ids&&allowed)) THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='P0002';END IF;
 SELECT coalesce(bool_and((allowed IS NULL OR id=ANY(allowed)) AND public.redirect_can_write_link(p_principal,id)),false) INTO editable FROM unnest(ids) AS id;
 IF p_write THEN
  allowed:=public.redirect_management_scope(p_principal,'links:write');
  IF NOT editable OR(allowed IS NOT NULL AND NOT(ids<@allowed)) THEN RAISE EXCEPTION 'Edit access to every customer link is required' USING ERRCODE='42501';END IF;
 END IF;
 RETURN editable;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_webhook_delivery_resource(p_action text, p_actor uuid, p_principal uuid, p_webhook uuid, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_after bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); actor uuid;w public.redirect_webhooks;d public.redirect_webhook_deliveries;result jsonb;retry integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','get','replay','attempts') THEN RAISE EXCEPTION 'Invalid delivery action' USING ERRCODE='22023';END IF;
 actor:=public.redirect_webhook_actor(p_actor,p_principal,p_action='replay');
 SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=p_webhook;IF w.id IS NULL THEN RAISE EXCEPTION 'Webhook not found' USING ERRCODE='P0002';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR(p_after IS NOT NULL AND p_after<1) THEN RAISE EXCEPTION 'Invalid delivery page' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  WITH all_rows AS(SELECT id,sequence FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND webhook_id=w.id),page AS(SELECT * FROM all_rows WHERE p_after IS NULL OR sequence<p_after ORDER BY sequence DESC LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY sequence DESC LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(public.redirect_webhook_delivery_json(id) ORDER BY sequence DESC) FROM shown),'[]'::jsonb),'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT min(sequence)::text FROM shown) ELSE NULL END) INTO result;RETURN result;
 END IF;
 SELECT * INTO d FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND id=p_id AND webhook_id=w.id FOR UPDATE;IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE='P0002';END IF;
 IF p_action='get' THEN RETURN public.redirect_webhook_delivery_json(d.id,true);END IF;
 IF p_action='attempts' THEN
  WITH page AS(SELECT id,number,key_version AS "keyVersion",started_at AS "startedAt",finished_at AS "finishedAt",http_status AS "httpStatus",error_code AS "errorCode",response_excerpt AS "responseExcerpt",duration_ms AS "durationMs" FROM public.redirect_webhook_attempts WHERE workspace_id=selected_workspace AND delivery_id=d.id AND(p_after IS NULL OR id<p_after) ORDER BY id DESC LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id DESC LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(shown)||jsonb_build_object('id',id::text) ORDER BY id DESC) FROM shown),'[]'::jsonb),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN(SELECT min(id)::text FROM shown) ELSE NULL END) INTO result;RETURN result;
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['version']::text[]<>'{}' OR NOT(p_values?'version') OR d.version IS DISTINCT FROM(p_values->>'version')::uuid THEN RAISE EXCEPTION 'Delivery changed; reload before replaying' USING ERRCODE='23505';END IF;
 IF d.state NOT IN('delivered','failed','cancelled') THEN RAISE EXCEPTION 'Wait for the current delivery before replaying' USING ERRCODE='22023';END IF;
 IF NOT w.enabled OR w.deleted_at IS NOT NULL OR NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by) THEN RAISE EXCEPTION 'Enable a current owner webhook before replaying' USING ERRCODE='42501';END IF;
 retry:=public.redirect_webhook_budget('replay:'||actor,30,3600);IF retry>0 THEN RETURN jsonb_build_object('retryAfter',retry);END IF;
 UPDATE public.redirect_webhook_deliveries SET state='queued',routing_version=w.routing_version,version=gen_random_uuid(),cycle_attempts=0,replays=replays+1,next_attempt_at=clock_timestamp(),lease=NULL,lease_until=NULL,finished_at=NULL,error_code=NULL,http_status=NULL WHERE workspace_id=selected_workspace AND id=d.id;
 RETURN public.redirect_webhook_delivery_json(d.id,true);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_webhook_actor(p_actor uuid, p_principal uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); t public.redirect_api_tokens;actor uuid;
BEGIN
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 actor:=p_actor;
 IF p_principal IS NOT NULL THEN
  SELECT * INTO t FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal FOR SHARE;
  IF t.id IS NULL OR t.member_id IS NOT NULL OR t.redirect_ids IS NOT NULL OR t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR NOT('events:read'=ANY(t.scopes)) OR NOT((CASE WHEN p_write THEN 'workspace:write' ELSE 'workspace:read' END)=ANY(t.scopes)) THEN RAISE EXCEPTION 'Unrestricted owner webhook access required' USING ERRCODE='42501';END IF;
  actor:=t.created_by;
 END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
 RETURN actor;
END $function$;

CREATE OR REPLACE FUNCTION public.prune_redirect_webhooks(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); histories integer;events integer;secrets integer;
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid cleanup batch' USING ERRCODE='22023';END IF;
 UPDATE public.redirect_webhooks SET previous_secret=NULL,previous_key_version=NULL,previous_expires_at=NULL WHERE workspace_id=selected_workspace AND previous_expires_at<=clock_timestamp();GET DIAGNOSTICS secrets=ROW_COUNT;
 WITH doomed AS MATERIALIZED(SELECT d.id FROM public.redirect_webhook_deliveries d JOIN public.redirect_webhooks w ON w.workspace_id=d.workspace_id AND w.id=d.webhook_id WHERE d.workspace_id=selected_workspace AND d.state IN('queued','retry','leased') AND NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by) ORDER BY d.sequence LIMIT p_limit FOR UPDATE OF d),
 attempts AS(UPDATE public.redirect_webhook_attempts SET finished_at=clock_timestamp(),error_code='scope_changed' WHERE workspace_id=selected_workspace AND finished_at IS NULL AND delivery_id IN(SELECT id FROM doomed))
 UPDATE public.redirect_webhook_deliveries SET state='cancelled',lease=NULL,lease_until=NULL,finished_at=clock_timestamp(),error_code='scope_changed',version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id IN(SELECT id FROM doomed);
 DELETE FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND id IN(SELECT id FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND finished_at<clock_timestamp()-interval '30 days' AND state IN('delivered','failed','cancelled') ORDER BY finished_at LIMIT p_limit);GET DIAGNOSTICS histories=ROW_COUNT;
 DELETE FROM public.redirect_webhook_events e WHERE e.workspace_id=selected_workspace AND id IN(SELECT v.id FROM public.redirect_webhook_events v WHERE v.workspace_id=selected_workspace AND v.created_at<clock_timestamp()-interval '30 days' AND NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND event_id=v.id) ORDER BY v.created_at LIMIT p_limit);GET DIAGNOSTICS events=ROW_COUNT;
 DELETE FROM public.redirect_webhook_budgets WHERE workspace_id=selected_workspace AND window_at<clock_timestamp()-interval '2 days';
 RETURN jsonb_build_object('deliveries',histories,'events',events,'secrets',secrets);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_password_branding_actor(p_actor uuid, p_principal uuid, p_link uuid, p_write boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);allowed uuid[];t public.redirect_api_tokens;member public.redirect_workspace_members;actor uuid;principal_key text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_write IS NULL THEN RAISE EXCEPTION 'Invalid access mode' USING ERRCODE='22023';END IF;
 IF p_write THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 IF p_principal IS NULL THEN
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace owner access required' USING ERRCODE='42501';END IF;
  actor:=p_actor;principal_key:='owner:'||actor::text;
 ELSE
  SELECT * INTO t FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace AND id=p_principal FOR SHARE;
  IF t.id IS NOT NULL THEN
   actor:=t.created_by;principal_key:='key:'||t.id::text;
   IF t.member_id IS NULL THEN
    PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,actor);
    IF NOT FOUND THEN RAISE EXCEPTION 'Key owner access changed' USING ERRCODE='42501';END IF;
   END IF;
  ELSE
   SELECT * INTO member FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace AND id=p_principal AND kind='user' AND active AND user_id=p_actor FOR SHARE;
   IF member.id IS NULL THEN RAISE EXCEPTION 'Account does not match membership' USING ERRCODE='42501';END IF;
   actor:=p_actor;principal_key:='member:'||member.id::text;
  END IF;
 END IF;
 allowed:=public.redirect_management_scope(p_principal,CASE WHEN p_write THEN 'links:write' ELSE 'links:read' END);
 PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=p_link AND type='SHORT' AND(allowed IS NULL OR id=ANY(allowed)) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Managed link not found or access changed' USING ERRCODE='P0002';END IF;
 IF p_write AND NOT public.redirect_can_write_link(p_principal,p_link) THEN RAISE EXCEPTION 'Link edit access required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('actor',actor,'principalKey',principal_key);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_member_administration(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);saved public.redirect_workspace_members; rows jsonb; total bigint;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);
 ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','update','delete') THEN RAISE EXCEPTION 'Invalid membership operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid member page' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO total FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') INTO rows FROM(SELECT id,user_id,kind,label,role,active,created_at FROM public.redirect_workspace_members WHERE workspace_id=selected_workspace ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',rows,'count',total);
 END IF;
 IF p_action IN('update','delete') AND p_id IS NULL OR p_action='create' AND p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid member ID' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN
  DELETE FROM public.redirect_workspace_members WHERE id=p_id AND workspace_id=selected_workspace RETURNING * INTO saved;
  RETURN jsonb_build_object('id',p_id,'deleted',saved.id IS NOT NULL);
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','role','active','kind','user_id') OR (p_action='update' AND k IN('kind','user_id'))) THEN RAISE EXCEPTION 'Invalid membership fields' USING ERRCODE='22023';END IF;
 IF (p_action='create' OR p_values?'label') AND (jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Member label must be 1–100 characters' USING ERRCODE='22023';END IF;
 IF p_values?'role' AND (jsonb_typeof(p_values->'role') IS DISTINCT FROM 'string' OR p_values->>'role' NOT IN('member','viewer')) OR p_values?'active' AND jsonb_typeof(p_values->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid member role or status' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  IF jsonb_typeof(p_values->'kind') IS DISTINCT FROM 'string' OR p_values->>'kind' NOT IN('user','machine') OR (p_values->>'kind'='user' AND (jsonb_typeof(p_values->'user_id') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT FROM auth.users WHERE id=(p_values->>'user_id')::uuid))) OR (p_values->>'kind'='machine' AND coalesce(p_values->'user_id','null'::jsonb)<>'null'::jsonb) THEN RAISE EXCEPTION 'Choose an existing account UUID or a machine member' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_members(workspace_id,label,role,active,kind,user_id) VALUES(selected_workspace,btrim(p_values->>'label'),coalesce(p_values->>'role','member'),coalesce((p_values->>'active')::boolean,true),p_values->>'kind',nullif(p_values->>'user_id','')::uuid) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_workspace_members SET label=CASE WHEN p_values?'label' THEN btrim(p_values->>'label') ELSE label END,role=CASE WHEN p_values?'role' THEN p_values->>'role' ELSE role END,active=CASE WHEN p_values?'active' THEN (p_values->>'active')::boolean ELSE active END WHERE id=p_id AND workspace_id=selected_workspace RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='P0002';END IF;
 END IF;
 RETURN to_jsonb(saved);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_token_administration(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);scopes_value text[]; ids uuid[]; member uuid; expiry timestamptz; saved_id uuid; rows jsonb; total bigint;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','revoke') OR (p_action='revoke' AND p_id IS NULL) OR (p_action<>'revoke' AND p_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid credential operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid credential page' USING ERRCODE='22023';END IF;
  SELECT count(*) INTO total FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace;
  SELECT coalesce(jsonb_agg(public.redirect_token_metadata(r.id) ORDER BY r.created_at DESC,r.id DESC),'[]') INTO rows FROM(SELECT id,created_at FROM public.redirect_api_tokens WHERE workspace_id=selected_workspace ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',rows,'count',total);
 END IF;
 IF p_action='revoke' THEN
  UPDATE public.redirect_api_tokens SET revoked_at=clock_timestamp() WHERE id=p_id AND workspace_id=selected_workspace AND revoked_at IS NULL RETURNING id INTO saved_id;
  RETURN jsonb_build_object('revoked',saved_id IS NOT NULL);
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('name','expires_at','scopes','redirect_ids','member_id','token_hash','prefix')) THEN RAISE EXCEPTION 'Invalid credential fields' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'name')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide a credential name (1–100 characters)' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'token_hash') IS DISTINCT FROM 'string' OR p_values->>'token_hash' !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_values->'prefix') IS DISTINCT FROM 'string' OR p_values->>'prefix' !~ '^qg_redirect_[a-f0-9]{8}$' THEN RAISE EXCEPTION 'Invalid server credential digest' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'expires_at') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid credential expiry' USING ERRCODE='22023';END IF;
 expiry:=(p_values->>'expires_at')::timestamptz;
 IF NOT isfinite(expiry) OR expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Credentials must expire within one year' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_values->'scopes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_values->'scopes') NOT BETWEEN 1 AND 6 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'scopes') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid credential permissions' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT value ORDER BY value) INTO scopes_value FROM jsonb_array_elements_text(p_values->'scopes');
 IF NOT(scopes_value<@ARRAY['links:read','links:write','workspace:read','workspace:write','events:read','conversions:write']::text[]) THEN RAISE EXCEPTION 'Invalid credential permissions' USING ERRCODE='22023';END IF;
 IF coalesce(p_values->'redirect_ids','null'::jsonb)<>'null'::jsonb THEN
  IF jsonb_typeof(p_values->'redirect_ids')<>'array' OR jsonb_array_length(p_values->'redirect_ids') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'redirect_ids') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid link scope' USING ERRCODE='22023';END IF;
  SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO ids FROM jsonb_array_elements_text(p_values->'redirect_ids');
  IF 'workspace:read'=ANY(scopes_value) OR 'workspace:write'=ANY(scopes_value) THEN RAISE EXCEPTION 'Workspace permissions require an unrestricted credential' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(ids) AND type='SHORT' ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(ids) AND type='SHORT')<>cardinality(ids) THEN RAISE EXCEPTION 'One or more managed links were not found' USING ERRCODE='22023';END IF;
 END IF;
 IF coalesce(p_values->'member_id','null'::jsonb)<>'null'::jsonb THEN
  IF jsonb_typeof(p_values->'member_id')<>'string' THEN RAISE EXCEPTION 'Invalid member binding' USING ERRCODE='22023';END IF;
  member:=(p_values->>'member_id')::uuid;
  PERFORM 1 FROM public.redirect_workspace_members WHERE id=member AND workspace_id=selected_workspace AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active workspace member required' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO public.redirect_api_tokens(workspace_id,name,token_hash,prefix,scopes,redirect_ids,member_id,created_by,expires_at) VALUES(selected_workspace,btrim(p_values->>'name'),p_values->>'token_hash',p_values->>'prefix',scopes_value,ids,member,p_actor,expiry) RETURNING id INTO saved_id;
 RETURN public.redirect_token_metadata(saved_id);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_app_admin(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_expected uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor); saved public.redirect_native_apps; result jsonb; domain uuid; item text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','create','update','delete') THEN RAISE EXCEPTION 'Invalid app operation' USING ERRCODE='22023';END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid app page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(public.redirect_native_app_json(r) ORDER BY r.id),'[]') INTO result FROM(SELECT * FROM public.redirect_native_apps WHERE workspace_id=selected_workspace ORDER BY id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace));
 END IF;
 IF p_action IN('update','delete') THEN
  SELECT * INTO saved FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND id=p_id FOR UPDATE;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'App binding not found' USING ERRCODE='P0002';END IF;
  IF p_expected IS NULL OR saved.revision<>p_expected THEN RAISE EXCEPTION 'App binding changed; reload before saving' USING ERRCODE='23505';END IF;
 ELSIF p_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid app ID' USING ERRCODE='22023';END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND id=p_id;RETURN jsonb_build_object('id',p_id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values='{}' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('label','domainId','platform','appId','appClipId','fingerprints','paths','enabled','publicName','storeId','appGroupId','handoffEnabled')) THEN RAISE EXCEPTION 'Invalid app fields' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN saved.enabled:=false;saved.handoff_enabled:=false;saved.fingerprints:='{}';saved.paths:=ARRAY['/go/*'];END IF;
 IF p_values?'label' THEN IF jsonb_typeof(p_values->'label')<>'string' THEN RAISE EXCEPTION 'Invalid label' USING ERRCODE='22023';END IF;saved.label:=btrim(p_values->>'label');END IF;
 IF p_values?'domainId' THEN
  IF p_values->'domainId'<>'null' AND jsonb_typeof(p_values->'domainId')<>'string' THEN RAISE EXCEPTION 'Invalid app domain' USING ERRCODE='22023';END IF;
  saved.domain_id:=(p_values->>'domainId')::uuid;
 END IF;
 IF saved.domain_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=saved.domain_id) THEN RAISE EXCEPTION 'Choose an available registered domain' USING ERRCODE='22023';END IF;
 IF p_values?'platform' THEN saved.platform:=p_values->>'platform';END IF;
 IF p_values?'appId' THEN saved.app_id:=p_values->>'appId';END IF;
 IF p_values?'appClipId' THEN
  IF p_values->'appClipId'<>'null' AND jsonb_typeof(p_values->'appClipId')<>'string' THEN RAISE EXCEPTION 'Invalid App Clip identity' USING ERRCODE='22023';END IF;
  saved.app_clip_id:=nullif(btrim(p_values->>'appClipId'),'');
 END IF;
 IF p_values?'enabled' THEN IF jsonb_typeof(p_values->'enabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid publication state' USING ERRCODE='22023';END IF;saved.enabled:=(p_values->>'enabled')::boolean;END IF;
 FOREACH item IN ARRAY ARRAY['publicName','storeId','appGroupId'] LOOP
  IF p_values?item THEN
   IF p_values->item<>'null' AND jsonb_typeof(p_values->item)<>'string' THEN RAISE EXCEPTION 'Invalid install settings' USING ERRCODE='22023';END IF;
   IF item='publicName' THEN saved.public_name:=nullif(btrim(p_values->>item),'');
   ELSIF item='storeId' THEN saved.store_id:=nullif(btrim(p_values->>item),'');
   ELSE saved.app_group_id:=nullif(btrim(p_values->>item),'');END IF;
  END IF;
 END LOOP;
 IF p_values?'handoffEnabled' THEN
  IF jsonb_typeof(p_values->'handoffEnabled')<>'boolean' THEN RAISE EXCEPTION 'Invalid handoff state' USING ERRCODE='22023';END IF;
  saved.handoff_enabled:=(p_values->>'handoffEnabled')::boolean;
 END IF;
 IF NOT saved.enabled THEN
  IF p_values->'handoffEnabled'='true' THEN RAISE EXCEPTION 'Publish the association before enabling handoffs' USING ERRCODE='22023';END IF;
  saved.handoff_enabled:=false;
 END IF;
 IF p_values?'fingerprints' THEN
  IF jsonb_typeof(p_values->'fingerprints')<>'array' OR jsonb_array_length(p_values->'fingerprints')>10 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'fingerprints') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid signing fingerprints' USING ERRCODE='22023';END IF;
  SELECT coalesce(array_agg(DISTINCT upper(value) ORDER BY upper(value)),'{}') INTO saved.fingerprints FROM jsonb_array_elements_text(p_values->'fingerprints');
 END IF;
 IF p_values?'paths' THEN
  IF jsonb_typeof(p_values->'paths')<>'array' OR jsonb_array_length(p_values->'paths') NOT BETWEEN 1 AND 20 OR EXISTS(SELECT FROM jsonb_array_elements(p_values->'paths') e WHERE jsonb_typeof(e)<>'string') THEN RAISE EXCEPTION 'Invalid app paths' USING ERRCODE='22023';END IF;
  SELECT array_agg(value ORDER BY ordinal) INTO saved.paths FROM(SELECT value,min(ordinality) AS ordinal FROM jsonb_array_elements_text(p_values->'paths') WITH ORDINALITY GROUP BY value) entries;
 END IF;
 IF saved.label IS NULL OR length(saved.label) NOT BETWEEN 1 AND 100 OR saved.platform IS NULL OR saved.platform NOT IN('ios','android') OR saved.app_id IS NULL OR length(saved.app_id)>255 OR saved.paths IS NULL OR cardinality(saved.paths) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Provide valid app settings' USING ERRCODE='22023';END IF;
 IF saved.platform='ios' THEN
  IF saved.app_id !~ '^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' OR cardinality(saved.fingerprints)<>0 THEN RAISE EXCEPTION 'iOS needs an application identifier and no Android fingerprints' USING ERRCODE='22023';END IF;
  IF saved.app_clip_id IS NOT NULL AND (length(saved.app_clip_id)>255 OR saved.app_clip_id !~ '^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' OR left(saved.app_clip_id,length(saved.app_id)+1)<>saved.app_id||'.') THEN RAISE EXCEPTION 'App Clip must extend the signed parent application identifier' USING ERRCODE='22023';END IF;
 ELSE
  IF saved.app_clip_id IS NOT NULL THEN RAISE EXCEPTION 'Android bindings cannot publish an App Clip' USING ERRCODE='22023';END IF;
  IF saved.app_id !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$' OR cardinality(saved.fingerprints) NOT BETWEEN 1 AND 10 OR EXISTS(SELECT FROM unnest(saved.fingerprints) f WHERE f !~ '^([A-F0-9]{2}:){31}[A-F0-9]{2}$') THEN RAISE EXCEPTION 'Android needs a package and SHA-256 release signing fingerprints' USING ERRCODE='22023';END IF;
 END IF;
 FOREACH item IN ARRAY saved.paths LOOP
  IF length(item)>256 OR item !~ '^/([A-Za-z0-9-]+/)*[A-Za-z0-9-]*(\*)?$' OR saved.domain_id IS NULL AND item NOT LIKE '/go/%' THEN RAISE EXCEPTION 'Use short-link paths on the selected host' USING ERRCODE='22023';END IF;
 END LOOP;
 IF saved.public_name IS NOT NULL AND (length(saved.public_name) NOT BETWEEN 1 AND 100 OR saved.public_name ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'Public app name must be 1-100 characters on one line' USING ERRCODE='22023';END IF;
 IF saved.store_id IS NOT NULL AND (saved.platform='ios' AND saved.store_id !~ '^[1-9][0-9]{0,19}$' OR saved.platform='android' AND saved.store_id<>saved.app_id) THEN RAISE EXCEPTION 'Use a numeric App Store ID or this Android package name' USING ERRCODE='22023';END IF;
 IF saved.app_group_id IS NOT NULL AND (saved.platform<>'ios' OR length(saved.app_group_id)>255 OR saved.app_group_id !~ '^group\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$') THEN RAISE EXCEPTION 'Use the shared iOS App Group identifier' USING ERRCODE='22023';END IF;
 IF saved.handoff_enabled AND (saved.public_name IS NULL OR saved.store_id IS NULL OR saved.platform='ios' AND (saved.app_clip_id IS NULL OR saved.app_group_id IS NULL)) THEN RAISE EXCEPTION 'Provide the public name, store identity and iOS Clip/group setup before enabling handoffs' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND domain_id IS NOT DISTINCT FROM saved.domain_id AND id IS DISTINCT FROM p_id)>=10 THEN RAISE EXCEPTION 'At most ten app bindings per host' USING ERRCODE='22023';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_native_apps(workspace_id,domain_id,label,platform,app_id,app_clip_id,public_name,store_id,app_group_id,handoff_enabled,fingerprints,paths,enabled,created_by) VALUES(selected_workspace,saved.domain_id,saved.label,saved.platform,saved.app_id,saved.app_clip_id,saved.public_name,saved.store_id,saved.app_group_id,saved.handoff_enabled,saved.fingerprints,saved.paths,saved.enabled,p_actor) RETURNING * INTO saved;
 ELSE
  UPDATE public.redirect_native_apps SET domain_id=saved.domain_id,label=saved.label,platform=saved.platform,app_id=saved.app_id,app_clip_id=saved.app_clip_id,public_name=saved.public_name,store_id=saved.store_id,app_group_id=saved.app_group_id,handoff_enabled=saved.handoff_enabled,fingerprints=saved.fingerprints,paths=saved.paths,enabled=saved.enabled,created_by=p_actor WHERE workspace_id=selected_workspace AND id=p_id RETURNING * INTO saved;
 END IF;
 -- Leave headroom for platform envelopes and per-path JSON component wrappers.
 IF (SELECT coalesce(sum(octet_length(jsonb_strip_nulls(jsonb_build_object('platform',platform,'appId',app_id,'appClipId',app_clip_id,'fingerprints',fingerprints,'paths',paths))::text)),0) FROM public.redirect_native_apps WHERE workspace_id=selected_workspace AND domain_id IS NOT DISTINCT FROM saved.domain_id AND enabled)>50000 THEN RAISE EXCEPTION 'Published app settings are too large; use fewer path patterns' USING ERRCODE='22023';END IF;
 RETURN public.redirect_native_app_json(saved);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_management_scope(p_token_id uuid, p_scope text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace();t public.redirect_api_tokens; member public.redirect_workspace_members; member_key uuid; ids uuid[]; required_rank integer; session_actor uuid; request_context jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_scope IS NULL OR p_scope NOT IN('links:read','links:write','events:read','workspace:read','workspace:write','conversions:write') THEN RAISE EXCEPTION 'Invalid permission scope' USING ERRCODE='22023';END IF;
 IF p_scope LIKE '%:write' THEN PERFORM pg_advisory_xact_lock(471983093);ELSE PERFORM pg_advisory_xact_lock_shared(471983093);END IF;
 request_context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 session_actor:=nullif(request_context->>'x-qg-redirect-session-actor','')::uuid;
 IF p_token_id IS NULL THEN
  IF session_actor IS NULL AND selected_workspace<>'58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid THEN RAISE EXCEPTION 'Explicit owner account context required' USING ERRCODE='42501';END IF;
  IF session_actor IS NOT NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,session_actor);
   IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO t FROM public.redirect_api_tokens WHERE id=p_token_id AND workspace_id=selected_workspace FOR SHARE;
 IF t.id IS NOT NULL THEN
  IF t.revoked_at IS NOT NULL OR t.expires_at<=clock_timestamp() OR NOT(p_scope=ANY(t.scopes)) THEN RAISE EXCEPTION 'Credential expired, revoked or missing scope' USING ERRCODE='42501';END IF;
  IF p_scope LIKE 'workspace:%' AND t.redirect_ids IS NOT NULL THEN RAISE EXCEPTION 'Workspace permissions require an unrestricted credential' USING ERRCODE='42501';END IF;
  IF t.member_id IS NULL THEN
   PERFORM 1 WHERE redirect_internal.workspace_owner(t.workspace_id,t.created_by);
   IF NOT FOUND THEN RAISE EXCEPTION 'Credential owner access is no longer active' USING ERRCODE='42501';END IF;
   IF t.redirect_ids IS NULL THEN RETURN NULL;END IF;
   SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO ids FROM public.redirects WHERE workspace_id=selected_workspace AND id=ANY(t.redirect_ids);
   RETURN ids;
  END IF;
  member_key:=t.member_id;
 ELSE
  IF p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Session scope is not allowed' USING ERRCODE='42501';END IF;
  member_key:=p_token_id;
 END IF;
 SELECT * INTO member FROM public.redirect_workspace_members WHERE id=member_key AND workspace_id=selected_workspace AND active AND (t.id IS NOT NULL OR kind='user') FOR SHARE;
 IF t.id IS NULL AND session_actor IS NOT NULL AND member.user_id IS DISTINCT FROM session_actor THEN RAISE EXCEPTION 'Session membership does not match the authenticated account' USING ERRCODE='42501';END IF;
 IF member.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace membership is inactive or missing' USING ERRCODE='42501';END IF;
 required_rank:=CASE WHEN p_scope LIKE '%:write' THEN 2 ELSE 1 END;
 SELECT coalesce(array_agg(r.id),ARRAY[]::uuid[]) INTO ids
 FROM public.redirects r LEFT JOIN public.redirect_link_metadata m ON m.redirect_key='redirects:'||r.id::text AND m.workspace_id=selected_workspace
 LEFT JOIN public.redirect_link_folders f ON f.id=m.folder_id AND f.workspace_id=selected_workspace
 LEFT JOIN public.redirect_folder_members a ON a.folder_id=f.id AND a.member_id=member.id AND a.workspace_id=selected_workspace
 WHERE r.workspace_id=selected_workspace AND (r.type='SHORT' OR m.folder_id IS NOT NULL) AND (t.redirect_ids IS NULL OR r.id=ANY(t.redirect_ids))
 AND least(CASE WHEN member.role='viewer' THEN 1 ELSE 3 END,
  CASE WHEN m.folder_id IS NULL THEN 2 ELSE CASE coalesce(a.permission,f.default_permission) WHEN 'owner' THEN 3 WHEN 'edit' THEN 2 WHEN 'view' THEN 1 ELSE 0 END END)>=required_rank;
 RETURN ids;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_workspace_invitation(p_actor uuid, p_action text, p_id uuid DEFAULT NULL::uuid, p_values jsonb DEFAULT '{}'::jsonb, p_hash text DEFAULT NULL::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);saved public.redirect_workspace_invitations; membership public.redirect_workspace_members; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN PERFORM pg_advisory_xact_lock_shared(471983093);ELSE PERFORM pg_advisory_xact_lock(471983093);END IF;
 IF p_actor IS NULL OR p_action IS NULL OR p_action NOT IN('list','create','revoke','accept') THEN RAISE EXCEPTION 'Invalid invitation operation' USING ERRCODE='22023';END IF;
 IF p_action<>'accept' THEN
  PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace owner access required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='list' THEN
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]') INTO result FROM(SELECT id,email,label,role,created_at,expires_at,expires_at<=clock_timestamp() AS expired,revoked_at,accepted_at,member_id FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) r;
  RETURN jsonb_build_object('data',result,'count',(SELECT count(*) FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace));
 ELSIF p_action='revoke' THEN
  UPDATE public.redirect_workspace_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_id AND workspace_id=selected_workspace AND accepted_at IS NULL;
  RETURN jsonb_build_object('id',p_id,'revoked',FOUND);
 ELSIF p_action='create' THEN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_values) k WHERE k NOT IN('email','label','role')) OR jsonb_typeof(p_values->'email') IS DISTINCT FROM 'string' OR jsonb_typeof(p_values->'label') IS DISTINCT FROM 'string' OR length(btrim(p_values->>'label')) NOT BETWEEN 1 AND 100 OR length(btrim(p_values->>'email'))>254 OR btrim(p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_values->>'role' IS NULL OR p_values->>'role' NOT IN('member','viewer') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation fields' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND created_by=p_actor AND created_at>now()-interval '1 hour')>=20 OR (SELECT count(*) FROM public.redirect_workspace_invitations WHERE created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'Invitation creation limit reached; try later' USING ERRCODE='22023';END IF;
  INSERT INTO public.redirect_workspace_invitations(workspace_id,email,label,role,token_hash,created_by) VALUES(selected_workspace,lower(btrim(p_values->>'email')),btrim(p_values->>'label'),p_values->>'role',p_hash,p_actor) RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'expiresAt',saved.expires_at);
 END IF;
 SELECT * INTO saved FROM public.redirect_workspace_invitations WHERE workspace_id=selected_workspace AND ((p_hash IS NOT NULL AND token_hash=p_hash) OR (p_hash IS NULL AND id=p_id)) FOR UPDATE;
 IF saved.id IS NULL OR saved.revoked_at IS NOT NULL OR saved.expires_at<=clock_timestamp() OR NOT public.redirect_invitation_recipient(p_actor,saved.email) OR NOT redirect_internal.workspace_owner(saved.workspace_id,saved.created_by) OR (saved.accepted_at IS NOT NULL AND saved.accepted_by IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 SELECT * INTO membership FROM public.redirect_workspace_members WHERE user_id=p_actor AND workspace_id=selected_workspace FOR UPDATE;
 IF membership.id IS NOT NULL AND NOT membership.active THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF saved.accepted_at IS NOT NULL AND (membership.id IS NULL OR membership.id IS DISTINCT FROM saved.member_id) THEN RAISE EXCEPTION 'Invitation unavailable; verify your account or ask for a new invitation' USING ERRCODE='P0002';END IF;
 IF membership.id IS NULL THEN
  INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES(selected_workspace,p_actor,'user',saved.label,saved.role) RETURNING * INTO membership;
 END IF;
 UPDATE public.redirect_workspace_invitations SET accepted_by=p_actor,accepted_at=coalesce(accepted_at,clock_timestamp()),member_id=membership.id WHERE id=saved.id AND workspace_id=selected_workspace;
 RETURN jsonb_build_object('memberId',membership.id,'role',membership.role,'accepted',true);
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_native_apps_public(p_hostname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid; domain uuid; readiness jsonb; result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN RAISE EXCEPTION 'Invalid association host' USING ERRCODE='22023';END IF;
 selected_workspace:=public.redirect_public_workspace(p_hostname);IF selected_workspace IS NULL THEN RETURN NULL;END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') THEN
  readiness:=public.redirect_public_domain(p_hostname);
  IF readiness IS NULL THEN RETURN NULL;END IF;
  domain:=(readiness->>'id')::uuid;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('platform',platform,'appId',app_id,'appClipId',app_clip_id,'fingerprints',fingerprints,'paths',paths)) ORDER BY id),'[]') INTO result FROM public.redirect_native_apps app WHERE app.workspace_id=selected_workspace AND app.domain_id IS NOT DISTINCT FROM domain AND enabled AND redirect_internal.workspace_owner(app.workspace_id,app.created_by);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_domain_instruction_current(p_id uuid, p_target text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); m public.redirect_domain_instruction_mail;d public.redirect_domains;s jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE workspace_id=selected_workspace AND id=p_id;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=m.domain_id;
 IF m.id IS NULL OR d.id IS NULL OR d.disabled OR d.archived OR d.version IS DISTINCT FROM m.domain_version OR p_target IS DISTINCT FROM m.cname_target OR NOT redirect_internal.workspace_owner(m.workspace_id,m.actor_id) THEN RETURN false;END IF;
 BEGIN s:=public.redirect_domain_instruction_snapshot(d.id,p_target);EXCEPTION WHEN invalid_parameter_value OR no_data_found THEN RETURN false;END;
 RETURN s->>'snapshot'=m.snapshot;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_invitation_inbox(p_actor uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid invitation page' USING ERRCODE='22023';END IF;
 WITH verified AS MATERIALIZED(SELECT lower(email) AS email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL),
 visible AS MATERIALIZED(SELECT i.id,i.label,i.role,i.expires_at,i.created_at FROM public.redirect_workspace_invitations i JOIN verified account ON account.email=i.email WHERE i.workspace_id=selected_workspace AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() AND redirect_internal.workspace_owner(i.workspace_id,i.created_by)),
 page AS(SELECT * FROM visible ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'data',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]')) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_domain_instruction_snapshot(p_domain uuid, p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); d public.redirect_domains;j public.redirect_domain_jobs;records jsonb;record jsonb;result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=p_domain;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 IF p_target IS NULL OR length(p_target)>239 OR p_target !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' OR p_target ~ '(^|\.)(localhost|local|internal|home|test|invalid|example|onion)$' THEN RAISE EXCEPTION 'DNS target is not configured' USING ERRCODE='22023';END IF;
 records:=jsonb_build_array(jsonb_build_object('type','CNAME','name',d.hostname,'value',p_target||'.'),jsonb_build_object('type','TXT','name','_qg-redirect.'||d.hostname,'value','qg-redirect='||d.verification_token));
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND domain_id=d.id;
 IF d.provider_id IS NOT NULL AND j.desired AND j.cname_target=p_target AND j.state NOT IN('failed','review','disconnected') AND redirect_internal.workspace_owner(j.workspace_id,j.requested_by) THEN
  IF jsonb_typeof(j.validation)<>'array' OR jsonb_array_length(j.validation)>10 THEN RAISE EXCEPTION 'Refresh provider records before forwarding instructions' USING ERRCODE='22023';END IF;
  FOR record IN SELECT DISTINCT value FROM jsonb_array_elements(j.validation) ORDER BY value LOOP
   IF jsonb_typeof(record)<>'object' OR record-ARRAY['type','name','value']::text[]<>'{}' OR NOT(record?&ARRAY['type','name','value']) OR record->>'type'<>'TXT'
    OR jsonb_typeof(record->'name')<>'string' OR jsonb_typeof(record->'value')<>'string' OR length(record->>'name') NOT BETWEEN 1 AND 253 OR length(record->>'value') NOT BETWEEN 1 AND 1024
    OR record->>'name' !~ '^[a-z0-9_.-]+$' OR (record->>'name'<>d.hostname AND right(record->>'name',length(d.hostname)+1)<>'.'||d.hostname) OR record->>'value' ~ '[[:cntrl:]]'
   THEN RAISE EXCEPTION 'Refresh provider records before forwarding instructions' USING ERRCODE='22023';END IF;
   IF NOT records @> jsonb_build_array(record) THEN records:=records||jsonb_build_array(record);END IF;
  END LOOP;
 END IF;
 result:=jsonb_build_object('hostname',d.hostname,'version',d.version,'records',records);
 RETURN result||jsonb_build_object('snapshot',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_workspace_context(p_actor uuid, p_workspace uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'links:read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(p_actor);w public.redirect_workspaces;m public.redirect_workspace_members;request_actor uuid;context jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_actor IS NULL OR p_scope IS NULL OR p_scope<>ALL(ARRAY['links:read','links:write','events:read','workspace:read','workspace:write']) THEN RAISE EXCEPTION 'Invalid workspace session' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 context:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 request_actor:=nullif(context->>'x-qg-redirect-session-actor','')::uuid;
 IF request_actor IS NOT NULL AND request_actor<>p_actor THEN RAISE EXCEPTION 'Session account does not match the workspace actor' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.redirect_workspaces WHERE id=coalesce(p_workspace,selected_workspace) AND id=selected_workspace AND is_legacy AND status='active' FOR SHARE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'This workspace is not available' USING ERRCODE='42501';END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(selected_workspace,p_actor);
 IF FOUND THEN RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',NULL,'role','owner','label',NULL));END IF;
 SELECT * INTO m FROM public.redirect_workspace_members WHERE workspace_id=w.id AND user_id=p_actor AND kind='user' AND active FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Redirects workspace access is required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('workspace',jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug),'principal',jsonb_build_object('id',m.id,'role',m.role,'label',m.label));
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_domain_jobs(p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); j public.redirect_domain_jobs;d public.redirect_domains;result jsonb:='[]';kind text;
BEGIN
 PERFORM pg_advisory_xact_lock(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid provider batch' USING ERRCODE='22023';END IF;
 FOR j IN SELECT * FROM public.redirect_domain_jobs WHERE workspace_id=selected_workspace AND ((state IN('queued','waiting','ready') AND next_attempt_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,domain_id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO d FROM public.redirect_domains WHERE workspace_id=selected_workspace AND id=j.domain_id FOR UPDATE;
  IF j.attempts>=12 THEN UPDATE public.redirect_domain_jobs SET state='failed',last_error='Provider retry limit reached',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;END IF;
  IF NOT j.desired AND d.provider_id IS NULL AND j.create_started_at IS NULL AND j.adopt_id IS NULL THEN UPDATE public.redirect_domain_jobs SET state='disconnected',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;END IF;
  kind:=CASE WHEN j.adopt_id IS NOT NULL THEN 'adopt' WHEN d.provider_id IS NOT NULL AND NOT j.desired THEN 'delete' WHEN d.provider_id IS NOT NULL THEN 'refresh' WHEN j.create_started_at IS NOT NULL THEN 'reconcile' ELSE 'preflight' END;
  IF kind='preflight' AND (d.disabled OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() OR NOT redirect_internal.workspace_owner(j.workspace_id,j.requested_by)) THEN
   UPDATE public.redirect_domain_jobs SET state='failed',last_error='Current owner permission and fresh ownership proof are required',lease=NULL,lease_until=NULL WHERE workspace_id=selected_workspace AND domain_id=j.domain_id;CONTINUE;
  END IF;
  UPDATE public.redirect_domain_jobs SET state='leased',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND domain_id=j.domain_id RETURNING * INTO j;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.domain_id,'operation',j.operation,'lease',j.lease,'kind',kind,'zoneId',j.zone_id,'cnameTarget',j.cname_target,'hostname',d.hostname,'providerId',d.provider_id,'adoptId',j.adopt_id,'desired',j.desired));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.redirect_public_domain(p_hostname text, p_require_route boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d public.redirect_domains;j public.redirect_domain_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO d FROM public.redirect_domains WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'::uuid AND hostname=p_hostname FOR SHARE;
 IF d.id IS NULL OR d.disabled OR d.provider_id IS NULL OR d.ownership_state<>'verified' OR d.verified_until IS NULL OR d.verified_until<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.redirect_domain_jobs WHERE workspace_id=d.workspace_id AND domain_id=d.id FOR SHARE;
 IF j.domain_id IS NULL OR NOT j.desired OR j.state IN('failed','review','disconnected') OR j.provider_status IS DISTINCT FROM 'active' OR j.ssl_status IS DISTINCT FROM 'active' OR j.checked_at IS NULL OR j.checked_at<=clock_timestamp()-interval '15 minutes' THEN RETURN NULL;END IF;
 PERFORM 1 WHERE redirect_internal.workspace_owner(j.workspace_id,j.requested_by);
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_require_route AND (d.routing_protocol IS DISTINCT FROM 1 OR d.routing_provider_id IS DISTINCT FROM d.provider_id OR d.routing_seen_at IS NULL OR d.routing_seen_at<=clock_timestamp()-interval '24 hours') THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',d.id,'hostname',d.hostname,'rootUrl',d.root_url,'notFoundUrl',d.not_found_url,'expiredUrl',d.expired_url,'needsRouteRefresh',d.routing_protocol IS DISTINCT FROM 1 OR d.routing_provider_id IS DISTINCT FROM d.provider_id OR d.routing_seen_at IS NULL OR d.routing_seen_at<clock_timestamp()-interval '6 hours');
END $function$;

CREATE OR REPLACE FUNCTION redirect_internal.enqueue_workspace_webhook(p_workspace uuid, p_type text, p_redirect uuid, p_source text, p_data jsonb, p_only uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_event_id uuid:=gen_random_uuid();existing public.redirect_webhook_events;sub public.redirect_webhooks;payload text;source_data jsonb;at_time timestamptz:=now();
BEGIN
 IF p_workspace IS NULL THEN RAISE EXCEPTION 'Workspace identity required' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT FROM public.redirect_webhooks w WHERE w.workspace_id=p_workspace AND redirect_internal.workspace_owner(w.workspace_id,w.created_by) AND w.deleted_at IS NULL AND (w.enabled OR p_type='webhook.test') AND(p_only IS NULL OR w.id=p_only) AND(p_type='webhook.test' OR p_type=ANY(w.event_types)) AND(p_type='webhook.test' OR w.link_ids IS NULL OR p_redirect=ANY(w.link_ids))) THEN RETURN NULL;END IF;
 SELECT * INTO existing FROM public.redirect_webhook_events WHERE workspace_id=p_workspace AND source_key=p_source;
 IF existing.id IS NOT NULL THEN
  v_event_id:=existing.id;at_time:=existing.created_at;
  IF p_type NOT IN('link.created','link.updated','link.deleted') THEN RETURN v_event_id;END IF;
  UPDATE public.redirect_webhook_events SET data=p_data WHERE workspace_id=p_workspace AND id=v_event_id;
 ELSE INSERT INTO public.redirect_webhook_events(workspace_id,id,source_key,type,redirect_id,data) VALUES(p_workspace,v_event_id,p_source,p_type,p_redirect,p_data);END IF;
 FOR sub IN SELECT w.* FROM public.redirect_webhooks w WHERE w.workspace_id=p_workspace AND redirect_internal.workspace_owner(w.workspace_id,w.created_by) AND w.deleted_at IS NULL AND(w.enabled OR p_type='webhook.test') AND(p_only IS NULL OR w.id=p_only) AND(p_type='webhook.test' OR p_type=ANY(w.event_types)) AND(p_type='webhook.test' OR w.link_ids IS NULL OR p_redirect=ANY(w.link_ids)) ORDER BY w.id LOOP
  source_data:=CASE WHEN sub.include_customer_id THEN p_data ELSE p_data-'customerExternalId' END;
  payload:=jsonb_build_object('id',v_event_id,'type',p_type,'timestamp',at_time,'data',jsonb_strip_nulls(source_data))::text;
  INSERT INTO public.redirect_webhook_deliveries(workspace_id,webhook_id,event_id,routing_version,body) VALUES(p_workspace,sub.id,v_event_id,sub.routing_version,payload)
  ON CONFLICT(webhook_id,event_id) DO UPDATE SET body=EXCLUDED.body WHERE redirect_webhook_deliveries.workspace_id=p_workspace AND redirect_webhook_deliveries.state='queued' AND redirect_webhook_deliveries.attempts=0;
 END LOOP;
 RETURN v_event_id;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_redirect_webhook_deliveries(p_limit integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); w public.redirect_webhooks;d public.redirect_webhook_deliveries;result jsonb:='[]';at_time timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid dispatch batch' USING ERRCODE='22023';END IF;
 -- Recover bounded expired leases; a crashed sender is an unknown receipt, not success.
 FOR d IN SELECT * FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND state='leased' AND lease_until<=at_time ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.redirect_webhook_attempts SET finished_at=at_time,error_code='lease_expired' WHERE workspace_id=selected_workspace AND lease=d.lease AND finished_at IS NULL;
  UPDATE public.redirect_webhook_deliveries SET state=CASE WHEN cycle_attempts>=8 THEN 'failed' ELSE 'retry' END,lease=NULL,lease_until=NULL,next_attempt_at=at_time,error_code='lease_expired',finished_at=CASE WHEN cycle_attempts>=8 THEN at_time ELSE NULL END,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;
 END LOOP;
 FOR w IN SELECT s.* FROM public.redirect_webhooks s WHERE s.workspace_id=selected_workspace AND s.deleted_at IS NULL
  AND redirect_internal.workspace_owner(s.workspace_id,s.created_by)
  AND EXISTS(SELECT FROM public.redirect_webhook_deliveries q JOIN public.redirect_webhook_events e ON e.workspace_id=q.workspace_id AND e.id=q.event_id WHERE q.workspace_id=selected_workspace AND q.webhook_id=s.id AND q.state IN('queued','retry') AND q.next_attempt_at<=at_time AND(s.enabled OR e.type='webhook.test'))
  AND NOT EXISTS(SELECT FROM public.redirect_webhook_deliveries q WHERE q.workspace_id=selected_workspace AND q.webhook_id=s.id AND q.state='leased' AND q.lease_until>at_time)
  ORDER BY s.last_claimed_at,s.id LIMIT p_limit FOR UPDATE OF s SKIP LOCKED LOOP
  SELECT q.* INTO d FROM public.redirect_webhook_deliveries q JOIN public.redirect_webhook_events e ON e.workspace_id=q.workspace_id AND e.id=q.event_id
   WHERE q.workspace_id=selected_workspace AND q.webhook_id=w.id AND q.state IN('queued','retry') AND q.next_attempt_at<=at_time AND(w.enabled OR e.type='webhook.test') ORDER BY q.sequence LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
  IF d.id IS NULL THEN CONTINUE;END IF;
  IF d.routing_version<>w.routing_version THEN UPDATE public.redirect_webhook_deliveries SET state='cancelled',error_code='settings_changed',finished_at=at_time,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;CONTINUE;END IF;
  UPDATE public.redirect_webhook_deliveries SET state='leased',lease=gen_random_uuid(),lease_until=at_time+interval '2 minutes',attempts=attempts+1,cycle_attempts=cycle_attempts+1,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id RETURNING * INTO d;
  INSERT INTO public.redirect_webhook_attempts(workspace_id,delivery_id,number,lease) VALUES(selected_workspace,d.id,d.attempts,d.lease);
  UPDATE public.redirect_webhooks SET last_claimed_at=at_time WHERE workspace_id=selected_workspace AND id=w.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease',d.lease,'url',w.url));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.prepare_redirect_webhook_delivery(p_id uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); d public.redirect_webhook_deliveries;w public.redirect_webhooks;type text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO d FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND id=p_id AND lease=p_lease AND state='leased' AND lease_until>clock_timestamp();
 IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery lease changed' USING ERRCODE='P0002';END IF;
 SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=d.webhook_id;
 SELECT e.type INTO type FROM public.redirect_webhook_events e WHERE e.workspace_id=selected_workspace AND e.id=d.event_id;
 IF w.id IS NULL OR w.deleted_at IS NOT NULL OR(NOT w.enabled AND type<>'webhook.test') OR w.routing_version<>d.routing_version OR NOT redirect_internal.workspace_owner(w.workspace_id,w.created_by) THEN RAISE EXCEPTION 'Webhook access changed' USING ERRCODE='42501';END IF;
 UPDATE public.redirect_webhook_attempts SET key_version=w.key_version WHERE workspace_id=selected_workspace AND lease=p_lease AND finished_at IS NULL;
 RETURN jsonb_build_object('id',d.id,'eventId',d.event_id,'body',d.body,'url',w.url,'secret',w.secret,'keyVersion',w.key_version,'previousSecret',CASE WHEN w.previous_expires_at>clock_timestamp() THEN w.previous_secret ELSE NULL END,'previousKeyVersion',CASE WHEN w.previous_expires_at>clock_timestamp() THEN w.previous_key_version ELSE NULL END);
END $function$;

CREATE OR REPLACE FUNCTION public.finish_redirect_webhook_delivery(p_id uuid, p_lease uuid, p_status integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_excerpt text DEFAULT ''::text, p_duration integer DEFAULT NULL::integer, p_retry_after integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); d public.redirect_webhook_deliveries;w public.redirect_webhooks;success boolean;current_scope boolean;wait_seconds integer;at_time timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF(p_status IS NOT NULL AND p_status NOT BETWEEN 100 AND 599) OR p_duration IS NULL OR p_duration NOT BETWEEN 0 AND 60000 OR p_excerpt IS NULL OR octet_length(p_excerpt)>4096 OR(p_retry_after IS NOT NULL AND p_retry_after NOT BETWEEN 1 AND 86400) OR(p_error IS NOT NULL AND p_error NOT IN('dns_blocked','dns_unavailable','tls_error','network_error','timeout','invalid_response','http_error','scope_changed')) THEN RAISE EXCEPTION 'Invalid delivery receipt' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.redirect_webhook_deliveries WHERE workspace_id=selected_workspace AND id=p_id AND lease=p_lease AND state='leased' AND lease_until>at_time FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery lease changed' USING ERRCODE='P0002';END IF;
 SELECT * INTO w FROM public.redirect_webhooks WHERE workspace_id=selected_workspace AND id=d.webhook_id;
 current_scope:=w.id IS NOT NULL AND w.deleted_at IS NULL AND w.routing_version=d.routing_version AND(w.enabled OR EXISTS(SELECT FROM public.redirect_webhook_events WHERE workspace_id=selected_workspace AND id=d.event_id AND type='webhook.test')) AND redirect_internal.workspace_owner(w.workspace_id,w.created_by);
 success:=p_status BETWEEN 200 AND 299 AND p_error IS NULL;
 wait_seconds:=greatest(least(3600,30*(2^greatest(0,d.cycle_attempts-1))::integer),coalesce(p_retry_after,0));
 UPDATE public.redirect_webhook_attempts SET finished_at=at_time,http_status=p_status,error_code=p_error,response_excerpt=p_excerpt,duration_ms=p_duration WHERE workspace_id=selected_workspace AND lease=p_lease AND finished_at IS NULL;
 UPDATE public.redirect_webhook_deliveries SET state=CASE WHEN NOT current_scope THEN 'cancelled' WHEN success THEN 'delivered' WHEN cycle_attempts>=8 THEN 'failed' ELSE 'retry' END,
  http_status=p_status,error_code=CASE WHEN NOT current_scope THEN 'scope_changed' ELSE p_error END,response_excerpt=p_excerpt,next_attempt_at=at_time+make_interval(secs=>wait_seconds),finished_at=CASE WHEN NOT current_scope OR success OR cycle_attempts>=8 THEN at_time ELSE NULL END,lease=NULL,lease_until=NULL,version=gen_random_uuid() WHERE workspace_id=selected_workspace AND id=d.id;
 RETURN public.redirect_webhook_delivery_json(d.id);
END $function$;
