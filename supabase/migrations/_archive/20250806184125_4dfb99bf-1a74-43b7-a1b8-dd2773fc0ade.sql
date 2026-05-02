-- Enhanced Session Security and Authentication Monitoring (Fixed)

-- Create session timeout configuration
CREATE TABLE IF NOT EXISTS public.session_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeout_minutes integer NOT NULL DEFAULT 60,
  max_concurrent_sessions integer NOT NULL DEFAULT 3,
  require_reauthentication_minutes integer NOT NULL DEFAULT 1440, -- 24 hours
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on session_config
ALTER TABLE public.session_config ENABLE ROW LEVEL SECURITY;

-- Insert default session configuration
INSERT INTO public.session_config (timeout_minutes, max_concurrent_sessions, require_reauthentication_minutes)
VALUES (60, 3, 1440)
ON CONFLICT DO NOTHING;

-- Create session tracking table with correct column order
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token text NOT NULL,
  ip_address inet NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour'),
  is_active boolean NOT NULL DEFAULT true,
  suspicious_activity boolean NOT NULL DEFAULT false,
  location_data jsonb DEFAULT '{}',
  UNIQUE(session_token)
);

-- Enable RLS on user_sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create failed login attempts tracking
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL, -- email, IP, or user_id
  ip_address inet NOT NULL,
  user_agent text,
  attempt_type text NOT NULL DEFAULT 'password', -- password, passkey, oauth
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked_until timestamp with time zone
);

-- Enable RLS on failed_login_attempts
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance (after tables are created)
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_suspicious ON public.user_sessions(suspicious_activity) WHERE suspicious_activity = true;

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_identifier ON public.failed_login_attempts(identifier);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip ON public.failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_created_at ON public.failed_login_attempts(created_at);

-- Function to check login rate limiting
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(
  p_identifier text,
  p_ip_address inet,
  p_max_attempts integer DEFAULT 5,
  p_time_window_minutes integer DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  ip_attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (p_time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.failed_login_attempts 
  WHERE created_at < time_cutoff;
  
  -- Check identifier-based attempts
  SELECT COUNT(*) INTO attempt_count
  FROM public.failed_login_attempts
  WHERE identifier = p_identifier
  AND created_at >= time_cutoff;
  
  -- Check IP-based attempts
  SELECT COUNT(*) INTO ip_attempt_count
  FROM public.failed_login_attempts
  WHERE ip_address = p_ip_address
  AND created_at >= time_cutoff;
  
  IF attempt_count >= p_max_attempts OR ip_attempt_count >= (p_max_attempts * 2) THEN
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'LOGIN_RATE_LIMIT_EXCEEDED',
      NULL,
      jsonb_build_object(
        'identifier', p_identifier,
        'ip_address', p_ip_address,
        'attempts', attempt_count,
        'ip_attempts', ip_attempt_count,
        'max_attempts', p_max_attempts,
        'timestamp', now()
      ),
      'high'
    );
    
    -- Block for extended period
    INSERT INTO public.failed_login_attempts (identifier, ip_address, blocked_until)
    VALUES (p_identifier, p_ip_address, now() + interval '1 hour');
    
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to record failed login attempt
CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_identifier text,
  p_ip_address inet,
  p_user_agent text DEFAULT NULL,
  p_attempt_type text DEFAULT 'password'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.failed_login_attempts (
    identifier, 
    ip_address, 
    user_agent, 
    attempt_type
  )
  VALUES (
    p_identifier, 
    p_ip_address, 
    p_user_agent, 
    p_attempt_type
  );
  
  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'FAILED_LOGIN_ATTEMPT',
    NULL,
    jsonb_build_object(
      'identifier', p_identifier,
      'ip_address', p_ip_address,
      'user_agent', p_user_agent,
      'attempt_type', p_attempt_type,
      'timestamp', now()
    ),
    'medium'
  );
END;
$$;

