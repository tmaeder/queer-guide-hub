-- Private deferred-link transaction primitives. Existing bindings remain opted
-- out; no public transport/store handoff is enabled by this schema migration.
ALTER TABLE public.redirect_native_apps ADD COLUMN handoff_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.redirect_native_handoff_receipts (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 redirect_id uuid NOT NULL REFERENCES public.redirects(id) ON DELETE CASCADE,
 click_id uuid NOT NULL UNIQUE REFERENCES public.redirect_events(click_id) ON DELETE CASCADE,
 app_binding uuid NOT NULL REFERENCES public.redirect_native_apps(id) ON DELETE CASCADE,
 app_revision uuid NOT NULL,
 routing_fingerprint text NOT NULL CHECK(routing_fingerprint ~ '^[a-f0-9]{64}$'),
 hostname text NOT NULL CHECK(length(hostname) BETWEEN 1 AND 239),
 path text NOT NULL CHECK(length(path) BETWEEN 1 AND 256),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE INDEX redirect_native_handoff_expiry ON public.redirect_native_handoff_receipts(expires_at);
ALTER TABLE public.redirect_native_handoff_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_native_handoff_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.redirect_native_handoff_receipts TO service_role;

CREATE FUNCTION public.redirect_native_handoff_app(p_app uuid,p_hostname text,p_path text)
RETURNS public.redirect_native_apps LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE app public.redirect_native_apps;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO app FROM public.redirect_native_apps a WHERE a.id=p_app AND a.enabled AND a.handoff_enabled
 AND EXISTS(SELECT FROM public.user_roles WHERE user_id=a.created_by AND role='admin')
 AND (a.domain_id IS NULL AND p_hostname IN('queer.guide','www.queer.guide') OR a.domain_id IS NOT NULL AND EXISTS(SELECT FROM public.redirect_domains WHERE id=a.domain_id AND hostname=p_hostname))
 AND EXISTS(SELECT FROM unnest(a.paths) pattern WHERE pattern=p_path OR right(pattern,1)='*' AND left(p_path,length(pattern)-1)=left(pattern,length(pattern)-1));
 IF app.id IS NOT NULL AND app.domain_id IS NOT NULL AND public.redirect_public_domain(p_hostname) IS NULL THEN RETURN NULL;END IF;
 RETURN app;
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_handoff_app(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_handoff_app(uuid,text,text) TO service_role;

CREATE FUNCTION public.create_redirect_native_handoff(p_token_hash text,p_app uuid,p_consent boolean,p_snapshot text,p_redirect_id uuid,p_path text,p_query text,p_referer text,p_user_agent text,p_country text,p_ip_hash text,p_status integer,p_variant_id text,p_destination text,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE app public.redirect_native_apps; link public.redirects; settings public.redirect_link_policies; click uuid; expires timestamptz; started timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid handoff digest' USING ERRCODE='22023';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT * INTO link FROM public.redirects WHERE id=p_redirect_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE redirect_id=link.id FOR SHARE;
 IF settings.policy->'track_conversions' IS DISTINCT FROM 'true'::jsonb OR settings.policy->'cloaked'='true'::jsonb THEN RETURN NULL;END IF;
 app:=public.redirect_native_handoff_app(p_app,p_metadata->>'domain',p_path);
 IF app.id IS NULL OR app.domain_id IS DISTINCT FROM link.domain_id THEN RETURN NULL;END IF;
 expires:=least(started+interval '24 hours',coalesce(link.end_at,'infinity'::timestamptz),coalesce((settings.policy->>'expires_at')::timestamptz,'infinity'::timestamptz));
 IF settings.policy?'experiment' AND NOT settings.policy->'experiment'?'completed_target' THEN expires:=least(expires,(settings.policy->'experiment'->>'ends_at')::timestamptz);END IF;
 IF expires<=started THEN RETURN NULL;END IF;
 click:=public.record_redirect_snapshot_visit(p_snapshot,p_redirect_id,p_path,p_query,p_referer,p_user_agent,p_country,p_ip_hash,p_status,p_variant_id,p_destination,p_metadata);
 IF click IS NULL THEN RETURN NULL;END IF;
 -- This insert is in the visit transaction. A digest collision/error rolls the
 -- reserved counter/event back; an existing public click ID cannot mint a token.
 INSERT INTO public.redirect_native_handoff_receipts(token_hash,redirect_id,click_id,app_binding,app_revision,routing_fingerprint,hostname,path,created_at,expires_at)
 VALUES(p_token_hash,link.id,click,app.id,app.revision,p_snapshot,p_metadata->>'domain',p_path,started,expires);
 RETURN jsonb_build_object('clickId',click,'expiresAt',expires);
END $$;
REVOKE ALL ON FUNCTION public.create_redirect_native_handoff(text,uuid,boolean,text,uuid,text,text,text,text,text,text,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_redirect_native_handoff(text,uuid,boolean,text,uuid,text,text,text,text,text,text,integer,text,text,jsonb) TO service_role;

CREATE FUNCTION public.redirect_native_handoff_context(p_token_hash text,p_app uuid,p_hostname text,p_path text,p_consent boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE app public.redirect_native_apps; context jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 app:=public.redirect_native_handoff_app(p_app,p_hostname,p_path);
 IF app.id IS NULL THEN RETURN NULL;END IF;
 -- A single SELECT returns the live password/policy and its own fingerprint.
 -- The public resolver must verify the password and re-run its shared selector
 -- with this event query/variant before calling the final locked consumer.
 SELECT jsonb_build_object('link',to_jsonb(r),'settings',jsonb_build_object('policy',p.policy,'password_hash',p.password_hash),
  'fingerprint',h.routing_fingerprint,'query',e.query,'variantId',e.variant_id,'destination',e.destination_url,'clickId',h.click_id,'expiresAt',h.expires_at)
 INTO context FROM public.redirect_native_handoff_receipts h
 JOIN public.redirects r ON r.id=h.redirect_id
 JOIN public.redirect_link_policies p ON p.redirect_id=r.id
 JOIN public.redirect_events e ON e.click_id=h.click_id AND e.redirect_id=r.id
 WHERE h.token_hash=p_token_hash AND h.app_binding=app.id AND h.app_revision=app.revision AND h.hostname=p_hostname AND h.path=p_path
 AND h.consumed_at IS NULL AND h.expires_at>clock_timestamp() AND r.is_enabled AND (r.start_at IS NULL OR r.start_at<=clock_timestamp()) AND (r.end_at IS NULL OR r.end_at>clock_timestamp())
 AND h.routing_fingerprint=public.redirect_resolution_fingerprint(r,p.policy,p.password_hash);
 RETURN context;
END $$;
REVOKE ALL ON FUNCTION public.redirect_native_handoff_context(text,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_native_handoff_context(text,uuid,text,text,boolean) TO service_role;

CREATE FUNCTION public.consume_redirect_native_handoff(p_token_hash text,p_app uuid,p_hostname text,p_path text,p_consent boolean,p_snapshot text,p_destination text,p_variant_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE link_id uuid; link public.redirects; settings public.redirect_link_policies; receipt public.redirect_native_handoff_receipts; app public.redirect_native_apps; event public.redirect_events;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock_shared(471983093);
 SELECT redirect_id INTO link_id FROM public.redirect_native_handoff_receipts WHERE token_hash=p_token_hash;
 IF link_id IS NULL THEN RETURN NULL;END IF;
 -- Same writer lock order; the receipt lock is last. Replays serialize here.
 SELECT * INTO link FROM public.redirects WHERE id=link_id AND type='SHORT' FOR UPDATE;
 IF link.id IS NULL OR NOT link.is_enabled OR link.start_at>clock_timestamp() OR link.end_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO settings FROM public.redirect_link_policies WHERE redirect_id=link.id FOR SHARE;
 IF p_snapshot IS NULL OR p_snapshot IS DISTINCT FROM public.redirect_resolution_fingerprint(link,settings.policy,settings.password_hash) THEN RETURN NULL;END IF;
 app:=public.redirect_native_handoff_app(p_app,p_hostname,p_path);
 IF app.id IS NULL OR app.domain_id IS DISTINCT FROM link.domain_id THEN RETURN NULL;END IF;
 SELECT * INTO receipt FROM public.redirect_native_handoff_receipts WHERE token_hash=p_token_hash FOR UPDATE;
 IF receipt.token_hash IS NULL OR receipt.consumed_at IS NOT NULL OR receipt.expires_at<=clock_timestamp()
 OR receipt.redirect_id<>link.id OR receipt.app_binding<>app.id OR receipt.app_revision<>app.revision OR receipt.hostname IS DISTINCT FROM p_hostname OR receipt.path IS DISTINCT FROM p_path OR receipt.routing_fingerprint<>p_snapshot THEN RETURN NULL;END IF;
 SELECT * INTO event FROM public.redirect_events WHERE click_id=receipt.click_id AND redirect_id=link.id;
 IF event.click_id IS NULL OR event.destination_url IS DISTINCT FROM p_destination OR event.variant_id IS DISTINCT FROM p_variant_id THEN RETURN NULL;END IF;
 UPDATE public.redirect_native_handoff_receipts SET consumed_at=clock_timestamp() WHERE token_hash=p_token_hash;
 -- The original visit already reserved its quota; do not increment or insert.
 RETURN receipt.click_id;
END $$;
REVOKE ALL ON FUNCTION public.consume_redirect_native_handoff(text,uuid,text,text,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_redirect_native_handoff(text,uuid,text,text,boolean,text,text,text) TO service_role;

CREATE FUNCTION public.cleanup_redirect_native_handoffs(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE removed integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid cleanup bound' USING ERRCODE='22023';END IF;
 DELETE FROM public.redirect_native_handoff_receipts WHERE token_hash IN(SELECT token_hash FROM public.redirect_native_handoff_receipts WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_redirect_native_handoffs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_redirect_native_handoffs(integer) TO service_role;
