-- Explicit internal discovery; public dashboard snapshots remain independent.
ALTER TABLE public.redirect_saved_reports ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN('private','team'));
CREATE INDEX redirect_reports_team_idx ON public.redirect_saved_reports(id) WHERE visibility='team';
CREATE OR REPLACE FUNCTION public.redirect_saved_report_resource(p_action text,p_actor uuid,p_principal uuid,p_id uuid DEFAULT NULL,p_values jsonb DEFAULT '{}',p_limit integer DEFAULT 50,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.redirect_saved_reports;result jsonb;allowed uuid[];view_mode text;can_publish boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('list','get','create','patch','delete','run') THEN RAISE EXCEPTION 'Invalid report action' USING ERRCODE='22023';END IF;
 PERFORM public.redirect_report_actor(p_actor,p_principal,p_action IN('create','patch','delete'));
 can_publish:=EXISTS(SELECT FROM public.user_roles WHERE user_id=p_actor AND role='admin');
 IF p_action='list' THEN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid report page' USING ERRCODE='22023';END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['view']::text[]<>'{}' OR p_values?'view' AND(jsonb_typeof(p_values->'view')<>'string' OR coalesce(p_values->>'view','') NOT IN('personal','team','all')) THEN RAISE EXCEPTION 'Invalid report view' USING ERRCODE='22023';END IF;
  view_mode:=coalesce(p_values->>'view','personal');
  WITH all_rows AS MATERIALIZED(SELECT * FROM public.redirect_saved_reports WHERE(view_mode IN('personal','all') AND owner_user_id=p_actor) OR(view_mode IN('team','all') AND visibility='team' AND EXISTS(SELECT FROM public.user_roles WHERE user_id=owner_user_id AND role='admin'))),
  page AS MATERIALIZED(SELECT * FROM all_rows WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('data',coalesce(jsonb_agg((CASE WHEN owner_user_id=p_actor THEN to_jsonb(shown) ELSE to_jsonb(shown)-'owner_user_id' END)||jsonb_build_object('canEdit',owner_user_id=p_actor) ORDER BY id),'[]'::jsonb),'canPublishToTeam',can_publish,'count',(SELECT count(*) FROM all_rows),'nextCursor',CASE WHEN(SELECT count(*) FROM page)>p_limit THEN max(id::text) ELSE NULL END) INTO result FROM shown;
  RETURN result;
 END IF;
 IF p_action<>'create' THEN
  SELECT * INTO r FROM public.redirect_saved_reports WHERE id=p_id AND(owner_user_id=p_actor OR(p_action IN('get','run') AND visibility='team' AND EXISTS(SELECT FROM public.user_roles WHERE user_id=owner_user_id AND role='admin')));
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002';END IF;
 END IF;
 IF p_action='get' THEN RETURN(CASE WHEN r.owner_user_id=p_actor THEN to_jsonb(r) ELSE to_jsonb(r)-'owner_user_id' END)||jsonb_build_object('canEdit',r.owner_user_id=p_actor);END IF;
 IF p_action='run' THEN allowed:=public.redirect_management_scope(p_principal,'events:read');RETURN public.redirect_analytics_report(r.filters,allowed);END IF;
 IF p_action='delete' THEN DELETE FROM public.redirect_saved_reports WHERE id=r.id;RETURN jsonb_build_object('id',r.id,'deleted',true);END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_values-ARRAY['name','filters','version','visibility']::text[]<>'{}' THEN RAISE EXCEPTION 'Invalid report fields' USING ERRCODE='22023';END IF;
 IF p_action='patch' AND (p_values->>'version')::uuid IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Report changed; reload before saving' USING ERRCODE='23505';END IF;
 IF p_values?'visibility' AND(jsonb_typeof(p_values->'visibility')<>'string' OR coalesce(p_values->>'visibility','') NOT IN('private','team')) THEN RAISE EXCEPTION 'Invalid report visibility' USING ERRCODE='22023';END IF;
 IF coalesce(p_values->>'visibility',r.visibility,'private')='team' AND NOT can_publish THEN RAISE EXCEPTION 'Workspace owner required to publish a team report' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  INSERT INTO public.redirect_saved_reports(owner_user_id,name,filters,visibility) VALUES(p_actor,btrim(p_values->>'name'),p_values->'filters',coalesce(p_values->>'visibility','private')) RETURNING * INTO r;
 ELSE
  UPDATE public.redirect_saved_reports SET visibility=coalesce(p_values->>'visibility',visibility),name=CASE WHEN p_values?'name' THEN btrim(p_values->>'name') ELSE name END,filters=CASE WHEN p_values?'filters' THEN p_values->'filters' ELSE filters END,version=gen_random_uuid(),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 END IF;
 -- Validate SQL filter semantics without exposing any unscoped data.
 PERFORM public.redirect_analytics_report(r.filters,ARRAY[]::uuid[]);
 RETURN to_jsonb(r)||jsonb_build_object('canEdit',true);
END $$;
