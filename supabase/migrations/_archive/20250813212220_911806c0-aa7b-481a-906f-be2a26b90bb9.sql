-- CRITICAL SECURITY FIX: Implement strict RLS policies for profiles table
-- This table contains highly sensitive personal data that must be protected

-- Drop any existing policies (there should be none based on our check)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles viewable by authenticated users" ON public.profiles;

-- Create secure RLS policies that follow least-privilege principle

-- 1. SELECT policy - Users can only view their own profile data
CREATE POLICY "Users can view only their own profile" 
ON public.profiles 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

-- 2. INSERT policy - Users can only create their own profile
CREATE POLICY "Users can create only their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. UPDATE policy - Users can only update their own profile
CREATE POLICY "Users can update only their own profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. DELETE policy - Users can only delete their own profile
CREATE POLICY "Users can delete only their own profile" 
ON public.profiles 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- 5. Admin override policy for SELECT only (for moderation purposes)
-- Admins should only be able to view profiles, not modify personal data
CREATE POLICY "Admins can view all profiles for moderation" 
ON public.profiles 
FOR SELECT 
USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- 6. Create index to optimize RLS policy performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- 7. Ensure privacy_settings has proper default values for new rows
CREATE OR REPLACE FUNCTION ensure_profile_privacy_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Set secure defaults for privacy settings if not provided
  IF NEW.privacy_settings IS NULL THEN
    NEW.privacy_settings = jsonb_build_object(
      'sexual_orientation_public', false,
      'gender_identity_public', false,
      'pronouns_public', true,
      'bio_public', true,
      'location_public', false,
      'phone_public', false,
      'emergency_contact_public', false,
      'relationship_status_public', false,
      'physical_attributes_public', false,
      'preferences_public', false,
      'income_range_public', false,
      'political_views_public', false,
      'religious_beliefs_public', false
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply privacy defaults trigger
DROP TRIGGER IF EXISTS trigger_ensure_profile_privacy_defaults ON public.profiles;
CREATE TRIGGER trigger_ensure_profile_privacy_defaults
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_profile_privacy_defaults();

-- 8. Create a function to safely check if sensitive data should be visible
CREATE OR REPLACE FUNCTION can_view_sensitive_profile_data(
  profile_user_id uuid, 
  requesting_user_id uuid,
  privacy_field text
)
RETURNS boolean AS $$
BEGIN
  -- Users can always see their own data
  IF profile_user_id = requesting_user_id THEN
    RETURN true;
  END IF;
  
  -- Check privacy settings for the specific field
  RETURN COALESCE(
    (SELECT (privacy_settings ->> privacy_field)::boolean 
     FROM public.profiles 
     WHERE user_id = profile_user_id),
    false -- Default to private if setting not found
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Log this critical security fix
PERFORM public.log_enhanced_security_event(
  'CRITICAL_RLS_SECURITY_FIX',
  NULL,
  jsonb_build_object(
    'table', 'profiles',
    'description', 'Implemented strict RLS policies to protect sensitive personal data',
    'timestamp', now()
  ),
  'critical'
);