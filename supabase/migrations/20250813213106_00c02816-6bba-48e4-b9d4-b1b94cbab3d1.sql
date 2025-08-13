-- CRITICAL SECURITY FIX: Protect user location data from tracking and harassment
-- Remove dangerous policy allowing all users to see location data

-- Drop ALL existing policies to implement secure location protection
DROP POLICY IF EXISTS "Authenticated users can create check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "Check-ins viewable by authenticated users" ON public.venue_checkins;
DROP POLICY IF EXISTS "Users can create their own check-ins" ON public.venue_checkins;
DROP POLICY IF EXISTS "checkins delete own" ON public.venue_checkins;
DROP POLICY IF EXISTS "checkins read own" ON public.venue_checkins;
DROP POLICY IF EXISTS "checkins update own" ON public.venue_checkins;

-- Create secure policies following zero-trust location privacy model

-- 1. SELECT: ONLY users can view their own location data - NO exceptions
CREATE POLICY "Secure checkins SELECT - users only" 
ON public.venue_checkins 
FOR SELECT 
USING (user_id = (SELECT auth.uid()));

-- 2. INSERT: Users can only create their own check-ins with mandatory user validation
CREATE POLICY "Secure checkins INSERT - users only" 
ON public.venue_checkins 
FOR INSERT 
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. UPDATE: Users can only update their own check-ins (limited to non-location fields)
CREATE POLICY "Secure checkins UPDATE - users only" 
ON public.venue_checkins 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. DELETE: Users can only delete their own check-ins
CREATE POLICY "Secure checkins DELETE - users only" 
ON public.venue_checkins 
FOR DELETE 
USING (user_id = (SELECT auth.uid()));

-- Add performance index for secure queries
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user_id ON public.venue_checkins(user_id);

-- Create function to automatically expire old location data (privacy protection)
CREATE OR REPLACE FUNCTION expire_old_location_data()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Add trigger to prevent modification of location coordinates after creation
-- This prevents tampering with location evidence
CREATE OR REPLACE FUNCTION prevent_location_tampering()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Apply location tampering prevention
DROP TRIGGER IF EXISTS prevent_location_tampering_trigger ON public.venue_checkins;
CREATE TRIGGER prevent_location_tampering_trigger
  BEFORE UPDATE ON public.venue_checkins
  FOR EACH ROW
  EXECUTE FUNCTION prevent_location_tampering();

-- Add constraint to ensure user_id is never null (critical for security)
ALTER TABLE public.venue_checkins 
ALTER COLUMN user_id SET NOT NULL;