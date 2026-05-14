-- CRITICAL SECURITY FIXES - Phase 1: Database Policy Consolidation and Hardening

-- =====================================================
-- 1. PROFILE DATA PROTECTION - Consolidate and Harden
-- =====================================================

-- Drop existing overly permissive profile policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create new secure consolidated profile policies
CREATE POLICY "Profiles: Owner full access" ON public.profiles
FOR ALL
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Profiles: Admin supervised access" ON public.profiles
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) 
  AND (SELECT log_enhanced_security_event(
    'ADMIN_PROFILE_ACCESS',
    (SELECT auth.uid()),
    jsonb_build_object(
      'accessed_profile', user_id,
      'admin_access_type', 'profile_view',
      'timestamp', now()
    ),
    'critical'
  )) IS NOT NULL
);

-- =====================================================
-- 2. LOCATION PRIVACY LOCKDOWN 
-- =====================================================

-- Drop existing venue checkin policies
DROP POLICY IF EXISTS "Users can view their own checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Venue checkins are viewable by everyone" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create checkins" ON public.venue_checkins;

-- Create strict location privacy policies
CREATE POLICY "Venue checkins: Owner only access" ON public.venue_checkins
FOR ALL
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Venue checkins: Admin emergency access" ON public.venue_checkins
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (SELECT log_enhanced_security_event(
    'ADMIN_LOCATION_ACCESS',
    (SELECT auth.uid()),
    jsonb_build_object(
      'accessed_user_location', user_id,
      'venue_id', venue_id,
      'admin_justification', 'emergency_safety_check',
      'timestamp', now()
    ),
    'critical'
  )) IS NOT NULL
);

-- =====================================================
-- 3. FINANCIAL DATA SECURITY
-- =====================================================

-- Drop existing donation policies
DROP POLICY IF EXISTS "Admins can manage donations for legal compliance" ON public.donations;
DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
DROP POLICY IF EXISTS "System can create donations" ON public.donations;
DROP POLICY IF EXISTS "System can update donations" ON public.donations;

-- Create strict financial data policies
CREATE POLICY "Donations: Donor access only" ON public.donations
FOR SELECT
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Donations: System creation only" ON public.donations
FOR INSERT
WITH CHECK (
  -- Only allow system/edge functions to create donations
  current_setting('role') = 'service_role' 
  OR auth.uid() IS NULL  -- Allow anonymous donations
);

CREATE POLICY "Donations: Admin legal compliance access" ON public.donations
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (SELECT log_enhanced_security_event(
    'ADMIN_FINANCIAL_ACCESS',
    (SELECT auth.uid()),
    jsonb_build_object(
      'donation_id', id,
      'legal_compliance_access', true,
      'donor_protected', is_anonymous,
      'timestamp', now()
    ),
    'critical'
  )) IS NOT NULL
);

-- =====================================================
-- 4. MESSAGE PRIVACY ENHANCEMENT
-- =====================================================

-- Drop existing complex message policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Create strict message privacy policies
CREATE POLICY "Messages: Conversation participants only" ON public.messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (SELECT auth.uid())
  )
);

-- =====================================================
-- 5. USER PHOTO PRIVACY
-- =====================================================

-- Drop existing user photo policies
DROP POLICY IF EXISTS "Users can view their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Public photos are viewable by everyone" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage their own photos" ON public.user_photos;

-- Create strict photo privacy policies
CREATE POLICY "User photos: Owner full access" ON public.user_photos
FOR ALL
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "User photos: Public visibility" ON public.user_photos
FOR SELECT
USING (
  is_public = true 
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_photos.user_id
    AND (p.privacy_settings->>'photos_public')::boolean = true
  )
);

-- =====================================================
-- 6. ENHANCED SECURITY MONITORING
-- =====================================================

-- Create function to log critical security events with enhanced details
CREATE OR REPLACE FUNCTION public.log_critical_security_event(
  event_type text,
  user_id_param uuid,
  details jsonb,
  severity text DEFAULT 'critical'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log to security_events table with enhanced monitoring
  INSERT INTO public.security_events (
    event_type,
    user_id,
    details,
    severity,
    created_at,
    ip_address,
    user_agent
  ) VALUES (
    event_type,
    user_id_param,
    details || jsonb_build_object(
      'session_id', current_setting('request.jwt.claims', true)::json->>'session_id',
      'security_review_timestamp', now(),
      'policy_hardening_applied', true
    ),
    severity,
    now(),
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent'
  );
  
  -- Also notify if critical event
  IF severity = 'critical' THEN
    NOTIFY security_alert, format('Critical security event: %s by user %s', event_type, user_id_param);
  END IF;
END;
$$;