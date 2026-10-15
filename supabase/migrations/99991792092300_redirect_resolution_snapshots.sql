-- A resolver must select the link, protection and routing version from one
-- database snapshot. Password verification happens outside the transaction; the
-- visit writer then locks link -> policy and rejects a changed routing version.
-- This is also the prerequisite for single-visit deferred native handoffs.
CREATE FUNCTION public.redirect_resolution_fingerprint(p_link public.redirects,p_policy jsonb,p_password_hash jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'id',p_link.id,'type',p_link.type,'slug',p_link.slug,'domainId',p_link.domain_id,
  'hostname',p_link.domain_hostname,'root',p_link.is_domain_root,'target',p_link.target,
  'status',p_link.status_code,'enabled',p_link.is_enabled,'start',extract(epoch FROM p_link.start_at),
  'end',extract(epoch FROM p_link.end_at),'queryMode',p_link.query_mode,'queryOverride',p_link.query_override,
  'utmDefaults',p_link.utm_defaults,'clickLimit',p_link.click_limit,
  'policy',coalesce(p_policy,'{}'::jsonb),'password',p_password_hash
 )::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION public.redirect_resolution_fingerprint(public.redirects,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_resolution_fingerprint(public.redirects,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.redirect_resolution_snapshot(p_hostname text,p_slug text,p_root boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE domain uuid; result jsonb; readiness jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 IF p_hostname IS NULL OR length(p_hostname)>239 OR p_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' OR p_root IS NULL OR NOT p_root AND (p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$') THEN RAISE EXCEPTION 'Invalid resolution source' USING ERRCODE='22023';END IF;
 IF p_hostname NOT IN('queer.guide','www.queer.guide') THEN
  readiness:=public.redirect_public_domain(p_hostname);
  IF readiness IS NULL THEN RETURN NULL;END IF;
  domain:=(readiness->>'id')::uuid;
 ELSIF p_root THEN RETURN NULL;
 END IF;
 -- One SELECT / MVCC snapshot: never pair a previously loaded link with a newer
 -- policy or calculate a new fingerprint for stale destination/password inputs.
 SELECT jsonb_build_object('link',to_jsonb(r),'settings',jsonb_build_object('policy',coalesce(p.policy,'{}'::jsonb),'password_hash',p.password_hash),
  'fingerprint',public.redirect_resolution_fingerprint(r,p.policy,p.password_hash)) INTO result
 FROM public.redirects r LEFT JOIN public.redirect_link_policies p ON p.redirect_id=r.id
 WHERE r.type='SHORT' AND r.domain_id IS NOT DISTINCT FROM domain AND r.is_domain_root=p_root AND (p_root OR r.slug=p_slug);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redirect_resolution_snapshot(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_resolution_snapshot(text,text,boolean) TO service_role;

CREATE FUNCTION public.record_redirect_snapshot_visit(p_snapshot text,p_redirect_id uuid,p_path text,p_query text,p_referer text,p_user_agent text,p_country text,p_ip_hash text,p_status integer,p_variant_id text,p_destination text,p_metadata jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE link public.redirects; settings public.redirect_link_policies;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_snapshot IS NULL OR p_snapshot !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid resolution snapshot' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO link FROM public.redirects WHERE id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE redirect_id=link.id FOR SHARE;
 IF p_snapshot<>public.redirect_resolution_fingerprint(link,settings.policy,settings.password_hash) THEN RETURN NULL;END IF;
 IF p_path IS DISTINCT FROM (CASE WHEN link.is_domain_root THEN '/' WHEN link.domain_id IS NULL THEN '/go/'||link.slug ELSE '/'||link.slug END) THEN RETURN NULL;END IF;
 -- Namespace/readiness, enabled/start/end and quota are checked again by the
 -- original writer while these locks remain held. No extra event or quota path.
 RETURN public.record_redirect_visit(p_redirect_id,p_path,p_query,p_referer,p_user_agent,p_country,p_ip_hash,p_status,p_variant_id,p_destination,p_metadata);
END $$;
REVOKE ALL ON FUNCTION public.record_redirect_snapshot_visit(text,uuid,text,text,text,text,text,text,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_redirect_snapshot_visit(text,uuid,text,text,text,text,text,text,integer,text,text,jsonb) TO service_role;
