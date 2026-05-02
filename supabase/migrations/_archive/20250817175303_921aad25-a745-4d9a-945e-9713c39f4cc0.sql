-- Security Hardening Phase 1: Fix Critical RLS Policy Conflicts
-- Drop existing function that conflicts
DROP FUNCTION IF EXISTS public.check_rate_limit_enhanced(text,integer,integer,text);

-- Drop all existing profiles policies
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- Create single, consolidated RLS policy for profiles
CREATE POLICY "profiles_consolidated_policy" ON public.profiles
FOR ALL USING (
  -- Users can access their own profile
  user_id = auth.uid() 
  OR 
  -- Admins can access with logging
  (
    public.has_role(auth.uid(), 'admin'::app_role) 
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_profile', user_id),
      'high'
    ) IS NOT NULL
  )
  OR
  -- Public profiles for authenticated users
  (
    COALESCE((privacy_settings->>'profile_visibility'), 'private') = 'public'
    AND auth.uid() IS NOT NULL
  )
)
WITH CHECK (
  -- Only allow creating/updating own profile
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

-- Drop all existing venue_checkins policies
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'venue_checkins' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.venue_checkins', pol.policyname);
    END LOOP;
END $$;

-- Create consolidated venue checkins policy
CREATE POLICY "venue_checkins_consolidated_policy" ON public.venue_checkins
FOR ALL USING (
  -- Users can access their own checkins
  user_id = auth.uid()
  OR
  -- Admins with proper logging
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_LOCATION_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_user_checkins', user_id),
      'high'
    ) IS NOT NULL
  )
)
WITH CHECK (
  -- Only allow creating own checkins
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

-- Enhanced rate limiting function with correct signature
CREATE OR REPLACE FUNCTION public.enhanced_rate_limit_check(
  user_identifier text,
  max_requests integer,
  time_window_minutes integer,
  operation_type text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
  rate_key TEXT;
BEGIN
  rate_key := user_identifier || ':' || operation_type;
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = rate_key
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_requests THEN
    -- Log rate limit violation
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'operation', operation_type,
        'identifier', user_identifier,
        'attempts', attempt_count
      ),
      'medium'
    );
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (rate_key, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Automated security cleanup function
CREATE OR REPLACE FUNCTION public.security_data_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Remove old location data (6 months retention)
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  -- Clean rate limit data
  DELETE FROM public.auth_rate_limit 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM public.auth_rate_limit_keys 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- Log cleanup
  PERFORM public.log_enhanced_security_event(
    'AUTOMATED_DATA_CLEANUP',
    NULL,
    jsonb_build_object('cleanup_timestamp', now()),
    'low'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.enhanced_rate_limit_check TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_data_cleanup TO service_role;