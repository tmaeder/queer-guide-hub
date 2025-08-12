-- Strengthen privacy for profiles

-- 1) Enable RLS and add strict policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;

-- Owner can fully manage their own profile
CREATE POLICY "Users can select their own profile"
  ON public.profiles
  FOR SELECT
  USING ((SELECT auth.uid() AS uid) = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid() AS uid) = user_id)
  WITH CHECK ((SELECT auth.uid() AS uid) = user_id);

-- Admins and moderators can manage all profiles
CREATE POLICY "Admins and moderators can manage profiles"
  ON public.profiles
  FOR ALL
  USING (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  );

-- Public can only select rows explicitly marked as public in privacy_settings
-- Assumes privacy_settings JSONB has {"profile_visibility": "public"|"private"|...}
CREATE POLICY "Public can view public profiles only"
  ON public.profiles
  FOR SELECT
  USING ((privacy_settings->>'profile_visibility') = 'public');

-- 2) Create a safe public view with non-sensitive columns only
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
  SELECT 
    user_id,
    display_name,
    avatar_url,
    location,
    bio,
    pronouns,
    interests,
    website,
    created_at,
    last_active_at
  FROM public.profiles
  WHERE (privacy_settings->>'profile_visibility') = 'public';

-- Grant read access to view for anon and authenticated roles
GRANT SELECT ON public.profiles_public TO anon, authenticated;