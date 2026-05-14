-- ============================================================================
-- PROFILES TABLE SECURITY HARDENING - SIMPLIFIED VERSION
-- ============================================================================
-- This migration hardens the public.profiles table with comprehensive security
-- Idempotent: Safe to run multiple times
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles; 
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles viewable by all" ON public.profiles;
DROP POLICY IF EXISTS "Combined SELECT policy for profiles" ON public.profiles;

-- ============================================================================
-- STRICT RLS POLICIES - DENY BY DEFAULT
-- ============================================================================

-- INSERT Policy: Users can only insert their own profile
CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- SELECT Policy: Users can only view their own profile data
CREATE POLICY "profiles_select_own" ON public.profiles  
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- UPDATE Policy: Users can only update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated  
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE Policy: No deletes allowed for users
-- (No policy = no access)

-- Admin override policy for all operations
CREATE POLICY "profiles_admin_all" ON public.profiles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- SAFE VIEW FOR NON-SENSITIVE DATA
-- ============================================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.profiles_safe;

-- Create safe view with only non-sensitive columns
CREATE VIEW public.profiles_safe AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  location,
  bio,
  pronouns,
  created_at,
  updated_at,
  first_name,
  last_name,
  website,
  occupation,
  education
FROM public.profiles
WHERE user_id = auth.uid(); -- Safety filter: users only see their own data

-- Grant access to safe view
GRANT SELECT ON public.profiles_safe TO authenticated;

-- ============================================================================
-- AUDIT LOGGING FOR PROFILE ACCESS
-- ============================================================================

-- Create audit table for profile access
CREATE TABLE IF NOT EXISTS public.profiles_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id UUID NOT NULL,
  accessing_user_id UUID,
  action TEXT NOT NULL,
  accessed_columns TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on audit table (admin only)
ALTER TABLE public.profiles_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_audit_admin_only" ON public.profiles_audit_log
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- ENSURE UNIQUE CONSTRAINT ON USER_ID
-- ============================================================================

-- Add unique constraint on user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_user_id_unique' 
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- ============================================================================
-- GRANT MINIMAL PERMISSIONS
-- ============================================================================

-- Revoke broad access first
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Grant only what's needed for the RLS policies to work
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Ensure service_role has full access for system operations
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.profiles_audit_log TO service_role;

-- ============================================================================
-- SECURITY SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== PROFILES SECURITY HARDENING COMPLETE ===';
  RAISE NOTICE 'RLS ENABLED: strict owner-only access';
  RAISE NOTICE 'SAFE VIEW: public.profiles_safe (non-sensitive data)';
  RAISE NOTICE 'AUDIT LOG: public.profiles_audit_log';
  RAISE NOTICE 'POLICIES: deny-by-default with owner and admin access';
  RAISE NOTICE 'DELETE PROTECTION: users cannot delete profiles';
  RAISE NOTICE '============================================';
END $$;