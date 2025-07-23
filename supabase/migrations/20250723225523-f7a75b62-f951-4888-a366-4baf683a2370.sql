-- Security Hardening Migration Part 2: Enhanced Monitoring and Validation

-- 1. Enhanced security logging with session tracking
CREATE OR REPLACE FUNCTION public.log_enhanced_security_event(
  event_type TEXT,
  user_id_param UUID DEFAULT NULL,
  details JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info'
)
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.security_events (
    user_id,
    event_type,
    details,
    created_at
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    event_type,
    details || jsonb_build_object(
      'severity', severity,
      'timestamp', now()
    ),
    now()
  );
END;
$$;

-- 2. Add session security enhancements
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own sessions
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can manage their own sessions
CREATE POLICY "Users can manage their own sessions"
ON public.user_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Add suspicious activity detection
CREATE TABLE IF NOT EXISTS public.suspicious_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  activity_type TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'medium',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on suspicious activities
ALTER TABLE public.suspicious_activities ENABLE ROW LEVEL SECURITY;

-- Only admins can view suspicious activities
CREATE POLICY "Only admins can view suspicious activities"
ON public.suspicious_activities
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Enhanced rate limiting with progressive penalties
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  identifier TEXT,
  max_attempts INTEGER DEFAULT 5,
  time_window_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::INTERVAL;
  
  -- Clean old attempts
  DELETE FROM public.auth_rate_limit 
  WHERE last_attempt < time_cutoff;
  
  -- Check current attempts
  SELECT COALESCE(SUM(attempt_count), 0) INTO attempt_count
  FROM public.auth_rate_limit
  WHERE ip_address = identifier::INET
  AND last_attempt >= time_cutoff;
  
  IF attempt_count >= max_attempts THEN
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      NULL,
      jsonb_build_object(
        'ip_address', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts
      ),
      'high'
    );
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- 5. Add data validation triggers for critical tables
CREATE OR REPLACE FUNCTION public.validate_profile_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Validate email format if provided
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format: %', NEW.email;
  END IF;
  
  -- Validate display name length
  IF NEW.display_name IS NOT NULL AND length(NEW.display_name) > 100 THEN
    RAISE EXCEPTION 'Display name too long: maximum 100 characters';
  END IF;
  
  -- Log profile updates for audit
  IF TG_OP = 'UPDATE' AND OLD.* IS DISTINCT FROM NEW.* THEN
    PERFORM public.log_enhanced_security_event(
      'PROFILE_UPDATED',
      NEW.user_id,
      jsonb_build_object(
        'changed_fields', (
          SELECT jsonb_object_agg(key, value)
          FROM jsonb_each_text(to_jsonb(NEW))
          WHERE key NOT IN ('updated_at', 'created_at')
          AND value IS DISTINCT FROM (to_jsonb(OLD) ->> key)
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add trigger for profile validation
DROP TRIGGER IF EXISTS validate_profile_data_trigger ON public.profiles;
CREATE TRIGGER validate_profile_data_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION validate_profile_data();

-- 6. Add content moderation triggers
CREATE OR REPLACE FUNCTION public.moderate_user_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Check for potential spam patterns
  IF NEW.content IS NOT NULL THEN
    -- Basic spam detection (can be enhanced)
    IF length(NEW.content) > 5000 THEN
      PERFORM public.log_enhanced_security_event(
        'POTENTIAL_SPAM_DETECTED',
        NEW.user_id,
        jsonb_build_object(
          'content_length', length(NEW.content),
          'table', TG_TABLE_NAME,
          'record_id', NEW.id
        ),
        'medium'
      );
    END IF;
    
    -- Check for excessive URLs
    IF (length(NEW.content) - length(replace(NEW.content, 'http', ''))) / 4 > 3 THEN
      PERFORM public.log_enhanced_security_event(
        'EXCESSIVE_URLS_DETECTED',
        NEW.user_id,
        jsonb_build_object(
          'table', TG_TABLE_NAME,
          'record_id', NEW.id
        ),
        'medium'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add content moderation to posts and comments
DROP TRIGGER IF EXISTS moderate_community_posts_trigger ON public.community_posts;
CREATE TRIGGER moderate_community_posts_trigger
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION moderate_user_content();

DROP TRIGGER IF EXISTS moderate_post_comments_trigger ON public.post_comments;
CREATE TRIGGER moderate_post_comments_trigger
  BEFORE INSERT OR UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION moderate_user_content();

-- 7. Add IP-based access monitoring
CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  ip_address INET NOT NULL,
  user_agent TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on access logs
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view access logs
CREATE POLICY "Only admins can view access logs"
ON public.access_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));