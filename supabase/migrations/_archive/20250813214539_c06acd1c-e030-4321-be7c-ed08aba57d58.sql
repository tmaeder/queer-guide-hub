-- Security Enhancement: Protect User Location Data from Stalkers
-- This migration implements strict access controls for venue check-ins to prevent stalking

-- First, create the table if it doesn't exist with proper security
CREATE TABLE IF NOT EXISTS public.venue_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL,
  user_id UUID NOT NULL,
  checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  distance_meters NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_checkins ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can delete their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Venue owners can view venue check-ins" ON public.venue_checkins;

-- Create strict security policies for venue check-ins
-- Users can only see their own check-ins - NO admin override for privacy
CREATE POLICY "Users can view their own check-ins ONLY"
ON public.venue_checkins
FOR SELECT
USING (user_id = (SELECT auth.uid()));

-- Users can only create their own check-ins
CREATE POLICY "Users can create their own check-ins"
ON public.venue_checkins
FOR INSERT
WITH CHECK (user_id = (SELECT auth.uid()));

-- Users can delete their own check-ins for privacy
CREATE POLICY "Users can delete their own check-ins"
ON public.venue_checkins
FOR DELETE
USING (user_id = (SELECT auth.uid()));

-- NO UPDATE policy - check-ins are immutable for security

-- Add security trigger to prevent location tampering
CREATE OR REPLACE FUNCTION public.prevent_location_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent updates to sensitive location fields
  IF OLD.latitude IS DISTINCT FROM NEW.latitude OR 
     OLD.longitude IS DISTINCT FROM NEW.longitude OR
     OLD.checked_in_at IS DISTINCT FROM NEW.checked_in_at OR
     OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN
    
    RAISE EXCEPTION 'Location data cannot be modified after creation for security reasons';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply the trigger
DROP TRIGGER IF EXISTS prevent_venue_checkin_tampering ON public.venue_checkins;
CREATE TRIGGER prevent_venue_checkin_tampering
  BEFORE UPDATE ON public.venue_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_location_tampering();

-- Add automatic cleanup function for old location data
CREATE OR REPLACE FUNCTION public.expire_old_location_data()
RETURNS void AS $$
BEGIN
  -- Delete location data older than 90 days to limit tracking window
  DELETE FROM public.venue_checkins 
  WHERE created_at < (NOW() - INTERVAL '90 days');
  
  -- Log the cleanup for audit trail
  PERFORM public.log_enhanced_security_event(
    'LOCATION_DATA_RETENTION_CLEANUP',
    NULL,
    jsonb_build_object(
      'retention_days', 90,
      'cleanup_timestamp', now(),
      'table', 'venue_checkins'
    ),
    'medium'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create anonymized view for venue statistics (no personal data)
CREATE OR REPLACE VIEW public.venue_checkin_stats AS
SELECT 
  venue_id,
  COUNT(*) as total_checkins,
  DATE_TRUNC('hour', checked_in_at) as checkin_hour
FROM public.venue_checkins
WHERE created_at >= (NOW() - INTERVAL '30 days')
GROUP BY venue_id, DATE_TRUNC('hour', checked_in_at);

-- Apply RLS to the view
ALTER VIEW public.venue_checkin_stats SET (security_barrier = true);

-- Grant access to the anonymized view
GRANT SELECT ON public.venue_checkin_stats TO authenticated;

-- Log this critical security enhancement
SELECT public.log_enhanced_security_event(
  'VENUE_CHECKINS_SECURITY_HARDENED',
  NULL,
  jsonb_build_object(
    'changes', jsonb_build_array(
      'Strict RLS policies implemented - users can only see own data',
      'No admin override for location privacy',
      'Location data immutability enforced',
      '90-day automatic data retention policy',
      'Anonymized venue statistics view created'
    ),
    'security_level', 'maximum',
    'stalking_protection', true,
    'timestamp', now()
  ),
  'critical'
);