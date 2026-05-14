-- Security Hardening Migration: Fix Critical RLS Policy Issues (Phase 1)
-- Drop all existing policies first to avoid conflicts

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

-- Create consolidated, secure RLS policies for profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
  -- Users can see their own profile
  user_id = auth.uid() 
  OR 
  -- Admins can see profiles with audit logging
  (
    public.has_role(auth.uid(), 'admin'::app_role) 
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_profile', user_id, 'justification', 'admin_review'),
      'high'
    ) IS NOT NULL
  )
  OR
  -- Public profiles viewable based on privacy settings
  (
    COALESCE((privacy_settings->>'profile_visibility'), 'private') = 'public'
    AND auth.uid() IS NOT NULL
  )
);

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE USING (
  user_id = auth.uid()
  OR
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_PROFILE_UPDATE',
      auth.uid(),
      jsonb_build_object('updated_profile', user_id, 'justification', 'admin_moderation'),
      'high'
    ) IS NOT NULL
  )
);

CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND public.log_enhanced_security_event(
    'ADMIN_PROFILE_DELETE',
    auth.uid(),
    jsonb_build_object('deleted_profile', user_id, 'justification', 'admin_action'),
    'critical'
  ) IS NOT NULL
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

-- Strengthen Location Data Protection
CREATE POLICY "venue_checkins_select_policy" ON public.venue_checkins
FOR SELECT USING (
  user_id = auth.uid()
  OR
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_LOCATION_ACCESS',
      auth.uid(),
      jsonb_build_object('accessed_user_checkins', user_id, 'justification', 'safety_moderation'),
      'high'
    ) IS NOT NULL
  )
  OR
  (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = venue_checkins.user_id 
      AND p.privacy_settings->>'checkins_public' = 'true'
      AND venue_checkins.created_at > NOW() - INTERVAL '7 days'
    )
  )
);

CREATE POLICY "venue_checkins_insert_policy" ON public.venue_checkins
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "venue_checkins_update_policy" ON public.venue_checkins
FOR UPDATE USING (FALSE);

CREATE POLICY "venue_checkins_delete_policy" ON public.venue_checkins
FOR DELETE USING (
  user_id = auth.uid()
  OR
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.log_enhanced_security_event(
      'ADMIN_CHECKIN_DELETE',
      auth.uid(),
      jsonb_build_object('deleted_checkin_user', user_id, 'justification', 'privacy_request'),
      'medium'
    ) IS NOT NULL
  )
);

-- Enhanced Security Functions
CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text,
  max_attempts integer,
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
  rate_key := identifier || ':' || operation_type;
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(attempt_count, 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = rate_key
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'operation', operation_type,
        'identifier', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts
      ),
      'medium'
    );
    RETURN FALSE;
  END IF;
  
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count, last_attempt)
  VALUES (rate_key, 1, now())
  ON CONFLICT (key) 
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();
  
  RETURN TRUE;
END;
$$;

-- Automated Security Data Cleanup
CREATE OR REPLACE FUNCTION public.automated_security_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.venue_checkins 
  WHERE created_at < NOW() - INTERVAL '6 months'
    AND user_id NOT IN (
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    );
    
  DELETE FROM public.auth_rate_limit 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM public.auth_rate_limit_keys 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  PERFORM public.log_enhanced_security_event(
    'AUTOMATED_SECURITY_CLEANUP',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now(),
      'retention_policy', 'enforced'
    ),
    'low'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_rate_limit_enhanced TO authenticated;
GRANT EXECUTE ON FUNCTION public.automated_security_cleanup TO service_role;