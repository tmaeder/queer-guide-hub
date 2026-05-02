-- Security Hardening Migration: Fix Critical RLS Policy Issues and Database Security
-- Phase 1: Critical RLS Policy Consolidation

-- First, consolidate all conflicting RLS policies on profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Profile owners can manage their data" ON public.profiles;

-- Create consolidated, secure RLS policies for profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
  -- Users can see their own profile
  user_id = auth.uid() 
  OR 
  -- Admins can see profiles with audit logging
  (
    public.has_role(auth.uid(), 'admin'::app_role) 
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_profile', user_id, 'justification', 'admin_review'),
      'high'
    ) IS NOT NULL
  )
  OR
  -- Public profiles viewable based on privacy settings
  (
    COALESCE((privacy_settings->>'profile_visibility'), 'private') = 'public'
    AND auth.uid() IS NOT NULL
  )
);

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  -- Only allow users to create their own profile
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
  -- Users can update their own profile
  user_id = auth.uid()
  OR
  -- Admins can update with proper logging
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_UPDATE',
      auth.uid(),
      jsonb_build_object('updated_profile', user_id, 'justification', 'admin_moderation'),
      'high'
    ) IS NOT NULL
  )
);

CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE USING (
  -- Only admins can delete profiles with logging
  public.has_role(auth.uid(), 'admin'::app_role)
  AND public.log_enhanced_security_event(
    'ADMIN_PROFILE_DELETE',
    auth.uid(),
    jsonb_build_object('deleted_profile', user_id, 'justification', 'admin_action'),
    'critical'
  ) IS NOT NULL
);

-- Fix Security Definer View Issues
-- Drop and recreate the profiles_safe view with proper security
DROP VIEW IF EXISTS public.profiles_safe CASCADE;

CREATE VIEW public.profiles_safe AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  CASE 
    WHEN privacy_settings->>'bio_public' = 'true' THEN bio
    ELSE NULL
  END as bio,
  CASE 
    WHEN privacy_settings->>'pronouns_public' = 'true' THEN pronouns
    ELSE NULL
  END as pronouns,
  created_at,
  updated_at
FROM public.profiles
WHERE 
  privacy_settings->>'profile_visibility' = 'public'
  OR user_id = auth.uid();

-- Strengthen Location Data Protection
-- Consolidate venue_checkins RLS policies
DROP POLICY IF EXISTS "Users can view their own checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Public checkins viewable" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can update their checkins" ON public.venue_checkins;

CREATE POLICY "venue_checkins_select_policy" ON public.venue_checkins
FOR SELECT USING (
  -- Users can see their own checkins
  user_id = auth.uid()
  OR
  -- Admins can see checkins with proper justification
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_LOCATION_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_user_checkins', user_id, 'justification', 'safety_moderation'),
      'high'
    ) IS NOT NULL
  )
  OR
  -- Public checkins only if user explicitly allows and within recent timeframe
  (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = venue_checkins.user_id 
      AND p.privacy_settings->>'checkins_public' = 'true'
      AND venue_checkins.created_at > NOW() - INTERVAL '7 days'
    )
  )
);

CREATE POLICY "venue_checkins_insert_policy" ON public.venue_checkins
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
  -- Rate limit checkins to prevent spam
  AND public.check_rate_limit_enhanced(auth.uid()::text, 10, 60, 'venue_checkin')
);

CREATE POLICY "venue_checkins_update_policy" ON public.venue_checkins
FOR UPDATE USING (
  -- Prevent any updates to location data for security
  FALSE
);

CREATE POLICY "venue_checkins_delete_policy" ON public.venue_checkins
FOR DELETE USING (
  -- Users can delete their own checkins
  user_id = auth.uid()
  OR
  -- Admins can delete with logging
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_CHECKIN_DELETE',
      auth.uid(),
      jsonb_build_object('deleted_checkin_user', user_id, 'justification', 'privacy_request'),
      'medium'
    ) IS NOT NULL
  )
);

-- Enhanced Message Security
-- Consolidate message RLS policies
DROP POLICY IF EXISTS "Conversation participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Message senders can update" ON public.messages;

CREATE POLICY "messages_select_policy" ON public.messages
FOR SELECT USING (
  -- Only conversation participants can view messages
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = auth.uid()
  )
  OR
  -- Admins can access with proper legal justification and logging
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_MESSAGE_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'conversation_id', conversation_id,
        'message_id', id,
        'justification', 'legal_compliance_or_safety'
      ),
      'critical'
    ) IS NOT NULL
  )
);

CREATE POLICY "messages_insert_policy" ON public.messages
FOR INSERT WITH CHECK (
  -- Users can only send messages to conversations they're part of
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = auth.uid()
  )
  -- Rate limit message sending
  AND public.check_rate_limit_enhanced(auth.uid()::text, 100, 60, 'message_send')
);

CREATE POLICY "messages_update_policy" ON public.messages
FOR UPDATE USING (
  -- Only allow updating read status and metadata, not content
  sender_id = auth.uid()
  AND OLD.content = NEW.content
  AND OLD.sender_id = NEW.sender_id
  AND OLD.conversation_id = NEW.conversation_id
);

CREATE POLICY "messages_delete_policy" ON public.messages
FOR DELETE USING (
  -- Users can delete their own messages within 24 hours
  (
    sender_id = auth.uid()
    AND created_at > NOW() - INTERVAL '24 hours'
  )
  OR
  -- Admins can delete with proper justification
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_MESSAGE_DELETE',
      auth.uid(),
      jsonb_build_object('message_id', id, 'justification', 'content_moderation'),
      'high'
    ) IS NOT NULL
  )
);

-- Enhanced Security Functions
CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text,
  max_attempts integer,
  time_window_minutes integer,
  operation_type text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  rate_key TEXT;
BEGIN
  rate_key := identifier || ':' || operation_type;
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = rate_key
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Log rate limit exceeded
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'operation', operation_type,
        'identifier', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts
      ),
      'medium'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (rate_key, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Automated Security Data Cleanup
CREATE OR REPLACE FUNCTION public.automated_security_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Remove old venue checkins (6 months for non-admin users)
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  -- Remove old failed login attempts (30 days)
  DELETE FROM public.auth_rate_limit 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Remove old rate limit keys (24 hours)
  DELETE FROM public.auth_rate_limit_keys 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- Remove old security events (1 year, except critical ones)
  DELETE FROM public.enhanced_security_events 
  WHERE created_at < NOW() - INTERVAL '1 year'
    AND severity NOT IN ('critical', 'high');
  
  -- Log cleanup activity
  PERFORM public.log_enhanced_security_event(
    'AUTOMATED_SECURITY_CLEANUP',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now(),
      'retention_policy', 'enforced'
    ),
    'low'
  );
END;
$$;

-- Create security monitoring view for admins
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  event_type,
  severity,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users_affected
FROM public.enhanced_security_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), event_type, severity
ORDER BY date DESC, event_count DESC;

-- Grant appropriate permissions
GRANT SELECT ON public.security_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_enhanced TO authenticated;
GRANT EXECUTE ON FUNCTION public.automated_security_cleanup TO service_role;