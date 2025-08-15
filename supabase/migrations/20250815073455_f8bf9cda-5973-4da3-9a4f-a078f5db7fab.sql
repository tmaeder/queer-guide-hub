-- Fix remaining functions with search path issues
-- Update the validate_checkin_privacy function that was missing SET search_path

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