-- Critical Security Fix: Minimal changes to resolve conflicts
-- Drop ALL existing problematic functions first
DROP FUNCTION IF EXISTS public.check_rate_limit_enhanced CASCADE;

-- Create minimal security functions
CREATE OR REPLACE FUNCTION public.basic_rate_limit(
  identifier text,
  max_attempts integer DEFAULT 10
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_attempts INTEGER;
BEGIN
  -- Simple rate limiting without complex cleanup
  SELECT COALESCE(attempt_count, 0) INTO current_attempts
  FROM public.auth_rate_limit_keys
  WHERE key = identifier
  AND last_attempt > NOW() - INTERVAL '1 hour';
  
  IF current_attempts >= max_attempts THEN
    RETURN FALSE;
  END IF;
  
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (identifier, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Create security monitoring view
CREATE OR REPLACE VIEW public.security_overview AS
SELECT 
  'profiles'::text as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE privacy_settings->>'profile_visibility' = 'public') as public_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as recent_records
FROM public.profiles
UNION ALL
SELECT 
  'venue_checkins'::text as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as public_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as recent_records
FROM public.venue_checkins;

-- Grant basic permissions
GRANT EXECUTE ON FUNCTION public.basic_rate_limit TO authenticated;
GRANT SELECT ON public.security_overview TO authenticated;