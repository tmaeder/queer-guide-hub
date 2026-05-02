-- Security Fix: Drop dependent policies and recreate clean structure
-- Step 1: Drop all policies that depend on the function first

-- Drop all profiles policies that use the function
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles CASCADE', pol.policyname);
    END LOOP;
END $$;

-- Drop the problematic function
DROP FUNCTION IF EXISTS public.check_rate_limit_enhanced(text,integer,integer,text) CASCADE;

-- Create simplified security policies without function dependencies
CREATE POLICY "profiles_secure_access" ON public.profiles
FOR ALL USING (
  -- Users can access their own profile
  user_id = auth.uid() 
  OR 
  -- Admins can access with logging (simplified without rate limiting)
  (
    public.has_role(auth.uid(), 'admin'::app_role) 
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_profile', user_id),
      'high'
    ) IS NOT NULL
  )
)
WITH CHECK (
  -- Only allow creating/updating own profile
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

-- Fix venue_checkins with simplified policy
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'venue_checkins' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.venue_checkins CASCADE', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "venue_checkins_secure_access" ON public.venue_checkins
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

-- Create improved rate limiting function (new name to avoid conflicts)
CREATE OR REPLACE FUNCTION public.security_rate_limit_check(
  user_identifier text,
  max_requests integer,
  time_window_minutes integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = user_identifier
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_requests THEN
    RETURN FALSE;
  END IF;
  
  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (user_identifier, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Enhanced security cleanup function
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
GRANT EXECUTE ON FUNCTION public.security_rate_limit_check TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_data_cleanup TO service_role;