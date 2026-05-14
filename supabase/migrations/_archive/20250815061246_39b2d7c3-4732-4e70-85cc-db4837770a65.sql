-- Security Fix Migration: Fix Database Function Search Paths and Enhance Privacy Settings
-- This migration addresses medium and low-medium priority security issues identified in the security review

-- =====================================================
-- PART 1: Fix Database Function Search Paths
-- =====================================================

-- Fix functions that don't have proper search path settings
-- These functions need SET search_path TO '' for security

CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(target_user_id uuid, requesting_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- User can always view their own data
  IF target_user_id = requesting_user_id THEN
    RETURN true;
  END IF;
  
  -- Admins can view any data
  IF public.has_role(requesting_user_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;
  
  -- Check if users are friends for friend-level privacy
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE ((user_id = requesting_user_id AND target_user_id = can_view_sensitive_profile_data.target_user_id) 
           OR (user_id = can_view_sensitive_profile_data.target_user_id AND target_user_id = requesting_user_id))
    AND status = 'accepted'
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_profile_completion(user_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  completion_score integer := 0;
  profile_record record;
BEGIN
  -- Get profile data
  SELECT * INTO profile_record 
  FROM public.profiles 
  WHERE user_id = user_id_param;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate completion based on filled fields (10 points each)
  IF profile_record.display_name IS NOT NULL AND trim(profile_record.display_name) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.bio IS NOT NULL AND trim(profile_record.bio) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.avatar_url IS NOT NULL AND trim(profile_record.avatar_url) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.location IS NOT NULL AND trim(profile_record.location) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.website IS NOT NULL AND trim(profile_record.website) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.pronouns IS NOT NULL AND trim(profile_record.pronouns) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.age_range IS NOT NULL AND trim(profile_record.age_range) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.occupation IS NOT NULL AND trim(profile_record.occupation) != '' THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.interests IS NOT NULL AND jsonb_array_length(profile_record.interests) > 0 THEN
    completion_score := completion_score + 10;
  END IF;
  
  IF profile_record.languages IS NOT NULL AND jsonb_array_length(profile_record.languages) > 0 THEN
    completion_score := completion_score + 10;
  END IF;
  
  RETURN completion_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit_key(identifier text, max_attempts integer DEFAULT 5, time_window_minutes integer DEFAULT 15)
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
    -- Log security event for rate limit exceeded
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
    attempt_count = public.auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- =====================================================
-- PART 2: Enhanced Privacy Settings Validation
-- =====================================================

-- Add enhanced privacy settings validation function
CREATE OR REPLACE FUNCTION public.validate_privacy_settings_completeness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  required_fields text[] := ARRAY[
    'sexual_orientation_public',
    'gender_identity_public', 
    'pronouns_public',
    'bio_public',
    'location_public',
    'phone_public',
    'emergency_contact_public',
    'relationship_status_public',
    'physical_attributes_public',
    'preferences_public',
    'income_range_public',
    'political_views_public',
    'religious_beliefs_public'
  ];
  field text;
BEGIN
  -- Ensure all required privacy fields are present
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings := jsonb_build_object();
  END IF;
  
  -- Add any missing privacy settings with secure defaults
  FOREACH field IN ARRAY required_fields
  LOOP
    IF NOT (NEW.privacy_settings ? field) THEN
      NEW.privacy_settings := NEW.privacy_settings || jsonb_build_object(field, false);
    END IF;
  END LOOP;
  
  -- Log privacy settings update for audit trail
  PERFORM public.log_enhanced_security_event(
    'PRIVACY_SETTINGS_VALIDATED',
    NEW.user_id,
    jsonb_build_object(
      'settings_updated', NEW.privacy_settings,
      'timestamp', now()
    ),
    'low'
  );
  
  RETURN NEW;
END;
$$;

-- Apply the privacy validation trigger
DROP TRIGGER IF EXISTS validate_privacy_settings_trigger ON public.profiles;
CREATE TRIGGER validate_privacy_settings_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_privacy_settings_completeness();

-- =====================================================  
-- PART 3: Security Content Validation Enhancement
-- =====================================================

-- Enhanced content validation function with better XSS protection
CREATE OR REPLACE FUNCTION public.validate_content_security_enhanced(content text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Null or empty content is valid
  IF content IS NULL OR trim(content) = '' THEN
    RETURN true;
  END IF;
  
  -- Length validation (increased limit for better usability)
  IF length(content) > 50000 THEN
    RETURN false;
  END IF;
  
  -- Enhanced XSS pattern detection with more comprehensive patterns
  IF content ~* '(?i)<script[^>]*>|javascript\s*:|data\s*:[^,]*base64|vbscript\s*:|on(load|error|click|mouse|key|focus|blur|change|submit)\s*=|eval\s*\(|expression\s*\(' THEN
    RETURN false;
  END IF;
  
  -- SQL injection pattern detection with more patterns
  IF content ~* '(?i)(union\s+select|insert\s+into|delete\s+from|drop\s+(table|database)|exec\s*\(|execute\s*\(|\bor\s+[\d''"]+=[\d''"]+\b|;\s*(update|delete|insert|drop))' THEN
    RETURN false;
  END IF;
  
  -- Command injection patterns
  IF content ~* '(\||;|&|`|\$\(|\${)' AND content ~* '(rm|cat|ls|pwd|whoami|wget|curl|nc|telnet)' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- =====================================================
-- PART 4: Security Monitoring Enhancements  
-- =====================================================

-- Enhanced security event logging with better categorization
CREATE OR REPLACE FUNCTION public.log_security_event_enhanced(
  p_event_type text,
  p_user_id uuid,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'medium'::text,
  p_category text DEFAULT 'general'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.security_events (
    event_type, 
    user_id, 
    ip_address, 
    user_agent, 
    metadata, 
    severity
  )
  VALUES (
    p_event_type,
    p_user_id,
    p_ip_address,
    p_user_agent,
    p_metadata || jsonb_build_object(
      'category', p_category,
      'enhanced_logging', true,
      'timestamp_iso', now()
    ),
    p_severity
  );
END;
$$;

-- =====================================================
-- PART 5: Data Migration for Existing Records
-- =====================================================

-- Update existing profiles to ensure complete privacy settings
UPDATE public.profiles 
SET privacy_settings = privacy_settings || jsonb_build_object(
  'sexual_orientation_public', COALESCE(privacy_settings->>'sexual_orientation_public', 'false')::boolean,
  'gender_identity_public', COALESCE(privacy_settings->>'gender_identity_public', 'false')::boolean,
  'pronouns_public', COALESCE(privacy_settings->>'pronouns_public', 'true')::boolean,
  'bio_public', COALESCE(privacy_settings->>'bio_public', 'true')::boolean,
  'location_public', COALESCE(privacy_settings->>'location_public', 'false')::boolean,
  'phone_public', COALESCE(privacy_settings->>'phone_public', 'false')::boolean,
  'emergency_contact_public', COALESCE(privacy_settings->>'emergency_contact_public', 'false')::boolean,
  'relationship_status_public', COALESCE(privacy_settings->>'relationship_status_public', 'false')::boolean,
  'physical_attributes_public', COALESCE(privacy_settings->>'physical_attributes_public', 'false')::boolean,
  'preferences_public', COALESCE(privacy_settings->>'preferences_public', 'false')::boolean,
  'income_range_public', COALESCE(privacy_settings->>'income_range_public', 'false')::boolean,
  'political_views_public', COALESCE(privacy_settings->>'political_views_public', 'false')::boolean,
  'religious_beliefs_public', COALESCE(privacy_settings->>'religious_beliefs_public', 'false')::boolean
)
WHERE privacy_settings IS NULL 
   OR NOT (privacy_settings ? 'sexual_orientation_public')
   OR NOT (privacy_settings ? 'gender_identity_public')
   OR NOT (privacy_settings ? 'phone_public')
   OR NOT (privacy_settings ? 'emergency_contact_public')
   OR NOT (privacy_settings ? 'relationship_status_public')
   OR NOT (privacy_settings ? 'physical_attributes_public')
   OR NOT (privacy_settings ? 'preferences_public')
   OR NOT (privacy_settings ? 'income_range_public')
   OR NOT (privacy_settings ? 'political_views_public')
   OR NOT (privacy_settings ? 'religious_beliefs_public');

-- Log completion of security fixes
SELECT public.log_enhanced_security_event(
  'SECURITY_FIXES_APPLIED',
  NULL,
  jsonb_build_object(
    'fixes_applied', jsonb_build_array(
      'database_function_search_paths',
      'enhanced_privacy_validation', 
      'content_security_improvements',
      'security_monitoring_enhancements'
    ),
    'migration_timestamp', now(),
    'security_level', 'enhanced'
  ),
  'high'
);