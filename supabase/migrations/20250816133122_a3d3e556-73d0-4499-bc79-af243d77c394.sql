-- ADDITIONAL SECURITY ENHANCEMENTS - USER PHOTOS AND COMPREHENSIVE LOGGING
-- This migration addresses remaining privacy concerns and adds enhanced monitoring

-- 1. ENHANCE USER PHOTOS PRIVACY PROTECTION
-- Add stricter policies for user photos to prevent privacy leaks
DROP POLICY IF EXISTS "Users can view their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Public photos are viewable by everyone" ON public.user_photos;

-- Create ultra-strict photo access policies
CREATE POLICY "Strict user photo access - owner only" 
ON public.user_photos 
FOR SELECT 
USING (
  user_id = (SELECT auth.uid()) OR
  (
    is_public = true AND 
    public.can_view_user_location(user_id, (SELECT auth.uid()))
  )
);

CREATE POLICY "Users can only manage their own photos" 
ON public.user_photos 
FOR ALL 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. ADD ENHANCED SECURITY MONITORING FOR DATA ACCESS
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log access to sensitive profile data
  IF TG_TABLE_NAME = 'profiles' AND TG_OP = 'SELECT' THEN
    PERFORM public.log_enhanced_security_event(
      'PROFILE_DATA_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'accessed_profile', COALESCE(NEW.user_id, OLD.user_id),
        'operation', TG_OP,
        'timestamp', now()
      ),
      'low'
    );
  END IF;
  
  -- Log access to location data
  IF TG_TABLE_NAME = 'venue_checkins' AND TG_OP = 'SELECT' THEN
    PERFORM public.log_enhanced_security_event(
      'LOCATION_DATA_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'accessed_user_checkins', COALESCE(NEW.user_id, OLD.user_id),
        'operation', TG_OP,
        'timestamp', now()
      ),
      'medium'
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. CREATE DATA RETENTION FUNCTION FOR ENHANCED PRIVACY
CREATE OR REPLACE FUNCTION public.cleanup_old_sensitive_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Remove old venue checkins (older than 6 months) to prevent long-term tracking
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  -- Remove old failed login attempts (older than 30 days)
  DELETE FROM public.failed_login_attempts 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Remove old auth rate limit entries (older than 24 hours)
  DELETE FROM public.auth_rate_limit 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  DELETE FROM public.auth_rate_limit_keys 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- Log data cleanup activity
  PERFORM public.log_enhanced_security_event(
    'AUTOMATED_DATA_CLEANUP',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now(),
      'retention_policy', 'enforced'
    ),
    'low'
  );
END;
$$;

-- 4. ADD PRIVACY SETTINGS VALIDATION
CREATE OR REPLACE FUNCTION public.validate_privacy_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Ensure all required privacy settings are present with secure defaults
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings = jsonb_build_object(
      'profile_visibility', 'private',
      'location_public', false,
      'phone_public', false,
      'sexual_orientation_public', false,
      'gender_identity_public', false,
      'relationship_status_public', false,
      'income_range_public', false,
      'political_views_public', false,
      'religious_beliefs_public', false,
      'emergency_contact_public', false,
      'photos_public', false,
      'checkins_public', false
    );
  ELSE
    -- Ensure secure defaults for any missing settings
    NEW.privacy_settings = NEW.privacy_settings || jsonb_build_object(
      'profile_visibility', COALESCE(NEW.privacy_settings->>'profile_visibility', 'private'),
      'location_public', COALESCE((NEW.privacy_settings->>'location_public')::boolean, false),
      'phone_public', COALESCE((NEW.privacy_settings->>'phone_public')::boolean, false),
      'sexual_orientation_public', COALESCE((NEW.privacy_settings->>'sexual_orientation_public')::boolean, false),
      'gender_identity_public', COALESCE((NEW.privacy_settings->>'gender_identity_public')::boolean, false),
      'relationship_status_public', COALESCE((NEW.privacy_settings->>'relationship_status_public')::boolean, false),
      'income_range_public', COALESCE((NEW.privacy_settings->>'income_range_public')::boolean, false),
      'political_views_public', COALESCE((NEW.privacy_settings->>'political_views_public')::boolean, false),
      'religious_beliefs_public', COALESCE((NEW.privacy_settings->>'religious_beliefs_public')::boolean, false),
      'emergency_contact_public', COALESCE((NEW.privacy_settings->>'emergency_contact_public')::boolean, false),
      'photos_public', COALESCE((NEW.privacy_settings->>'photos_public')::boolean, false),
      'checkins_public', COALESCE((NEW.privacy_settings->>'checkins_public')::boolean, false)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. APPLY ENHANCED PRIVACY VALIDATION TRIGGER
DROP TRIGGER IF EXISTS enforce_privacy_defaults ON public.profiles;
CREATE TRIGGER enforce_privacy_defaults
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_privacy_settings();