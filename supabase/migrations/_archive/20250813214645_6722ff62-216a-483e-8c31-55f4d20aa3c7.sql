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
DROP POLICY IF EXISTS "Secure checkins SELECT - users only" ON public.venue_checkins;
DROP POLICY IF EXISTS "Secure checkins INSERT - users only" ON public.venue_checkins;
DROP POLICY IF EXISTS "Secure checkins UPDATE - users only" ON public.venue_checkins;
DROP POLICY IF EXISTS "Secure checkins DELETE - users only" ON public.venue_checkins;

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