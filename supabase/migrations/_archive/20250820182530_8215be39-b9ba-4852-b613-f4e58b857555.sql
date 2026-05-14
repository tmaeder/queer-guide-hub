-- PHASE 1: CRITICAL DATA PROTECTION - RLS POLICY HARDENING (Corrected)

-- Drop existing conflicting policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Combined SELECT policy for profiles" ON public.profiles;

-- Create consolidated, hardened profile policies
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
DROP POLICY IF EXISTS "Users can manage their own venue checkins" ON public.venue_checkins;

CREATE POLICY "venue_checkins_owner_only" ON public.venue_checkins
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Harden user_photos policies using correct column (is_public)
DROP POLICY IF EXISTS "Users can view photos based on visibility" ON public.user_photos;
DROP POLICY IF EXISTS "Users can manage their own photos" ON public.user_photos;
DROP POLICY IF EXISTS "Users can view their own user photos" ON public.user_photos;
DROP POLICY IF EXISTS "Combined SELECT policy for user_photos" ON public.user_photos;

CREATE POLICY "user_photos_owner_access" ON public.user_photos
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_photos_friends_access" ON public.user_photos
  FOR SELECT
  TO authenticated
  USING (
    is_public = false AND 
    EXISTS (
      SELECT 1 FROM public.user_relationships ur 
      WHERE (ur.user_id = auth.uid() AND ur.friend_id = user_photos.user_id AND ur.status = 'accepted')
         OR (ur.friend_id = auth.uid() AND ur.user_id = user_photos.user_id AND ur.status = 'accepted')
    )
  );

CREATE POLICY "user_photos_public_access" ON public.user_photos
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Enhance donations table security
DROP POLICY IF EXISTS "Users can manage their own donations" ON public.donations;
DROP POLICY IF EXISTS "Users can view their own donations" ON public.donations;

CREATE POLICY "donations_donor_only" ON public.donations
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create enhanced admin access logging function
CREATE OR REPLACE FUNCTION public.audit_admin_data_access(
  p_admin_id uuid,
  p_target_user_id uuid, 
  p_data_type text,
  p_justification text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Verify admin role
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_admin_id AND role = 'admin'::app_role
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RETURN false;
  END IF;
  
  -- Log the access
  PERFORM public.log_enhanced_security_event(
    'ADMIN_DATA_ACCESS',
    p_admin_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'data_type', p_data_type,
      'justification', p_justification,
      'timestamp', NOW()
    ),
    'high'
  );
  
  RETURN true;
END;
$$;

-- Create location anonymization function  
CREATE OR REPLACE FUNCTION public.anonymize_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  records_updated integer := 0;
BEGIN
  -- Anonymize venue checkins older than 30 days
  UPDATE public.venue_checkins 
  SET latitude = NULL, longitude = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND (latitude IS NOT NULL OR longitude IS NOT NULL);
    
  GET DIAGNOSTICS records_updated = ROW_COUNT;
  
  -- Log the anonymization event
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'anonymized_records', records_updated,
      'cutoff_date', NOW() - INTERVAL '30 days'
    ),
    'medium'
  );
END;
$$;