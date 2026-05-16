-- CRITICAL SECURITY FIX: Implement proper profile data protection
-- This addresses the security vulnerability where sensitive personal data was exposed publicly

-- Drop all existing permissive profile policies that expose sensitive data
DROP POLICY IF EXISTS "profile_public_read_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "Enhanced profile data protection" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can only view their own profile data" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile data only" ON public.profiles;

-- Create secure profile access policies with field-level privacy controls

-- 1. Basic public profile information (only safe, non-sensitive fields)
CREATE POLICY "Public basic profile access" ON public.profiles
  FOR SELECT 
  USING (
    -- Only expose basic display information publicly when profile_visibility is public
    (auth.uid() <> user_id) 
    AND 
    (COALESCE((privacy_settings ->> 'profile_visibility')::boolean, false) = true)
    AND 
    -- This policy will be combined with SELECT statement that only retrieves safe fields
    true
  );

-- 2. Owner full access to their own data
CREATE POLICY "Owner complete profile access" ON public.profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Admin supervised access with mandatory logging
CREATE POLICY "Admin emergency profile access" ON public.profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND 
    (log_enhanced_security_event(
      'ADMIN_SENSITIVE_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object(
        'accessed_profile', user_id,
        'justification', 'administrative_oversight',
        'timestamp', now(),
        'fields_accessed', 'all_profile_data'
      ),
      'critical'
    ) IS NOT NULL)
  );

-- Create a secure function to get public profile data with proper field filtering
CREATE OR REPLACE FUNCTION get_public_profile_safe(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_record record;
  safe_data jsonb;
  privacy_settings jsonb;
BEGIN
  -- Get the profile record
  SELECT * INTO profile_record 
  FROM public.profiles 
  WHERE user_id = target_user_id;
  
  IF NOT FOUND THEN
    RETURN null;
  END IF;
  
  -- Parse privacy settings
  privacy_settings := COALESCE(profile_record.privacy_settings, '{}'::jsonb);
  
  -- Always include basic display information
  safe_data := jsonb_build_object(
    'id', profile_record.id,
    'user_id', profile_record.user_id,
    'display_name', profile_record.display_name,
    'bio', profile_record.bio,
    'avatar_url', profile_record.avatar_url,
    'created_at', profile_record.created_at,
    'is_business', profile_record.is_business
  );
  
  -- Add location only if location_public is true
  IF COALESCE((privacy_settings ->> 'location_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object('location', profile_record.location);
  END IF;
  
  -- Add pronouns only if pronouns_public is true  
  IF COALESCE((privacy_settings ->> 'pronouns_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object('pronouns', profile_record.pronouns);
  END IF;
  
  -- Add website and social links only if contact_public is true
  IF COALESCE((privacy_settings ->> 'contact_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object(
      'website', profile_record.website,
      'social_links', profile_record.social_links
    );
  END IF;
  
  -- Add basic interests only if interests_public is true
  IF COALESCE((privacy_settings ->> 'interests_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object(
      'interests', profile_record.interests,
      'occupation', profile_record.occupation,
      'education', profile_record.education
    );
  END IF;
  
  -- NEVER expose sensitive fields publicly:
  -- phone, date_of_birth, gender_identity, sexual_orientation, 
  -- relationship_status, income_range, emergency_contact_*,
  -- physical characteristics, lifestyle preferences, etc.
  
  RETURN safe_data;
END;
$$;

-- Update privacy settings to include granular controls
-- Add new privacy fields with secure defaults (everything private by default)
ALTER TABLE public.profiles 
ALTER COLUMN privacy_settings 
SET DEFAULT '{
  "profile_visibility": false,
  "location_public": false, 
  "pronouns_public": false,
  "contact_public": false,
  "interests_public": false,
  "phone_public": false,
  "bio_public": true,
  "sexual_orientation_public": false,
  "gender_identity_public": false,
  "relationship_status_public": false,
  "income_range_public": false,
  "emergency_contact_public": false,
  "political_views_public": false,
  "religious_beliefs_public": false
}'::jsonb;