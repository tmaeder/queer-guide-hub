-- Receipt access is independent of sending configuration and active domain state.
CREATE FUNCTION public.redirect_domain_instruction_mail_latest(p_actor uuid,p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE latest uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM public.redirect_domain_actor(p_actor);
 IF NOT EXISTS(SELECT FROM public.redirect_domains WHERE id=p_domain) THEN RAISE EXCEPTION 'Domain not found' USING ERRCODE='P0002';END IF;
 SELECT id INTO latest FROM public.redirect_domain_instruction_mail WHERE domain_id=p_domain AND actor_id=p_actor ORDER BY created_at DESC,id DESC LIMIT 1;
 RETURN public.redirect_domain_instruction_mail_json(latest);
END $$;
REVOKE ALL ON FUNCTION public.redirect_domain_instruction_mail_latest(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redirect_domain_instruction_mail_latest(uuid,uuid) TO service_role;
