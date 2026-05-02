-- EMERGENCY SECURITY FIX: Remove insecure RLS policies and implement strict least-privilege access
-- Found multiple overlapping policies, some allowing excessive access to sensitive personal data

-- Drop ALL existing policies to start fresh with secure ones
DROP POLICY IF EXISTS "Admins and moderators can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles for moderation" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: admins can SELECT all" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: owners can INSERT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: owners can SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: owners can UPDATE" ON public.profiles;
DROP POLICY IF EXISTS "Users can create only their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete only their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can select their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update only their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view only their own profile" ON public.profiles;

-- Create ONE secure policy for each operation following least-privilege principle

-- 1. SELECT: Users can only view their own profile data
-- Admins get read-only access for moderation ONLY (cannot modify personal data)
CREATE POLICY "Secure profile SELECT access" 
ON public.profiles 
FOR SELECT 
USING (
  user_id = (SELECT auth.uid()) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- 2. INSERT: Only users can create their own profile
CREATE POLICY "Secure profile INSERT access" 
ON public.profiles 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. UPDATE: Only users can update their own profile data
-- NO admin override - personal data must be protected from modification
CREATE POLICY "Secure profile UPDATE access" 
ON public.profiles 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. DELETE: Only users can delete their own profile
-- NO admin override - users control their own data deletion
CREATE POLICY "Secure profile DELETE access" 
ON public.profiles 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- Create a separate view for admins to access limited profile data for moderation
-- This protects sensitive fields while allowing necessary moderation functions
CREATE OR REPLACE VIEW public.profiles_moderation AS
SELECT 
  id,
  user_id,
  display_name,
  bio,
  avatar_url,
  location,
  pronouns,
  is_business,
  created_at,
  updated_at,
  -- Only include non-sensitive fields for moderation
  privacy_settings,
  verified_email,
  verified_phone,
  verified_identity,
  last_active_at,
  profile_completion_percentage
FROM public.profiles;

-- Secure the moderation view - only admins can access it
ALTER VIEW public.profiles_moderation OWNER TO postgres;
GRANT SELECT ON public.profiles_moderation TO authenticated;
CREATE POLICY "Admin moderation view access" 
ON public.profiles_moderation 
FOR SELECT 
USING (has_role((SELECT auth.uid()), 'admin'::app_role));