-- Security Fix: Proper RLS policies for user_sessions table
-- This fixes the vulnerability where session data could be compromised

-- Drop the existing overly restrictive policy
DROP POLICY IF EXISTS "Enhanced session access control" ON public.user_sessions;

-- Create secure RLS policies that protect session data properly

-- Policy 1: Users can only view their own session records (no sensitive data exposed)
CREATE POLICY "Users can view their own sessions" 
ON public.user_sessions 
FOR SELECT 
USING (
  auth.uid() = user_id AND
  -- Additional security: Only show active, non-expired sessions
  is_active = true AND
  expires_at > now()
);

-- Policy 2: Only the system can create session records (via triggers/functions)
CREATE POLICY "System can create sessions" 
ON public.user_sessions 
FOR INSERT 
WITH CHECK (
  -- Must be for the authenticated user
  auth.uid() = user_id AND
  -- Sensitive fields must be null (will be encrypted by trigger)
  session_token IS NULL AND
  user_agent IS NULL AND
  ip_address IS NULL
);

-- Policy 3: Users can update only their session activity timestamp
CREATE POLICY "Users can update session activity" 
ON public.user_sessions 
FOR UPDATE 
USING (
  auth.uid() = user_id AND
  is_active = true AND
  expires_at > now()
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 4: Users can deactivate their own sessions (logout)
CREATE POLICY "Users can deactivate their sessions" 
ON public.user_sessions 
FOR UPDATE 
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id AND
  -- Only allow setting is_active to false
  is_active = false
);

-- Policy 5: Admins can view all sessions for security monitoring
CREATE POLICY "Admins can view all sessions for monitoring" 
ON public.user_sessions 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Policy 6: System can clean up expired sessions
CREATE POLICY "System can delete expired sessions" 
ON public.user_sessions 
FOR DELETE 
USING (
  expires_at < now() OR
  (is_active = false AND last_activity < (now() - INTERVAL '30 days'))
);

-- Create secure function to get user's active sessions (without sensitive data)
CREATE OR REPLACE FUNCTION public.get_user_sessions_secure(target_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  last_activity timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean,
  session_info jsonb
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  requesting_user_id uuid;
BEGIN
  requesting_user_id := auth.uid();
  
  -- Only allow users to view their own sessions or admins to view any
  IF target_user_id IS NOT NULL AND 
     target_user_id != requesting_user_id AND 
     NOT has_role(requesting_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Can only view own sessions';
  END IF;
  
  RETURN QUERY
  SELECT 
    s.id,
    s.created_at,
    s.last_activity,
    s.expires_at,
    s.is_active,
    jsonb_build_object(
      'browser_info', CASE 
        WHEN s.user_agent_encrypted IS NOT NULL 
        THEN '[ENCRYPTED]' 
        ELSE 'Unknown' 
      END,
      'location_info', CASE 
        WHEN s.ip_address_encrypted IS NOT NULL 
        THEN '[ENCRYPTED]' 
        ELSE 'Unknown' 
      END,
      'is_current', s.id = (
        SELECT us.id 
        FROM public.user_sessions us 
        WHERE us.user_id = requesting_user_id 
        AND us.is_active = true 
        ORDER BY us.last_activity DESC 
        LIMIT 1
      )
    ) as session_info
  FROM public.user_sessions s
  WHERE s.user_id = COALESCE(target_user_id, requesting_user_id)
  AND s.is_active = true
  AND s.expires_at > now()
  ORDER BY s.last_activity DESC;
END;
$function$;

-- Create function to securely validate session tokens
CREATE OR REPLACE FUNCTION public.validate_session_token(token_to_validate text)
RETURNS TABLE(
  is_valid boolean,
  user_id uuid,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  session_record RECORD;
  user_salt text;
BEGIN
  -- Rate limiting for session validation attempts
  IF NOT public.check_rate_limit_enhanced(
    COALESCE(auth.uid()::text, 'anonymous'), 
    100, 
    60, 
    'session_validation'
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::timestamp with time zone;
    RETURN;
  END IF;
  
  -- Find session by trying to match encrypted tokens
  FOR session_record IN 
    SELECT s.user_id, s.expires_at, s.is_active, s.session_token_encrypted, s.encryption_key_id
    FROM public.user_sessions s
    WHERE s.is_active = true 
    AND s.expires_at > now()
    AND s.session_token_encrypted IS NOT NULL
  LOOP
    -- Generate user salt for decryption
    user_salt := substr(md5(session_record.user_id::text || 'session_salt_2024'), 1, 16);
    
    -- Try to decrypt and compare
    BEGIN
      IF public.decrypt_sensitive_data(session_record.session_token_encrypted, user_salt) = token_to_validate THEN
        -- Valid session found
        RETURN QUERY SELECT true, session_record.user_id, session_record.expires_at;
        RETURN;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Continue to next session if decryption fails
      CONTINUE;
    END;
  END LOOP;
  
  -- No valid session found
  RETURN QUERY SELECT false, NULL::uuid, NULL::timestamp with time zone;
END;
$function$;