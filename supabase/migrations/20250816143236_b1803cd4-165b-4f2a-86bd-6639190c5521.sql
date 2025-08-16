-- Critical Security Fixes: Enhanced Data Protection and Access Controls (Corrected)

-- Phase 1: Profile Data Security Hardening
-- Drop existing overly permissive admin policies for profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create strict owner-only access policies for sensitive profile data
CREATE POLICY "Users can view own profile data only"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile data only"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create limited admin access with mandatory logging for profile data
CREATE POLICY "Admin emergency profile access with logging"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  log_enhanced_security_event(
    'ADMIN_PROFILE_EMERGENCY_ACCESS',
    auth.uid(),
    jsonb_build_object(
      'accessed_profile', user_id,
      'justification', 'emergency_support',
      'timestamp', now()
    ),
    'critical'
  ) IS NOT NULL
);

-- Phase 2: Location Privacy Protection
-- Drop overly permissive venue checkin policies
DROP POLICY IF EXISTS "Admins can view all venue checkins" ON public.venue_checkins;

-- Create strict location data policies
CREATE POLICY "Users can view own location data only"
ON public.venue_checkins FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can manage own checkins only"
ON public.venue_checkins FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Implement location data auto-anonymization function
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Anonymize location data older than 30 days for privacy
  UPDATE public.venue_checkins 
  SET 
    latitude = NULL,
    longitude = NULL,
    venue_id = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND latitude IS NOT NULL;
    
  -- Log anonymization activity
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'anonymization_timestamp', now(),
      'retention_days', 30
    ),
    'medium'
  );
END;
$function$;

-- Phase 3: Financial Data Security Enhancement
-- Drop existing admin access to donations
DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;
DROP POLICY IF EXISTS "Combined SELECT policy for donations" ON public.donations;

-- Create strict financial data access policies
CREATE POLICY "Donors can view own donations only"
ON public.donations FOR SELECT
USING (user_id = auth.uid());

-- Limited admin access for legal compliance only with comprehensive logging
CREATE POLICY "Admin legal compliance donation access"
ON public.donations FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  log_enhanced_security_event(
    'ADMIN_FINANCIAL_LEGAL_ACCESS',
    auth.uid(),
    jsonb_build_object(
      'donation_id', id,
      'legal_compliance_access', true,
      'donor_protected', is_anonymous,
      'access_justification', 'legal_compliance',
      'timestamp', now()
    ),
    'critical'
  ) IS NOT NULL
);

-- Phase 4: Photo Privacy Enhancement
-- Drop admin access to user photos
DROP POLICY IF EXISTS "Admins can view all user photos" ON public.user_photos;

-- Create default-private photo policies
CREATE POLICY "Users can view own photos"
ON public.user_photos FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Public photos viewable by authenticated users"
ON public.user_photos FOR SELECT
USING (is_public = true AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage own photos"
ON public.user_photos FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Phase 5: Enhanced Security Monitoring
-- Create comprehensive security monitoring function
CREATE OR REPLACE FUNCTION public.detect_suspicious_access_patterns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  suspicious_activity RECORD;
BEGIN
  -- Detect rapid-fire data access attempts
  FOR suspicious_activity IN
    SELECT 
      user_id,
      COUNT(*) as access_count,
      MIN(created_at) as first_access,
      MAX(created_at) as last_access
    FROM public.enhanced_security_events
    WHERE created_at > NOW() - INTERVAL '5 minutes'
      AND event_type IN ('PROFILE_DATA_ACCESS', 'LOCATION_DATA_ACCESS', 'FINANCIAL_DATA_ACCESS')
    GROUP BY user_id
    HAVING COUNT(*) > 20
  LOOP
    -- Log suspicious activity
    PERFORM public.log_enhanced_security_event(
      'SUSPICIOUS_DATA_ACCESS_PATTERN',
      suspicious_activity.user_id,
      jsonb_build_object(
        'access_count', suspicious_activity.access_count,
        'time_window_minutes', 5,
        'first_access', suspicious_activity.first_access,
        'last_access', suspicious_activity.last_access,
        'alert_level', 'high'
      ),
      'critical'
    );
  END LOOP;
END;
$function$;

-- Create automated data retention policy enforcement
CREATE OR REPLACE FUNCTION public.enforce_data_retention_policies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Enforce location data retention (6 months for non-admin users)
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  -- Enforce security event log retention (1 year)
  DELETE FROM public.enhanced_security_events 
  WHERE created_at < NOW() - INTERVAL '1 year'
    AND severity NOT IN ('critical', 'high');
    
  -- Log retention enforcement
  PERFORM public.log_enhanced_security_event(
    'DATA_RETENTION_ENFORCED',
    NULL,
    jsonb_build_object(
      'enforcement_timestamp', now(),
      'policies', jsonb_build_array('location_6_months', 'security_logs_1_year')
    ),
    'medium'
  );
END;
$function$;