-- Function to detect suspicious login patterns
CREATE OR REPLACE FUNCTION public.detect_suspicious_login(
  p_user_id uuid,
  p_ip_address inet,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  recent_ips inet[];
  is_suspicious boolean := false;
  session_count integer;
BEGIN
  -- Check for multiple concurrent sessions
  SELECT COUNT(*) INTO session_count
  FROM public.user_sessions
  WHERE user_id = p_user_id
  AND is_active = true
  AND expires_at > now();
  
  -- Get recent IP addresses (last 30 days)
  SELECT ARRAY_AGG(DISTINCT ip_address) INTO recent_ips
  FROM public.user_sessions
  WHERE user_id = p_user_id
  AND created_at >= now() - interval '30 days'
  AND ip_address != p_ip_address;
  
  -- Check if this IP is completely new for this user
  IF recent_ips IS NOT NULL AND array_length(recent_ips, 1) > 0 AND 
     NOT (p_ip_address = ANY(recent_ips)) THEN
    is_suspicious := true;
  END IF;
  
  -- Check for too many concurrent sessions
  IF session_count >= 5 THEN
    is_suspicious := true;
  END IF;
  
  -- Log suspicious activity if detected
  IF is_suspicious THEN
    PERFORM public.log_enhanced_security_event(
      'SUSPICIOUS_LOGIN_DETECTED',
      p_user_id,
      jsonb_build_object(
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'concurrent_sessions', session_count,
        'is_new_ip', NOT (p_ip_address = ANY(recent_ips)),
        'recent_ip_count', COALESCE(array_length(recent_ips, 1), 0),
        'timestamp', now()
      ),
      'high'
    );
  END IF;
  
  RETURN is_suspicious;
END;
$$;

-- Function to create secure session
CREATE OR REPLACE FUNCTION public.create_secure_session(
  p_user_id uuid,
  p_session_token text,
  p_ip_address inet,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  session_id uuid;
  config_timeout integer;
  is_suspicious boolean;
BEGIN
  -- Get session timeout from config
  SELECT timeout_minutes INTO config_timeout
  FROM public.session_config
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF config_timeout IS NULL THEN
    config_timeout := 60; -- Default 1 hour
  END IF;
  
  -- Detect suspicious activity
  is_suspicious := public.detect_suspicious_login(p_user_id, p_ip_address, p_user_agent);
  
  -- Clean up old sessions for this user
  UPDATE public.user_sessions
  SET is_active = false
  WHERE user_id = p_user_id
  AND (expires_at < now() OR NOT is_active);
  
  -- Create new session
  INSERT INTO public.user_sessions (
    user_id,
    session_token,
    ip_address,
    user_agent,
    expires_at,
    suspicious_activity
  )
  VALUES (
    p_user_id,
    p_session_token,
    p_ip_address,
    p_user_agent,
    now() + (config_timeout || ' minutes')::interval,
    is_suspicious
  )
  RETURNING id INTO session_id;
  
  -- Log session creation
  PERFORM public.log_enhanced_security_event(
    'SESSION_CREATED',
    p_user_id,
    jsonb_build_object(
      'session_id', session_id,
      'ip_address', p_ip_address,
      'user_agent', p_user_agent,
      'suspicious_activity', is_suspicious,
      'expires_at', now() + (config_timeout || ' minutes')::interval,
      'timestamp', now()
    ),
    CASE WHEN is_suspicious THEN 'high' ELSE 'low' END
  );
  
  RETURN session_id;
END;
$$;

-- Trigger to automatically update last_activity
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.last_activity = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_session_activity_trigger
BEFORE UPDATE ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_session_activity();

-- RLS Policies
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own sessions" ON public.user_sessions
FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "System can manage sessions" ON public.user_sessions
FOR ALL USING (true);

CREATE POLICY "Admins can view session config" ON public.session_config
FOR SELECT USING (has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "Admins can manage session config" ON public.session_config
FOR ALL USING (has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "Admins can view failed login attempts" ON public.failed_login_attempts
FOR SELECT USING (has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "System can manage failed login attempts" ON public.failed_login_attempts
FOR ALL USING (true);