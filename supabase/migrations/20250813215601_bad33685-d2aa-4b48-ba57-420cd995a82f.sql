-- Fix Security Definer View Issue
-- Drop the existing security definer view
DROP VIEW IF EXISTS public.venue_checkin_stats;

-- Recreate the view without SECURITY DEFINER to respect RLS
CREATE VIEW public.venue_checkin_stats AS
SELECT 
  venue_id,
  COUNT(*)::integer as total_checkins,
  COUNT(DISTINCT DATE(created_at))::integer as days_with_checkins,
  MAX(created_at) as last_checkin,
  -- Anonymized activity levels instead of exact counts
  CASE 
    WHEN COUNT(*) = 0 THEN 'none'
    WHEN COUNT(*) <= 3 THEN 'low'
    WHEN COUNT(*) <= 10 THEN 'medium'
    WHEN COUNT(*) <= 25 THEN 'high'
    ELSE 'very_high'
  END as activity_level
FROM public.venue_checkins
GROUP BY venue_id;

-- Grant proper access to the view
GRANT SELECT ON public.venue_checkin_stats TO authenticated;

-- Add comprehensive input validation and security functions
CREATE OR REPLACE FUNCTION public.validate_content_security(content text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Length validation
  IF content IS NULL OR length(content) > 10000 THEN
    RETURN false;
  END IF;
  
  -- Enhanced XSS pattern detection
  IF content ~* '<script[^>]*>|javascript:|data:[^,]*base64|vbscript:|on(load|error|click|mouse|key)\s*=' THEN
    RETURN false;
  END IF;
  
  -- SQL injection pattern detection
  IF content ~* '(union\s+select|insert\s+into|delete\s+from|drop\s+table|exec\s*\(|execute\s*\(|\bor\s+1\s*=\s*1\b)' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text, 
  max_attempts integer DEFAULT 5, 
  time_window_minutes integer DEFAULT 15,
  action_type text DEFAULT 'general'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  rate_limit_key TEXT;
BEGIN
  rate_limit_key := identifier || ':' || action_type;
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts for this specific action
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = rate_limit_key
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Log security event for rate limit exceeded
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'action_type', action_type,
        'attempts', attempt_count,
        'max_attempts', max_attempts,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count)
  VALUES (rate_limit_key, 1)
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Secure user data validation trigger
CREATE OR REPLACE FUNCTION public.validate_user_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate content fields
  IF NEW.content IS NOT NULL THEN
    IF NOT public.validate_content_security(NEW.content) THEN
      RAISE EXCEPTION 'Invalid content detected - security violation';
    END IF;
    
    -- Rate limiting for content creation
    IF NOT public.check_rate_limit_enhanced(
      coalesce(auth.uid()::text, 'anonymous'), 
      20, 
      60, 
      'content_creation'
    ) THEN
      RAISE EXCEPTION 'Rate limit exceeded for content creation';
    END IF;
  END IF;
  
  -- Validate other text fields that might exist
  IF NEW.title IS NOT NULL THEN
    IF NOT public.validate_content_security(NEW.title) THEN
      RAISE EXCEPTION 'Invalid title detected - security violation';
    END IF;
  END IF;
  
  IF NEW.description IS NOT NULL THEN
    IF NOT public.validate_content_security(NEW.description) THEN
      RAISE EXCEPTION 'Invalid description detected - security violation';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply validation triggers to critical tables
DROP TRIGGER IF EXISTS validate_content_security_trigger ON public.community_posts;
CREATE TRIGGER validate_content_security_trigger
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_input();

DROP TRIGGER IF EXISTS validate_events_security_trigger ON public.events;
CREATE TRIGGER validate_events_security_trigger
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_input();

-- Enhanced admin role assignment security
CREATE OR REPLACE FUNCTION public.secure_assign_user_role(p_target_user_id uuid, p_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_user_id UUID;
  v_target_email TEXT;
  v_admin_email TEXT;
BEGIN
  -- Get the current user ID
  v_admin_user_id := auth.uid();
  
  -- Rate limiting for role assignments
  IF NOT public.check_rate_limit_enhanced(
    v_admin_user_id::text, 
    5, 
    60, 
    'role_assignment'
  ) THEN
    RAISE EXCEPTION 'Rate limit exceeded for role assignments';
  END IF;
  
  -- Verify admin has permission to assign roles
  IF NOT has_role(v_admin_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Insufficient privileges to assign roles';
  END IF;
  
  -- Prevent self-privilege escalation for admin role
  IF p_role = 'admin'::app_role AND v_admin_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot assign admin role to yourself';
  END IF;
  
  -- Additional security: Prevent admin role assignment to external emails
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_user_id;
  
  IF p_role = 'admin'::app_role AND NOT (
    v_target_email LIKE '%@queer.guide' OR 
    v_target_email LIKE '%@queercultured.com'
  ) THEN
    -- Log suspicious admin assignment attempt
    PERFORM public.log_enhanced_security_event(
      'SUSPICIOUS_ADMIN_ASSIGNMENT_BLOCKED',
      v_admin_user_id,
      jsonb_build_object(
        'target_user_id', p_target_user_id,
        'target_email', v_target_email,
        'admin_email', v_admin_email,
        'timestamp', now()
      ),
      'critical'
    );
    RAISE EXCEPTION 'Admin role can only be assigned to verified organization members';
  END IF;
  
  -- Insert or update the role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Enhanced audit logging
  INSERT INTO public.user_role_audit_log (admin_user_id, target_user_id, action, role_name, metadata)
  VALUES (
    v_admin_user_id, 
    p_target_user_id, 
    'assign', 
    p_role,
    jsonb_build_object(
      'timestamp', now(),
      'admin_display_name', (SELECT display_name FROM public.profiles WHERE user_id = v_admin_user_id),
      'target_display_name', (SELECT display_name FROM public.profiles WHERE user_id = p_target_user_id),
      'admin_email', v_admin_email,
      'target_email', v_target_email,
      'security_level', 'enhanced'
    )
  );
  
  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'ROLE_ASSIGNED_SECURE',
    v_admin_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'role_assigned', p_role,
      'target_email', v_target_email,
      'timestamp', now()
    ),
    'high'
  );
END;
$$;