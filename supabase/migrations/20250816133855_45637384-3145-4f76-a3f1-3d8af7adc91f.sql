-- Critical Security Fixes for Data Protection - Phase 1
-- Fix syntax issues and implement comprehensive security hardening

-- 1. Enhanced profile RLS policies with field-level privacy
DROP POLICY IF EXISTS "Enhanced profile data protection" ON public.profiles;
CREATE POLICY "Enhanced profile data protection" 
ON public.profiles 
FOR SELECT 
USING (
  -- Allow users to see their own profile
  user_id = (SELECT auth.uid()) OR
  -- Allow admins with enhanced logging
  (
    has_role((SELECT auth.uid()), 'admin'::app_role) AND
    (SELECT public.log_enhanced_security_event(
      'ADMIN_PROFILE_ACCESS',
      (SELECT auth.uid()),
      jsonb_build_object('accessed_profile', user_id, 'admin_access', true),
      'high'
    )) IS NOT NULL
  )
);

-- 2. Strengthen venue checkin location privacy
DROP POLICY IF EXISTS "Enhanced location data protection" ON public.venue_checkins;
CREATE POLICY "Enhanced location data protection" 
ON public.venue_checkins 
FOR SELECT 
USING (
  -- Users can see their own checkins
  user_id = (SELECT auth.uid()) OR
  -- Venue owners can see checkins at their venues with privacy controls
  (
    venue_id IN (
      SELECT id FROM venues 
      WHERE created_by = (SELECT auth.uid())
    ) AND
    -- Respect user privacy settings for location
    public.can_view_user_location(user_id, (SELECT auth.uid()))
  ) OR
  -- Admins can see location data for safety with audit logging
  (
    has_role((SELECT auth.uid()), 'admin'::app_role) AND
    (SELECT public.log_enhanced_security_event(
      'ADMIN_LOCATION_ACCESS',
      (SELECT auth.uid()),
      jsonb_build_object('accessed_user_location', user_id, 'venue_id', venue_id),
      'high'
    )) IS NOT NULL
  )
);

-- 3. Protect user photos with enhanced privacy
DROP POLICY IF EXISTS "Enhanced user photo protection" ON public.user_photos;
CREATE POLICY "Enhanced user photo protection" 
ON public.user_photos 
FOR SELECT 
USING (
  -- Users can see their own photos
  user_id = (SELECT auth.uid()) OR
  -- Public photos can be seen by authenticated users only
  (
    is_public = true AND 
    (SELECT auth.uid()) IS NOT NULL
  ) OR
  -- Friends can see photos based on privacy settings
  (
    is_public = false AND
    EXISTS (
      SELECT 1 FROM user_relationships ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND ur.related_user_id = user_photos.user_id
      AND ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
    )
  )
);

-- 4. Secure messages for conversation participants only
DROP POLICY IF EXISTS "Enhanced message privacy" ON public.messages;
CREATE POLICY "Enhanced message privacy" 
ON public.messages 
FOR SELECT 
USING (
  -- Only conversation participants can see messages
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (SELECT auth.uid())
  )
);

-- 5. Restrict donation data to essential admin access only  
DROP POLICY IF EXISTS "Restricted donation access" ON public.donations;
CREATE POLICY "Restricted donation access" 
ON public.donations 
FOR SELECT 
USING (
  -- Users can see their own donations
  user_id = (SELECT auth.uid()) OR
  -- Only admin access with enhanced logging
  (
    has_role((SELECT auth.uid()), 'admin'::app_role) AND
    (SELECT public.log_enhanced_security_event(
      'ADMIN_DONATION_ACCESS',
      (SELECT auth.uid()),
      jsonb_build_object('accessed_donation', id, 'donor_data_access', true),
      'critical'
    )) IS NOT NULL
  )
);

-- 6. Enhanced security events protection
DROP POLICY IF EXISTS "Security events admin only" ON public.security_events;
CREATE POLICY "Security events admin only" 
ON public.security_events 
FOR ALL 
USING (has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 7. Location data retention and cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Remove venue checkins older than 6 months for non-admin users
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  -- Log cleanup activity
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_CLEANUP',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now(),
      'retention_months', 6
    ),
    'medium'
  );
END;
$$;

-- 8. Enhanced session security validation
CREATE OR REPLACE FUNCTION public.validate_session_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- For UPDATE operations, check if IP has changed significantly
  IF TG_OP = 'UPDATE' AND OLD.ip_address IS DISTINCT FROM NEW.ip_address THEN
    -- Log potential session hijacking attempt
    PERFORM public.log_enhanced_security_event(
      'SESSION_IP_CHANGE',
      NEW.user_id,
      jsonb_build_object(
        'old_ip', OLD.ip_address,
        'new_ip', NEW.ip_address,
        'session_id', NEW.id
      ),
      'high'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 9. Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text, 
  max_attempts integer DEFAULT 10, 
  time_window_seconds integer DEFAULT 60,
  action_type text DEFAULT 'general'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  rate_limit_key TEXT;
BEGIN
  time_cutoff := now() - (time_window_seconds || ' seconds')::INTERVAL;
  rate_limit_key := identifier || ':' || action_type;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
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
    
    -- Update blocked_until timestamp
    UPDATE public.auth_rate_limit_keys 
    SET blocked_until = now() + (time_window_seconds || ' seconds')::INTERVAL
    WHERE key = rate_limit_key;
    
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

-- 10. Enhanced password validation
CREATE OR REPLACE FUNCTION public.validate_password_strength(password_text text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Minimum 12 characters
  IF length(password_text) < 12 THEN
    RETURN FALSE;
  END IF;
  
  -- Must contain at least one uppercase letter
  IF password_text !~ '[A-Z]' THEN
    RETURN FALSE;
  END IF;
  
  -- Must contain at least one lowercase letter
  IF password_text !~ '[a-z]' THEN
    RETURN FALSE;
  END IF;
  
  -- Must contain at least one number
  IF password_text !~ '[0-9]' THEN
    RETURN FALSE;
  END IF;
  
  -- Must contain at least one special character
  IF password_text !~ '[!@#$%^&*(),.?":{}|<>]' THEN
    RETURN FALSE;
  END IF;
  
  -- Check for common weak patterns
  IF password_text ~* '(password|123456|qwerty|admin|letmein)' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;