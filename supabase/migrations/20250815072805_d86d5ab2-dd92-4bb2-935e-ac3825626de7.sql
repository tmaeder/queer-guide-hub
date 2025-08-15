-- Enhanced Security Fix: Prevent Location-Based Stalking in Venue Check-ins
-- This migration implements stronger privacy controls and location data protection

-- Step 1: Add location privacy and anonymization controls
ALTER TABLE public.venue_checkins 
ADD COLUMN IF NOT EXISTS location_shared_with jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS location_visibility text DEFAULT 'private' CHECK (location_visibility IN ('private', 'friends', 'public')),
ADD COLUMN IF NOT EXISTS approximate_only boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_anonymize_after interval DEFAULT '24 hours'::interval;

-- Step 2: Create function to anonymize location data
CREATE OR REPLACE FUNCTION public.anonymize_location_data(lat numeric, lng numeric, precision_level text DEFAULT 'high')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Different levels of location anonymization
  CASE precision_level
    WHEN 'high' THEN
      -- Reduce precision to ~100m accuracy (3 decimal places)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 3),
        'longitude', ROUND(lng::numeric, 3),
        'precision', 'neighborhood'
      );
    WHEN 'medium' THEN
      -- Reduce precision to ~1km accuracy (2 decimal places)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 2),
        'longitude', ROUND(lng::numeric, 2),
        'precision', 'district'
      );
    WHEN 'low' THEN
      -- Reduce precision to ~10km accuracy (1 decimal place)
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 1),
        'longitude', ROUND(lng::numeric, 1),
        'precision', 'city_area'
      );
    ELSE
      -- Default to high anonymization
      RETURN jsonb_build_object(
        'latitude', ROUND(lat::numeric, 3),
        'longitude', ROUND(lng::numeric, 3),
        'precision', 'neighborhood'
      );
  END CASE;
END;
$$;

-- Step 3: Create function to get secure venue check-in data
CREATE OR REPLACE FUNCTION public.get_secure_venue_checkins(
  target_venue_id uuid DEFAULT NULL,
  requesting_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  venue_id uuid,
  user_id uuid,
  checked_in_at timestamp with time zone,
  location_data jsonb,
  distance_meters numeric,
  is_public boolean,
  can_view_precise_location boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := COALESCE(requesting_user_id, auth.uid());
  
  -- Return venue check-ins with appropriate privacy controls
  RETURN QUERY
  SELECT 
    vc.id,
    vc.venue_id,
    vc.user_id,
    vc.checked_in_at,
    CASE 
      -- User can see their own precise location
      WHEN vc.user_id = current_user_id THEN
        jsonb_build_object(
          'latitude', vc.latitude,
          'longitude', vc.longitude,
          'precision', 'exact'
        )
      -- Friends can see approximate location if public
      WHEN vc.is_public = true AND vc.location_visibility IN ('friends', 'public')
           AND EXISTS (
             SELECT 1 FROM public.user_relationships ur
             WHERE ((ur.user_id = current_user_id AND ur.target_user_id = vc.user_id)
                    OR (ur.user_id = vc.user_id AND ur.target_user_id = current_user_id))
               AND ur.status = 'accepted'
           ) THEN
        public.anonymize_location_data(vc.latitude, vc.longitude, 'high')
      -- Public check-ins show very approximate location only
      WHEN vc.is_public = true AND vc.location_visibility = 'public' THEN
        public.anonymize_location_data(vc.latitude, vc.longitude, 'medium')
      -- Admins can see approximate location for moderation
      WHEN public.has_role(current_user_id, 'admin'::app_role) THEN
        public.anonymize_location_data(vc.latitude, vc.longitude, 'high')
      -- Default: no location data
      ELSE
        jsonb_build_object('latitude', null, 'longitude', null, 'precision', 'hidden')
    END as location_data,
    CASE 
      WHEN vc.user_id = current_user_id THEN vc.distance_meters
      ELSE NULL  -- Never expose precise distance to others
    END as distance_meters,
    COALESCE(vc.is_public, false) as is_public,
    (vc.user_id = current_user_id) as can_view_precise_location
  FROM public.venue_checkins vc
  WHERE (target_venue_id IS NULL OR vc.venue_id = target_venue_id)
    AND (
      -- User can see their own check-ins
      vc.user_id = current_user_id
      -- Or public check-ins from friends
      OR (vc.is_public = true AND EXISTS (
        SELECT 1 FROM public.user_relationships ur
        WHERE ((ur.user_id = current_user_id AND ur.target_user_id = vc.user_id)
               OR (ur.user_id = vc.user_id AND ur.target_user_id = current_user_id))
          AND ur.status = 'accepted'
      ))
      -- Or truly public check-ins (very limited)
      OR (vc.is_public = true AND vc.location_visibility = 'public')
      -- Or admin access for moderation
      OR public.has_role(current_user_id, 'admin'::app_role)
    )
  ORDER BY vc.checked_in_at DESC;
END;
$$;

-- Step 4: Create automatic anonymization function
CREATE OR REPLACE FUNCTION public.auto_anonymize_old_checkins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Anonymize location data for old check-ins based on user preferences
  UPDATE public.venue_checkins
  SET 
    latitude = (public.anonymize_location_data(latitude, longitude, 'medium')->>'latitude')::numeric,
    longitude = (public.anonymize_location_data(latitude, longitude, 'medium')->>'longitude')::numeric,
    anonymized_at = now(),
    location_precision = 'anonymized'
  WHERE anonymized_at IS NULL 
    AND created_at < (now() - COALESCE(auto_anonymize_after, '24 hours'::interval))
    AND approximate_only = true;
    
  -- Log anonymization for audit
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ANONYMIZED',
    NULL,
    jsonb_build_object(
      'records_processed', (SELECT COUNT(*) FROM public.venue_checkins WHERE anonymized_at = now()),
      'timestamp', now()
    ),
    'low'
  );
