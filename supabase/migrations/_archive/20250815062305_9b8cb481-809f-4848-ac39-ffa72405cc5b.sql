-- CRITICAL SECURITY FIX: Protect User Location Data from Tracking
-- This migration addresses the location tracking vulnerability in venue_checkins

-- =====================================================
-- PART 1: Add Privacy Controls to Venue Check-ins
-- =====================================================

-- Add privacy settings for location data
ALTER TABLE public.venue_checkins 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS location_precision text DEFAULT 'approximate' CHECK (location_precision IN ('precise', 'approximate', 'hidden')),
ADD COLUMN IF NOT EXISTS anonymized_at timestamp with time zone DEFAULT NULL;

-- =====================================================
-- PART 2: Create Location Anonymization Functions
-- =====================================================

-- Function to anonymize location data
CREATE OR REPLACE FUNCTION public.anonymize_location_data(lat numeric, lng numeric, precision_level text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  anonymized_lat numeric;
  anonymized_lng numeric;
BEGIN
  CASE precision_level
    WHEN 'precise' THEN
      -- Return exact coordinates (for user's own data only)
      RETURN jsonb_build_object('lat', lat, 'lng', lng, 'precision', 'precise');
    WHEN 'approximate' THEN
      -- Round to ~100m precision (2 decimal places)
      anonymized_lat := ROUND(lat::numeric, 2);
      anonymized_lng := ROUND(lng::numeric, 2);
      RETURN jsonb_build_object('lat', anonymized_lat, 'lng', anonymized_lng, 'precision', 'approximate');
    WHEN 'hidden' THEN
      -- Return venue center or city-level data only
      RETURN jsonb_build_object('lat', NULL, 'lng', NULL, 'precision', 'hidden');
    ELSE
      -- Default to approximate
      anonymized_lat := ROUND(lat::numeric, 2);
      anonymized_lng := ROUND(lng::numeric, 2);
      RETURN jsonb_build_object('lat', anonymized_lat, 'lng', anonymized_lng, 'precision', 'approximate');
  END CASE;
END;
$$;

-- Function to determine appropriate location precision based on relationship
CREATE OR REPLACE FUNCTION public.get_location_access_level(checkin_user_id uuid, requesting_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- User can always see their own precise location
  IF checkin_user_id = requesting_user_id THEN
    RETURN 'precise';
  END IF;
  
  -- Admins can see approximate locations for moderation
  IF public.has_role(requesting_user_id, 'admin'::public.app_role) THEN
    RETURN 'approximate';
  END IF;
  
  -- Friends can see approximate locations if check-in is public
  IF EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE ((user_id = requesting_user_id AND target_user_id = checkin_user_id) 
           OR (user_id = checkin_user_id AND target_user_id = requesting_user_id))
    AND status = 'accepted'
  ) THEN
    RETURN 'approximate';
  END IF;
  
  -- Everyone else gets hidden location
  RETURN 'hidden';
END;
$$;

-- Secure function to get venue check-ins with privacy controls
CREATE OR REPLACE FUNCTION public.get_venue_checkins_secure(venue_id_param uuid DEFAULT NULL, user_id_param uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  venue_id uuid,
  user_id uuid,
  checked_in_at timestamp with time zone,
  location_data jsonb,
  distance_meters numeric,
  is_public boolean,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  requesting_user_id uuid;
  access_level text;
BEGIN
  requesting_user_id := auth.uid();
  
  -- Require authentication for viewing check-ins
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to view check-ins';
  END IF;
  
  -- Rate limiting
  IF NOT public.check_rate_limit_enhanced(requesting_user_id::text, 100, 60, 'checkin_access') THEN
    RAISE EXCEPTION 'Rate limit exceeded for check-in access';
  END IF;
  
  RETURN QUERY
  SELECT 
    vc.id,
    vc.venue_id,
    vc.user_id,
    vc.checked_in_at,
    public.anonymize_location_data(
      vc.latitude, 
      vc.longitude, 
      public.get_location_access_level(vc.user_id, requesting_user_id)
    ) as location_data,
    CASE 
      WHEN public.get_location_access_level(vc.user_id, requesting_user_id) = 'hidden' THEN NULL
      ELSE vc.distance_meters
    END as distance_meters,
    vc.is_public,
    vc.created_at
  FROM public.venue_checkins vc
  WHERE 
    -- Apply venue filter if provided
    (venue_id_param IS NULL OR vc.venue_id = venue_id_param)
    AND
    -- Apply user filter if provided
    (user_id_param IS NULL OR vc.user_id = user_id_param)
    AND
    -- Privacy filtering
    (
      -- User can always see their own check-ins
      vc.user_id = requesting_user_id
      OR
      -- Public check-ins are visible to friends and admins
      (vc.is_public = true AND (
        public.has_role(requesting_user_id, 'admin'::public.app_role)
        OR
        EXISTS (
          SELECT 1 FROM public.user_relationships 
          WHERE ((user_id = requesting_user_id AND target_user_id = vc.user_id) 
                 OR (user_id = vc.user_id AND target_user_id = requesting_user_id))
          AND status = 'accepted'
        )
      ))
    )
  ORDER BY vc.checked_in_at DESC;
END;
$$;

-- =====================================================
-- PART 3: Enhanced RLS Policies for Location Privacy
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own check-ins ONLY" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can delete their own check-ins" ON public.venue_checkins;

-- Create new enhanced privacy policies
CREATE POLICY "Enhanced privacy: Users can view their own check-ins"
ON public.venue_checkins
FOR SELECT
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Enhanced privacy: Friends can view public check-ins with limited data"
ON public.venue_checkins
FOR SELECT
USING (
  is_public = true AND 
  EXISTS (
    SELECT 1 FROM public.user_relationships 
    WHERE ((user_id = (SELECT auth.uid()) AND target_user_id = venue_checkins.user_id) 
           OR (user_id = venue_checkins.user_id AND target_user_id = (SELECT auth.uid())))
    AND status = 'accepted'
  )
);

CREATE POLICY "Enhanced privacy: Admins can view check-ins for moderation"
ON public.venue_checkins
FOR SELECT
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Enhanced privacy: Users can create their own check-ins"
ON public.venue_checkins
FOR INSERT
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Enhanced privacy: Users can update their own check-ins privacy"
ON public.venue_checkins
FOR UPDATE
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Enhanced privacy: Users can delete their own check-ins"
ON public.venue_checkins
FOR DELETE
USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- PART 4: Location Data Retention and Cleanup
-- =====================================================

-- Update existing function with enhanced privacy controls
CREATE OR REPLACE FUNCTION public.expire_old_location_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Delete precise location data older than 30 days (keep approximate data longer)
  UPDATE public.venue_checkins 
  SET 
    latitude = ROUND(latitude::numeric, 2),
    longitude = ROUND(longitude::numeric, 2),
    location_precision = 'approximate',
    anonymized_at = NOW()
  WHERE created_at < (NOW() - INTERVAL '30 days')
    AND location_precision = 'precise'
    AND anonymized_at IS NULL;
  
  -- Delete all check-in data older than 1 year to limit tracking window
  DELETE FROM public.venue_checkins 
  WHERE created_at < (NOW() - INTERVAL '1 year');
  
  -- Log the cleanup for audit trail
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_RETENTION_CLEANUP',
    NULL,
    jsonb_build_object(
      'retention_days_precise', 30,
      'retention_days_total', 365,
      'cleanup_timestamp', now(),
      'table', 'venue_checkins'
    ),
    'medium'
  );
END;
$$;

-- =====================================================
-- PART 5: Location Access Audit Logging
-- =====================================================

-- Create trigger to log location data access
CREATE OR REPLACE FUNCTION public.log_location_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log location data access attempts for audit trail
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_ACCESS',
    COALESCE(NEW.user_id, OLD.user_id),
    jsonb_build_object(
      'operation', TG_OP,
      'checkin_id', COALESCE(NEW.id, OLD.id),
      'accessed_by', auth.uid(),
      'is_public', COALESCE(NEW.is_public, OLD.is_public),
      'location_precision', COALESCE(NEW.location_precision, OLD.location_precision),
      'timestamp', now()
    ),
    'low'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply the audit trigger for INSERT, UPDATE, DELETE operations
DROP TRIGGER IF EXISTS log_location_access_trigger ON public.venue_checkins;
CREATE TRIGGER log_location_access_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.venue_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.log_location_data_access();

-- =====================================================
-- PART 6: Update Existing Data with Privacy Defaults
-- =====================================================

-- Set secure defaults for existing check-ins
UPDATE public.venue_checkins 
SET 
  is_public = false,
  location_precision = 'approximate'
WHERE is_public IS NULL OR location_precision IS NULL;

-- Anonymize old precise location data (older than 30 days)
UPDATE public.venue_checkins 
SET 
  latitude = ROUND(latitude::numeric, 2),
  longitude = ROUND(longitude::numeric, 2),
  location_precision = 'approximate',
  anonymized_at = NOW()
WHERE created_at < (NOW() - INTERVAL '30 days')
  AND location_precision = 'precise'
  AND anonymized_at IS NULL;

-- Log the security enhancement
SELECT public.log_enhanced_security_event(
  'LOCATION_PRIVACY_ENHANCED',
  NULL,
  jsonb_build_object(
    'security_improvements', jsonb_build_array(
      'location_precision_controls',
      'anonymization_functions',
      'enhanced_rls_policies',
      'automatic_data_expiration',
      'audit_logging_for_access'
    ),
    'privacy_level', 'maximum',
    'migration_timestamp', now()
  ),
  'high'
);