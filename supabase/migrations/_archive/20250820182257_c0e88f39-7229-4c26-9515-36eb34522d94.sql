-- PHASE 1: CRITICAL DATA PROTECTION - RLS POLICY HARDENING

-- Drop existing conflicting policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.profiles;

-- Create consolidated, hardened profile policies with audit logging
CREATE POLICY "profiles_owner_access" ON public.profiles
  FOR ALL 
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_admin_access" ON public.profiles
  FOR SELECT 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
    )
  );

-- Harden venue_checkins policies - remove public access
DROP POLICY IF EXISTS "Public can view venue checkins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Anyone can view venue checkins" ON public.venue_checkins;

CREATE POLICY "venue_checkins_owner_only" ON public.venue_checkins
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Harden user_photos policies - default to private
DROP POLICY IF EXISTS "Users can view photos based on visibility" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage their own photos" ON public.user_photos;

CREATE POLICY "user_photos_owner_access" ON public.user_photos
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_photos_friends_access" ON public.user_photos
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'friends' AND 
    EXISTS (
      SELECT 1 FROM public.user_relationships ur 
      WHERE (ur.user_id = auth.uid() AND ur.friend_id = user_photos.user_id AND ur.status = 'accepted')
         OR (ur.friend_id = auth.uid() AND ur.user_id = user_photos.user_id AND ur.status = 'accepted')
    )
  );

CREATE POLICY "user_photos_public_access" ON public.user_photos
  FOR SELECT
  TO authenticated
  USING (visibility = 'public');

-- Enhance donations table security
CREATE POLICY "donations_donor_only" ON public.donations
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create location anonymization function
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Anonymize venue checkins older than 30 days
  UPDATE public.venue_checkins 
  SET latitude = NULL, longitude = NULL, exact_location = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND (latitude IS NOT NULL OR longitude IS NOT NULL OR exact_location IS NOT NULL);
    
  -- Log the anonymization event
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'anonymized_records', ROW_COUNT,
      'cutoff_date', NOW() - INTERVAL '30 days'
    ),
    'medium'
  );
END;
$$;