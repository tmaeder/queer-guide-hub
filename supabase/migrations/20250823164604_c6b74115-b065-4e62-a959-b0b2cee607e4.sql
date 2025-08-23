-- Security Fixes Implementation - Phase 1: Critical Data Protection (Fixed)
-- This migration addresses the most critical security vulnerabilities identified in the security review

-- 1. Harden profiles table RLS policies
-- Drop existing complex policies and create simplified, secure ones
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create simplified, secure profile policies
CREATE POLICY "profile_owners_full_access" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_public_read_only" ON public.profiles
  FOR SELECT USING (
    COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
    AND auth.uid() IS NOT NULL
  );

-- 2. Enhance privacy settings validation
-- Add trigger to ensure all privacy settings are properly initialized
CREATE OR REPLACE FUNCTION public.validate_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure privacy_settings is properly structured with secure defaults
  IF NEW.privacy_settings IS NULL OR NEW.privacy_settings = '{}'::jsonb THEN
    NEW.privacy_settings := jsonb_build_object(
      'profile_visibility', false,
      'location_public', false,
      'pronouns_public', false,
      'contact_public', false,
      'interests_public', false,
      'sexual_orientation_public', false,
      'gender_identity_public', false,
      'bio_public', true,
      'phone_public', false,
      'emergency_contact_public', false,
      'relationship_status_public', false,
      'income_range_public', false,
      'political_views_public', false,
      'religious_beliefs_public', false
    );
  END IF;
  
  -- Log privacy setting changes for audit
  IF TG_OP = 'UPDATE' AND OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
    PERFORM public.log_enhanced_security_event(
      'PRIVACY_SETTINGS_UPDATED',
      NEW.user_id,
      jsonb_build_object(
        'old_settings', OLD.privacy_settings,
        'new_settings', NEW.privacy_settings,
        'timestamp', NOW()
      ),
      'medium'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

DROP TRIGGER IF EXISTS validate_privacy_settings_trigger ON public.profiles;
CREATE TRIGGER validate_privacy_settings_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_privacy_settings();

-- 3. Financial data protection - donations table (using correct column name)
DROP POLICY IF EXISTS "Users can view their own donations" ON public.donations;
DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;

-- Create secure donation policies
CREATE POLICY "donation_owners_only" ON public.donations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "donation_admin_access_logged" ON public.donations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
    AND (
      SELECT public.audit_admin_data_access(
        auth.uid(), 
        donations.user_id, 
        'financial_data', 
        'Administrative review of donation data'
      )
    )
  );

-- 4. Add location data anonymization function
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void AS $$
BEGIN
  -- Check if venue_checkins table exists and has required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'venue_checkins') THEN
    -- Anonymize venue checkins older than 30 days
    UPDATE public.venue_checkins 
    SET 
      latitude = CASE 
        WHEN latitude IS NOT NULL THEN ROUND(latitude::numeric, 1)::double precision
        ELSE latitude
      END,
      longitude = CASE 
        WHEN longitude IS NOT NULL THEN ROUND(longitude::numeric, 1)::double precision  
        ELSE longitude
      END,
      anonymized_at = NOW()
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND anonymized_at IS NULL;
      
    -- Log the anonymization
    PERFORM public.log_enhanced_security_event(
      'LOCATION_DATA_ANONYMIZED',
      NULL,
      jsonb_build_object(
        'records_processed', (SELECT COUNT(*) FROM public.venue_checkins WHERE anonymized_at IS NOT NULL),
        'timestamp', NOW()
      ),
      'low'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- 5. Enhanced security event logging for sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  p_user_id UUID,
  p_target_user_id UUID,
  p_data_type TEXT,
  p_access_method TEXT DEFAULT 'direct'
)
RETURNS void AS $$
BEGIN
  PERFORM public.log_enhanced_security_event(
    'SENSITIVE_DATA_ACCESS',
    p_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'data_type', p_data_type,
      'access_method', p_access_method,
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for',
      'user_agent', current_setting('request.headers', true)::json->>'user-agent',
      'timestamp', NOW()
    ),
    'high'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- 6. Update all existing profiles to have proper privacy settings
UPDATE public.profiles 
SET privacy_settings = jsonb_build_object(
  'profile_visibility', false,
  'location_public', false,
  'pronouns_public', false,
  'contact_public', false,
  'interests_public', false,
  'sexual_orientation_public', false,
  'gender_identity_public', false,
  'bio_public', true,
  'phone_public', false,
  'emergency_contact_public', false,
  'relationship_status_public', false,
  'income_range_public', false,
  'political_views_public', false,
  'religious_beliefs_public', false
)
WHERE privacy_settings IS NULL OR privacy_settings = '{}'::jsonb;