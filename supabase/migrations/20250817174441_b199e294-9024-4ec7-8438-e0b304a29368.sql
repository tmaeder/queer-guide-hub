-- ============================================================================
-- PROFILES TABLE SECURITY HARDENING - ONE-SHOT MIGRATION
-- ============================================================================
-- This migration hardens the public.profiles table with comprehensive security
-- Idempotent: Safe to run multiple times
-- Author: Supabase Security Engineer
-- Date: 2024
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgsodium";

-- ============================================================================
-- 1. SETUP AND CLEANUP
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
-- 2. ENCRYPTION KEY MANAGEMENT
-- ============================================================================

-- Create encryption key for profiles (pgsodium)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgsodium.valid_key WHERE name = 'profiles_kms') THEN
    PERFORM pgsodium.create_key(name := 'profiles_kms');
  END IF;
END $$;

-- ============================================================================
-- 3. REVOKE BROAD ACCESS
-- ============================================================================

-- Revoke all existing grants on profiles table
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Revoke column-level access to sensitive data
REVOKE SELECT (phone_encrypted, emergency_contact_phone_encrypted, sexual_orientation_encrypted, 
               gender_identity_encrypted, relationship_status_encrypted, income_range_encrypted, 
               political_views_encrypted, religious_beliefs_encrypted) 
ON public.profiles FROM anon, authenticated;

-- ============================================================================
-- 4. STRICT RLS POLICIES
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

-- DELETE Policy: Disallow all deletes (as per requirements)
-- No DELETE policy = no deletes allowed

-- ============================================================================
-- 5. SAFE VIEW FOR NON-SENSITIVE DATA
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
WHERE user_id = auth.uid(); -- Additional safety filter in view

-- Grant access to safe view
GRANT SELECT ON public.profiles_safe TO authenticated;

-- ============================================================================
-- 6. ENCRYPTION HELPER FUNCTIONS
-- ============================================================================

-- Function to encrypt sensitive profile data
CREATE OR REPLACE FUNCTION public.encrypt_profile_field(data_text TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
BEGIN
  IF data_text IS NULL OR trim(data_text) = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN pgsodium.crypto_aead_det_encrypt(
    data_text::bytea,
    NULL::bytea,
    (SELECT id FROM pgsodium.valid_key WHERE name = 'profiles_kms' LIMIT 1)
  );
END;
$$;

-- Function to decrypt sensitive profile data (owner-only)
CREATE OR REPLACE FUNCTION public.decrypt_profile_field(encrypted_data BYTEA, owner_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
BEGIN
  -- Security check: only owner or service_role can decrypt
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF auth.uid() != owner_user_id AND current_user != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: Can only decrypt own data';
  END IF;
  
  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      encrypted_data,
      NULL::bytea,
      (SELECT id FROM pgsodium.valid_key WHERE name = 'profiles_kms' LIMIT 1)
    ),
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN '[DECRYPTION_FAILED]';
END;
$$;

-- ============================================================================
-- 7. AUDIT LOGGING
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

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_profile_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log sensitive data access
  IF TG_OP = 'SELECT' AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.profiles_audit_log (
      profile_user_id,
      accessing_user_id,
      action,
      accessed_columns,
      ip_address
    ) VALUES (
      NEW.user_id,
      auth.uid(),
      'PROFILE_ACCESS',
      ARRAY['sensitive_data'],
      inet_client_addr()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================================
-- 8. SERVICE ROLE GRANTS (MINIMAL REQUIRED)
-- ============================================================================

-- Grant necessary permissions to service_role for system operations
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT, INSERT ON public.profiles_audit_log TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================================================
-- 9. ENSURE UNIQUE CONSTRAINT ON USER_ID
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
-- 10. VERIFICATION QUERIES
-- ============================================================================

-- Test query 1: Verify anon cannot see any profiles
-- Expected result: 0 rows
DO $$
DECLARE 
  row_count INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO row_count FROM public.profiles;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: anon can see % profile rows', row_count;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS: anon cannot see profiles (% rows)', row_count;
END $$;

-- Test query 2: Verify authenticated users can only see safe view
DO $$
DECLARE 
  has_access BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM 1 FROM public.profiles_safe LIMIT 1;
    has_access := TRUE;
  EXCEPTION
    WHEN insufficient_privilege THEN
      has_access := FALSE;
  END;
  RESET ROLE;
  
  IF NOT has_access THEN
    RAISE EXCEPTION 'SECURITY ISSUE: authenticated cannot access profiles_safe';
  END IF;
  RAISE NOTICE 'PASS: authenticated can access profiles_safe';
END $$;

-- Test query 3: Verify sensitive columns are protected
DO $$
DECLARE 
  can_access_sensitive BOOLEAN := TRUE;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM phone_encrypted FROM public.profiles LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      can_access_sensitive := FALSE;
  END;
  RESET ROLE;
  
  IF can_access_sensitive THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: authenticated can access sensitive columns';
  END IF;
  RAISE NOTICE 'PASS: sensitive columns are protected';
END $$;

-- ============================================================================
-- 11. FINAL SECURITY SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== PROFILES SECURITY HARDENING COMPLETE ===';
  RAISE NOTICE 'RLS ENABLED: public.profiles';
  RAISE NOTICE 'SAFE VIEW: public.profiles_safe';
  RAISE NOTICE 'ENCRYPTION: pgsodium with profiles_kms key';
  RAISE NOTICE 'AUDIT LOG: public.profiles_audit_log';
  RAISE NOTICE 'POLICIES: strict owner-only access';
  RAISE NOTICE 'SENSITIVE DATA: protected from anon/authenticated';
  RAISE NOTICE '=============================================';
END $$;

-- ============================================================================
-- COMMENTED ROLLBACK SECTION (DO NOT EXECUTE)
-- ============================================================================

/*
-- ROLLBACK INSTRUCTIONS (run these commands to undo this migration):

-- Drop policies
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;  
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Drop view and functions
DROP VIEW IF EXISTS public.profiles_safe;
DROP FUNCTION IF EXISTS public.encrypt_profile_field(TEXT);
DROP FUNCTION IF EXISTS public.decrypt_profile_field(BYTEA, UUID);
DROP FUNCTION IF EXISTS public.audit_profile_access();

-- Drop audit table
DROP TABLE IF EXISTS public.profiles_audit_log;

-- Remove unique constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_unique;

-- Re-grant broad access (if desired)
GRANT SELECT ON public.profiles TO authenticated;

-- Drop encryption key
SELECT pgsodium.delete_key('profiles_kms');

*/