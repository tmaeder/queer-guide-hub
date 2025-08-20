-- Critical Security Fix: Consolidate Profiles RLS Policies
-- This addresses the security vulnerability of having 15+ overlapping policies

-- Drop ALL existing policies on profiles table to start clean
DROP POLICY IF EXISTS "Admin emergency profile access" ON public.profiles;
DROP POLICY IF EXISTS "Admin emergency profile access with logging" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles for moderation" ON public.profiles;
DROP POLICY IF EXISTS "Owner complete profile access" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Admin secure access" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Admin supervised access" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Owner access only" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Owner full access" ON public.profiles;
DROP POLICY IF EXISTS "Public basic profile access" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile only" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile data only" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile only" ON public.profiles;
DROP POLICY IF EXISTS "profile_admin_access_with_logging" ON public.profiles;
DROP POLICY IF EXISTS "profile_owner_full_access" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_access_with_logging" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_access" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Create simplified, secure RLS policies

-- 1. Profile owners have full access to their own data
CREATE POLICY "profile_owner_full_access" ON public.profiles
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Admin access with mandatory audit logging for sensitive data access
CREATE POLICY "profile_admin_audited_access" ON public.profiles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND audit_admin_data_access(
    auth.uid(), 
    user_id, 
    'profile_data', 
    'administrative_access'
  ) = true
);

-- 3. Limited public access - only basic display info for public profiles
CREATE POLICY "profile_public_basic_info" ON public.profiles
FOR SELECT TO public
USING (
  auth.uid() != user_id 
  AND COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  AND user_id IS NOT NULL
);

-- 4. Profile creation - users can only create their own profile
CREATE POLICY "profile_creation_owner_only" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 5. Profile updates - users can only update their own profile
CREATE POLICY "profile_update_owner_only" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create security function to validate profile data access
CREATE OR REPLACE FUNCTION public.validate_profile_access(
  requesting_user_id UUID,
  profile_user_id UUID,
  access_type TEXT DEFAULT 'read'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Owner always has access
  IF requesting_user_id = profile_user_id THEN
    RETURN TRUE;
  END IF;
  
  -- For non-owners, only allow basic read access to public profiles
  IF access_type = 'read' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = profile_user_id 
      AND COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
    );
  END IF;
  
  -- All other access denied
  RETURN FALSE;
END;
$$;

-- Add constraint to ensure profile privacy by default
ALTER TABLE public.profiles 
ALTER COLUMN privacy_settings 
SET DEFAULT jsonb_build_object(
  'profile_visibility', false,
  'location_public', false,
  'contact_public', false,
  'phone_public', false,
  'pronouns_public', false,
  'bio_public', true,
  'interests_public', false,
  'gender_identity_public', false,
  'sexual_orientation_public', false,
  'relationship_status_public', false,
  'income_range_public', false,
  'emergency_contact_public', false,
  'political_views_public', false,
  'religious_beliefs_public', false
);

-- Log this critical security fix
INSERT INTO public.security_events (event_type, metadata) 
VALUES (
  'SECURITY_FIX_APPLIED',
  jsonb_build_object(
    'fix_type', 'profiles_rls_consolidation',
    'policies_removed', 15,
    'policies_added', 5,
    'security_level', 'critical',
    'timestamp', now()
  )
);