-- CRITICAL SECURITY FIX: Clean up and implement secure RLS policies
-- Remove all existing overlapping policies and create single secure policies

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