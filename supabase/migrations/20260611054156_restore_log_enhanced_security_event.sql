-- Restore public.log_enhanced_security_event(text, uuid, jsonb, text).
--
-- The function predates the migration baseline and was dropped on prod at some
-- point, but four live SECURITY DEFINER functions still PERFORM it:
--   audit_admin_data_access, check_rate_limit_enhanced,
--   secure_passkey_access, validate_privacy_settings (BEFORE trigger on profiles)
-- Result: any profile UPDATE that changed privacy_settings raised 42883
-- ("function does not exist") and the whole save failed with a PostgREST 404.
--
-- Recreated as an exception-safe sink into security_events: audit logging must
-- never break the user-facing write it is attached to.

CREATE OR REPLACE FUNCTION public.log_enhanced_security_event(
  p_event_type text,
  p_user_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'low'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.security_events (user_id, event_type, details, metadata)
  VALUES (
    p_user_id,
    p_event_type,
    COALESCE(p_details, '{}'::jsonb),
    jsonb_build_object('severity', COALESCE(p_severity, 'low'))
  );
EXCEPTION WHEN OTHERS THEN
  -- Logging is best-effort; never propagate into the caller's transaction path.
  NULL;
END;
$$;

-- Lint-0029 posture: callers are SECURITY DEFINER (run as owner); no direct
-- client execution needed.
REVOKE EXECUTE ON FUNCTION public.log_enhanced_security_event(text, uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_enhanced_security_event(text, uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_enhanced_security_event(text, uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_enhanced_security_event(text, uuid, jsonb, text) TO service_role;
