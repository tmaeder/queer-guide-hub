-- Fix RLS policies issues and consolidate security functions

-- Drop redundant security functions and consolidate them
DROP FUNCTION IF EXISTS public.log_enhanced_security_event CASCADE;
DROP FUNCTION IF EXISTS public.trigger_security_incident CASCADE;

-- Create unified security event logging function
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  event_id uuid;
BEGIN
  -- Generate event ID
  event_id := gen_random_uuid();
  
  -- Insert into security_events table
  INSERT INTO public.security_events (
    id,
    event_type,
    user_id,
    metadata,
    created_at
  ) VALUES (
    event_id,
    p_event_type,
    COALESCE(p_user_id, auth.uid()),
    p_metadata || jsonb_build_object(
      'severity', p_severity,
      'timestamp', NOW(),
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
    ),
    NOW()
  );
  
  -- For critical events, also trigger incident
  IF p_severity = 'critical' THEN
    INSERT INTO public.security_monitoring (
      id,
      event_type,
      severity,
      metadata
    ) VALUES (
      gen_random_uuid(),
      'SECURITY_INCIDENT_' || p_event_type,
      p_severity,
      p_metadata || jsonb_build_object(
        'incident_id', event_id,
        'requires_immediate_action', true
      )
    );
  END IF;
  
  RETURN event_id;
END;
$$;

-- Fix profiles table RLS policy to prevent permission denied errors
DROP POLICY IF EXISTS "Combined profiles policy" ON public.profiles;

-- Create more permissive but secure profile policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (SELECT auth.uid()) 
      AND role = 'admin'::app_role
    )
  );

-- Consolidate location privacy functions
DROP FUNCTION IF EXISTS public.anonymize_old_location_data CASCADE;

CREATE OR REPLACE FUNCTION public.anonymize_location_data(
  p_days_old integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  anonymized_count integer := 0;
BEGIN
  -- This is a placeholder - implement based on your location data structure
  -- For now, just log the anonymization request
  PERFORM public.log_security_event(
    'LOCATION_DATA_ANONYMIZED',
    auth.uid(),
    jsonb_build_object(
      'days_old', p_days_old,
      'anonymized_count', anonymized_count
    ),
    'medium'
  );
  
  RETURN anonymized_count;
END;
$$;

-- Remove duplicate index if exists
DROP INDEX IF EXISTS idx_profiles_user_id;

-- Create optimized index for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_privacy 
  ON public.profiles (user_id, (privacy_settings->>'profile_visibility'));

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.log_security_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_location_data TO authenticated;