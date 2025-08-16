-- Critical Security Fixes for Data Protection - Final Implementation
-- Work around existing dependencies and implement security hardening

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
      AND ur.target_user_id = user_photos.user_id
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

-- 8. Enhanced password validation
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

-- 9. Create data privacy compliance function
CREATE OR REPLACE FUNCTION public.request_data_deletion(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  requesting_user_id uuid;
BEGIN
  requesting_user_id := auth.uid();
  
  -- Only allow users to delete their own data
  IF requesting_user_id != target_user_id THEN
    PERFORM public.log_enhanced_security_event(
      'UNAUTHORIZED_DATA_DELETION_ATTEMPT',
      requesting_user_id,
      jsonb_build_object('target_user', target_user_id),
      'critical'
    );
    RETURN FALSE;
  END IF;
  
  -- Log the data deletion request
  PERFORM public.log_enhanced_security_event(
    'DATA_DELETION_REQUESTED',
    requesting_user_id,
    jsonb_build_object('timestamp', now()),
    'high'
  );
  
  -- Note: Actual deletion would be implemented here
  -- For now, just log the request for manual processing
  RETURN TRUE;
END;
$$;