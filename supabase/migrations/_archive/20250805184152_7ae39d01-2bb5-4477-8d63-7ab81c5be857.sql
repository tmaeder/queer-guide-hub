-- CRITICAL SECURITY FIXES

-- 1. Fix function search paths for all security-sensitive functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.assign_user_role(target_user_id uuid, new_role app_role, action_type text DEFAULT 'assign'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_admin BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT public.has_role(current_user_id, 'admin') INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can manage user roles';
  END IF;
  
  -- Prevent users from removing their own admin role (safety check)
  IF current_user_id = target_user_id AND new_role != 'admin' AND action_type = 'assign' THEN
    RAISE EXCEPTION 'Cannot remove your own admin privileges';
  END IF;
  
  -- Rate limiting check
  IF NOT public.check_rate_limit(current_user_id::text, 10, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded for role operations';
  END IF;
  
  -- Perform the action
  IF action_type = 'assign' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, new_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF action_type = 'remove' THEN
    DELETE FROM public.user_roles 
    WHERE user_id = target_user_id AND role = new_role;
  END IF;
  
  -- Enhanced audit logging
  INSERT INTO public.user_role_audit_log (
    admin_user_id,
    target_user_id,
    role_changed,
    action_type,
    timestamp
  ) VALUES (
    current_user_id,
    target_user_id,
    new_role,
    action_type,
    NOW()
  );
  
  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'ROLE_MANAGEMENT',
    current_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'role', new_role,
      'action', action_type,
      'timestamp', now()
    ),
    'high'
  );
  
  RETURN TRUE;
END;
$$;

-- 2. Enhanced role escalation prevention
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Prevent users from assigning roles to themselves unless they're already admin
  IF NEW.user_id = auth.uid() AND NEW.role IN ('admin', 'moderator') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Cannot assign elevated roles to yourself';
    END IF;
  END IF;
  
  -- Log all role assignment attempts
  PERFORM public.log_enhanced_security_event(
    'ROLE_ASSIGNMENT_ATTEMPT',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', NEW.user_id,
      'role', NEW.role,
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.user_roles;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. Enhanced input validation function
CREATE OR REPLACE FUNCTION public.validate_user_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Content length validation
  IF NEW.content IS NOT NULL THEN
    IF length(NEW.content) > 10000 THEN
      RAISE EXCEPTION 'Content exceeds maximum length of 10000 characters';
    END IF;
    
    -- Basic XSS pattern detection
    IF NEW.content ~* '<script|javascript:|data:|vbscript:|on\w+=' THEN
      PERFORM public.log_enhanced_security_event(
        'XSS_ATTEMPT_DETECTED',
        auth.uid(),
        jsonb_build_object(
          'content_preview', left(NEW.content, 100),
          'table', TG_TABLE_NAME,
          'timestamp', now()
        ),
        'high'
      );
      RAISE EXCEPTION 'Potentially malicious content detected';
    END IF;
    
    -- Rate limiting for content creation
    IF NOT public.check_rate_limit(auth.uid()::text, 20, 60) THEN
      RAISE EXCEPTION 'Rate limit exceeded for content creation';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply content validation to relevant tables
DROP TRIGGER IF EXISTS validate_community_posts_content ON public.community_posts;
CREATE TRIGGER validate_community_posts_content
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_content();

DROP TRIGGER IF EXISTS validate_group_posts_content ON public.group_posts;
CREATE TRIGGER validate_group_posts_content
  BEFORE INSERT OR UPDATE ON public.group_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_content();

-- 4. Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_rate_limit(identifier text, max_attempts integer DEFAULT 5, time_window_minutes integer DEFAULT 15)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(SUM(attempt_count), 0) INTO attempt_count
  FROM public.auth_rate_limit
  WHERE ip_address = identifier::INET
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit (ip_address, attempt_count)
  VALUES (identifier::INET, 1)
  ON CONFLICT (ip_address) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- 5. Secure user profile validation
CREATE OR REPLACE FUNCTION public.validate_profile_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Validate email format if provided
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format: %', NEW.email;
  END IF;
  
  -- Validate display name length and content
  IF NEW.display_name IS NOT NULL THEN
    IF length(NEW.display_name) > 100 THEN
      RAISE EXCEPTION 'Display name too long: maximum 100 characters';
    END IF;
    
    -- Check for potentially malicious content
    IF NEW.display_name ~* '<script|javascript:|data:' THEN
      RAISE EXCEPTION 'Invalid characters in display name';
    END IF;
  END IF;
  
  -- Log profile updates for audit
  IF TG_OP = 'UPDATE' AND OLD.* IS DISTINCT FROM NEW.* THEN
    PERFORM public.log_enhanced_security_event(
      'PROFILE_UPDATED',
      NEW.user_id,
      jsonb_build_object(
        'changed_fields', (
          SELECT jsonb_object_agg(key, value)
          FROM jsonb_each_text(to_jsonb(NEW))
          WHERE key NOT IN ('updated_at', 'created_at')
          AND value IS DISTINCT FROM (to_jsonb(OLD) ->> key)
        ),
        'timestamp', now()
      ),
      'info'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply profile validation trigger
DROP TRIGGER IF EXISTS validate_profile_trigger ON public.profiles;
CREATE TRIGGER validate_profile_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_data();