-- CRITICAL SECURITY FIXES FOR DATA PROTECTION
-- This migration addresses the critical security vulnerabilities identified in the security scan

-- 1. ENHANCE PROFILES TABLE RLS POLICIES
-- Drop existing permissive policies and implement strict access control
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create strict profile access policies
CREATE POLICY "Users can only view their own profile data" 
ON public.profiles 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all profiles for moderation" 
ON public.profiles 
FOR SELECT 
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "Users can update their own profile only" 
ON public.profiles 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own profile only" 
ON public.profiles 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. SECURE LOCATION DATA - VENUE CHECKINS
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Users can view all venue checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Venue checkins are viewable by everyone" ON public.venue_checkins;

-- Create privacy-focused location policies
CREATE POLICY "Users can only view their own checkins" 
ON public.venue_checkins 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own checkins" 
ON public.venue_checkins 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can manage their own checkins" 
ON public.venue_checkins 
FOR ALL 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. SECURE DONATION DATA
-- Restrict donation viewing to protect donor privacy
DROP POLICY IF EXISTS "Public donations viewable by authenticated users" ON public.donations;

-- Only allow admins and the donor to see donation details
CREATE POLICY "Donors can view their own donations" 
ON public.donations 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage donations for legal compliance" 
ON public.donations 
FOR ALL 
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- 4. SECURE SESSION DATA
-- Create user_sessions table policies if missing
CREATE POLICY "Users can only access their own session data" 
ON public.user_sessions 
FOR ALL 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 5. SECURE AUTHENTICATION DATA - PASSKEYS
-- Ensure passkey data is only accessible to the owner
DROP POLICY IF EXISTS "Users can view their own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can manage their own passkeys" ON public.user_passkeys;

CREATE POLICY "Strict passkey access - owner only" 
ON public.user_passkeys 
FOR ALL 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 6. SECURE PRIVATE MESSAGES
-- Ensure messages are only accessible to conversation participants
DROP POLICY IF EXISTS "Messages are viewable by conversation participants" ON public.messages;

CREATE POLICY "Messages only viewable by conversation participants" 
ON public.messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp 
    WHERE cp.conversation_id = messages.conversation_id 
    AND cp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Only conversation participants can send messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  sender_id = (SELECT auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp 
    WHERE cp.conversation_id = messages.conversation_id 
    AND cp.user_id = (SELECT auth.uid())
  )
);

-- 7. ENHANCED SECURITY EVENT PROTECTION
-- Ensure security events are only viewable by admins
DROP POLICY IF EXISTS "Security events viewable by admins" ON public.security_events;

CREATE POLICY "Security events admin access only" 
ON public.security_events 
FOR ALL 
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

-- 8. ADD PRIVACY-FOCUSED HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.can_view_user_location(target_user_id uuid, requesting_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Users can see their own location
  IF target_user_id = requesting_user_id THEN
    RETURN true;
  END IF;
  
  -- Admins can see location for safety/moderation
  IF public.has_role(requesting_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Check if target user has made location public in privacy settings
  RETURN (
    SELECT COALESCE(
      (privacy_settings->>'location_public')::boolean, 
      false
    )
    FROM public.profiles 
    WHERE user_id = target_user_id
  );
END;
$$;

-- 9. LOG SECURITY POLICY UPDATES
PERFORM public.log_enhanced_security_event(
  'SECURITY_POLICIES_ENHANCED',
  (SELECT auth.uid()),
  jsonb_build_object(
    'policies_updated', jsonb_build_array(
      'profiles', 'venue_checkins', 'donations', 'user_sessions', 
      'user_passkeys', 'messages', 'security_events'
    ),
    'security_level', 'critical_fixes_applied',
    'timestamp', now()
  ),
  'critical'
);