END;
$$;

-- Step 5: Create trigger to validate check-in privacy settings
CREATE OR REPLACE FUNCTION public.validate_checkin_privacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Ensure privacy defaults are set
  NEW.is_public := COALESCE(NEW.is_public, false);
  NEW.location_visibility := COALESCE(NEW.location_visibility, 'private');
  NEW.approximate_only := COALESCE(NEW.approximate_only, true);
  NEW.auto_anonymize_after := COALESCE(NEW.auto_anonymize_after, '24 hours'::interval);
  NEW.location_shared_with := COALESCE(NEW.location_shared_with, '[]'::jsonb);
  
  -- Log security-sensitive check-in creation
  PERFORM public.log_enhanced_security_event(
    'VENUE_CHECKIN_CREATED',
    NEW.user_id,
    jsonb_build_object(
      'venue_id', NEW.venue_id,
      'is_public', NEW.is_public,
      'location_visibility', NEW.location_visibility,
      'approximate_only', NEW.approximate_only,
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN NEW;
END;
$$;

-- Step 6: Apply the trigger
DROP TRIGGER IF EXISTS validate_checkin_privacy_trigger ON public.venue_checkins;
CREATE TRIGGER validate_checkin_privacy_trigger
  BEFORE INSERT OR UPDATE ON public.venue_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_checkin_privacy();

-- Step 7: Create function for secure distance calculation (without exposing coordinates)
CREATE OR REPLACE FUNCTION public.calculate_secure_venue_distance(
  user_lat numeric,
  user_lng numeric,
  venue_id_param uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  venue_lat numeric;
  venue_lng numeric;
  distance_m numeric;
BEGIN
  -- Get venue coordinates
  SELECT latitude, longitude INTO venue_lat, venue_lng
  FROM public.venues
  WHERE id = venue_id_param;
  
  IF venue_lat IS NULL OR venue_lng IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate distance using Haversine formula
  SELECT (
    6371000 * acos(
      cos(radians(user_lat)) * cos(radians(venue_lat)) *
      cos(radians(venue_lng) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(venue_lat))
    )
  ) INTO distance_m;
  
  RETURN distance_m;
END;
$$;

-- Step 8: Update RLS policies for enhanced security
DROP POLICY IF EXISTS "Enhanced privacy: Users can view their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Enhanced privacy: Friends can view public check-ins with limite" ON public.venue_checkins;
DROP POLICY IF EXISTS "Enhanced privacy: Admins can view check-ins for moderation" ON public.venue_checkins;
DROP POLICY IF EXISTS "Enhanced privacy: Users can create their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Enhanced privacy: Users can update their own check-ins privacy" ON public.venue_checkins;
DROP POLICY IF EXISTS "Enhanced privacy: Users can delete their own check-ins" ON public.venue_checkins;

-- New ultra-secure RLS policies
CREATE POLICY "Ultra-secure: Own check-ins only" ON public.venue_checkins
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Ultra-secure: Friends public check-ins limited" ON public.venue_checkins
  FOR SELECT
  USING (
    is_public = true 
    AND location_visibility IN ('friends', 'public')
    AND EXISTS (
      SELECT 1 FROM public.user_relationships ur
      WHERE ((ur.user_id = (SELECT auth.uid()) AND ur.target_user_id = venue_checkins.user_id)
             OR (ur.user_id = venue_checkins.user_id AND ur.target_user_id = (SELECT auth.uid())))
        AND ur.status = 'accepted'
    )
  );

CREATE POLICY "Ultra-secure: Admin moderation access" ON public.venue_checkins
  FOR SELECT
  USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "Ultra-secure: Users create own check-ins" ON public.venue_checkins
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Ultra-secure: Users manage own check-ins" ON public.venue_checkins
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Ultra-secure: Users delete own check-ins" ON public.venue_checkins
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- Step 9: Create index for performance with privacy
CREATE INDEX IF NOT EXISTS idx_venue_checkins_privacy 
ON public.venue_checkins(user_id, is_public, location_visibility, created_at);

-- Step 10: Set up automatic anonymization job (placeholder for cron-like functionality)
COMMENT ON FUNCTION public.auto_anonymize_old_checkins() IS 
'This function should be called periodically (e.g., daily) to automatically anonymize old check-in location data based on user privacy preferences. Recommended: Set up as a periodic edge function or cron job.';

-- Update existing check-ins with secure defaults
UPDATE public.venue_checkins 
SET 
  is_public = COALESCE(is_public, false),
  location_visibility = COALESCE(location_visibility, 'private'),
  approximate_only = COALESCE(approximate_only, true),
  auto_anonymize_after = COALESCE(auto_anonymize_after, '24 hours'::interval),
  location_shared_with = COALESCE(location_shared_with, '[]'::jsonb)
WHERE is_public IS NULL OR location_visibility IS NULL OR approximate_only IS NULL;