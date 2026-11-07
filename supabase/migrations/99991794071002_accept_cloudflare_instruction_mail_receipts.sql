-- Preserve the original Message-ID so Cloudflare delivery events can be correlated.
CREATE OR REPLACE FUNCTION public.finish_redirect_domain_instruction_mail(p_id uuid, p_lease uuid, p_outcome text, p_provider_id text DEFAULT NULL::text, p_retry_after integer DEFAULT NULL::integer, p_retry boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE selected_workspace uuid:=public.redirect_request_workspace(); m public.redirect_domain_instruction_mail;unknown boolean;next_state text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.redirect_domain_instruction_mail WHERE workspace_id=selected_workspace AND id=p_id AND state='leased' AND lease_id=p_lease AND send_started_at IS NOT NULL FOR UPDATE;
 IF m.id IS NULL THEN RETURN false;END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN('sent','retry','rejected','unknown') OR p_retry IS NULL OR (p_outcome='sent' AND(p_provider_id IS NULL OR length(p_provider_id)>200 OR p_provider_id !~ '^([A-Za-z0-9_-]+|<[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+>)$')) OR(p_outcome<>'sent' AND p_provider_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid instruction mail outcome' USING ERRCODE='22023';END IF;
 unknown:=m.ambiguous OR p_outcome='unknown';
 next_state:=CASE WHEN p_outcome='sent' THEN 'sent' WHEN p_outcome IN('retry','unknown') AND p_retry AND m.attempts<8 AND m.created_at>clock_timestamp()-interval '23 hours' THEN 'queued' WHEN unknown THEN 'uncertain' ELSE 'failed' END;
 UPDATE public.redirect_domain_instruction_mail SET state=next_state,ambiguous=CASE WHEN p_outcome='sent' THEN false ELSE unknown END,provider_id=p_provider_id,sent_at=CASE WHEN p_outcome='sent' THEN clock_timestamp() END,
  next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(least(3600,30*(2^greatest(0,attempts-1))::integer),least(82800,greatest(0,coalesce(p_retry_after,0))))),
  last_error=CASE WHEN p_outcome='sent' THEN NULL WHEN next_state='uncertain' THEN 'Delivery is uncertain; automatic retry stopped' WHEN p_outcome='unknown' THEN 'Email outcome unknown; retrying the same request' WHEN p_outcome='retry' THEN 'Email provider asked us to retry' ELSE 'Email provider rejected the request' END,
  lease_id=NULL,lease_until=NULL,send_started_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=selected_workspace AND id=m.id;
 RETURN true;
END $function$;
