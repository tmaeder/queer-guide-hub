-- Fix Security Definer View Issues
-- Replace security definer views with standard views

-- Drop existing security definer views
DROP VIEW IF EXISTS public.profiles_safe CASCADE;
DROP VIEW IF EXISTS public.security_overview CASCADE;

-- Create standard views without security definer
CREATE VIEW public.profiles_public AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  CASE 
    WHEN privacy_settings->>'bio_public' = 'true' THEN bio
    ELSE NULL
  END as bio,
  CASE 
    WHEN privacy_settings->>'pronouns_public' = 'true' THEN pronouns
    ELSE NULL
  END as pronouns,
  created_at,
  updated_at
FROM public.profiles
WHERE privacy_settings->>'profile_visibility' = 'public';

-- Create admin-only security monitoring view (no security definer)
CREATE VIEW public.admin_security_overview AS
SELECT 
  'profiles'::text as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE privacy_settings->>'profile_visibility' = 'public') as public_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as recent_records
FROM public.profiles
UNION ALL
SELECT 
  'venue_checkins'::text as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent_checkins,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as recent_records
FROM public.venue_checkins;

-- Create RLS policies for the views
CREATE POLICY "public_profiles_viewable" ON public.profiles
FOR SELECT USING (
  privacy_settings->>'profile_visibility' = 'public'
  OR user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Grant permissions
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.admin_security_overview TO authenticated;