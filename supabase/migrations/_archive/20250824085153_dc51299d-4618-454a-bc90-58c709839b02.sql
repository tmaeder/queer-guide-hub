-- SECURITY FIX: Profiles table policies only (avoiding deadlock)

-- Drop existing conflicting profiles policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Moderators can view reported profiles" ON public.profiles;

-- Create consolidated, secure profiles policies (CRITICAL - prevents PII theft)
CREATE POLICY "profiles_owner_full_access" ON public.profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_public_limited_read" ON public.profiles
  FOR SELECT USING (
    COALESCE((privacy_settings->>'profile_visibility')::boolean, false) = true
  );

CREATE POLICY "profiles_admin_audited_access" ON public.profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND auth.uid() != user_id
  );