-- Fix the RLS policy that's causing the 400 error
-- The issue is profile_visibility is stored as string "public" not boolean true

-- Drop and recreate the problematic policy
DROP POLICY IF EXISTS "profile_public_basic_info" ON public.profiles;

-- Create corrected policy that handles string values properly
CREATE POLICY "profile_public_basic_info" ON public.profiles
FOR SELECT TO public
USING (
  auth.uid() != user_id 
  AND (
    (privacy_settings->>'profile_visibility') = 'public'
    OR COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  )
  AND user_id IS NOT NULL
);

-- Also create a more permissive policy for authenticated users to browse profiles
CREATE POLICY "profile_authenticated_browse" ON public.profiles  
FOR SELECT TO authenticated
USING (
  auth.uid() != user_id 
  AND (
    (privacy_settings->>'profile_visibility') = 'public'
    OR COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  )
);