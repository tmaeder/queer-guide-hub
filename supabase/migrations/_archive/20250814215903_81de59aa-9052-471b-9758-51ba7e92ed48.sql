-- Fix security issues by dropping and recreating functions with proper search_path
-- This addresses "Function Search Path Mutable" warnings

-- Drop existing functions that need to be recreated with proper search path
DROP FUNCTION IF EXISTS public.is_group_member_or_admin(uuid, boolean);
DROP FUNCTION IF EXISTS public.is_conversation_participant(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.check_rate_limit_key(text, integer, integer);
DROP FUNCTION IF EXISTS public.assign_admin_by_id(uuid);
DROP FUNCTION IF EXISTS public.assign_first_admin(text);

-- Drop problematic views if they exist
DROP VIEW IF EXISTS public.secure_passkey_summary CASCADE;
DROP VIEW IF EXISTS public.secure_session_summary CASCADE;

-- Recreate critical security functions with proper search_path

-- User role checking (critical for security)
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

-- Group membership checking
CREATE FUNCTION public.is_group_member_or_admin(group_id_param uuid, require_admin boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_role text;
BEGIN
  -- Get user's role in the group
  SELECT role INTO user_role
  FROM public.group_memberships
  WHERE group_id = group_id_param 
    AND user_id = auth.uid();
  
  -- If no membership found, return false
  IF user_role IS NULL THEN
    RETURN false;
  END IF;
  
  -- If admin required, check for admin or moderator role
  IF require_admin THEN
    RETURN user_role IN ('admin', 'moderator');
  END IF;
  
  -- Any membership is sufficient
  RETURN true;
END;
$$;

-- Conversation participant checking
CREATE FUNCTION public.is_conversation_participant(conversation_id_param uuid, user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conversation_id_param 
      AND user_id = user_id_param
  );
END;
$$;

-- Rate limiting function
CREATE FUNCTION public.check_rate_limit_key(identifier text, max_attempts integer DEFAULT 5, time_window_minutes integer DEFAULT 15)
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
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = identifier
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
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count)
  VALUES (identifier, 1)
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Admin assignment functions
CREATE FUNCTION public.assign_admin_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Only allow existing admins to assign admin roles
  IF NOT public.has_role(current_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can assign admin roles';
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log the action
  PERFORM public.log_enhanced_security_event(
    'ADMIN_ROLE_ASSIGNED',
    current_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'timestamp', now()
    ),
    'high'
  );
END;
$$;

CREATE FUNCTION public.assign_first_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  target_user_id uuid;
  admin_count integer;
BEGIN
  -- Check if any admins exist
  SELECT COUNT(*) INTO admin_count 
  FROM public.user_roles 
  WHERE role = 'admin'::app_role;
  
  -- Only allow if no admins exist
  IF admin_count > 0 THEN
    RAISE EXCEPTION 'Admin already exists. Use assign_admin_by_id instead.';
  END IF;
  
  -- Get user ID from email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;