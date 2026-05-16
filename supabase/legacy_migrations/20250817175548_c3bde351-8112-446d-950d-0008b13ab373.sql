-- Clean Security Fix: Remove security definer views properly
-- Drop all existing views that might exist
DROP VIEW IF EXISTS public.profiles_safe CASCADE;
DROP VIEW IF EXISTS public.security_overview CASCADE;
DROP VIEW IF EXISTS public.profiles_public CASCADE;
DROP VIEW IF EXISTS public.admin_security_overview CASCADE;

-- Create clean, standard views without security definer
CREATE VIEW public.safe_profiles AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  created_at,
  updated_at
FROM public.profiles
WHERE privacy_settings->>'profile_visibility' = 'public';

-- Grant basic permissions
GRANT SELECT ON public.safe_profiles TO authenticated;