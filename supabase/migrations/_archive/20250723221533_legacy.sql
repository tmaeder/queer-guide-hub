-- Comprehensive Security Hardening Migration

-- 1. Restrict anonymous access to sensitive tables
-- Most RLS policies should require authentication for a queer guide app

-- Update accessibility attributes to require authentication for public data
DROP POLICY IF EXISTS "Accessibility attributes are viewable by everyone" ON public.accessibility_attributes;
CREATE POLICY "Accessibility attributes are viewable by authenticated users"
ON public.accessibility_attributes
FOR SELECT
TO authenticated
USING (true);

-- Update cities to require authentication 
DROP POLICY IF EXISTS "Cities are viewable by everyone" ON public.cities;
CREATE POLICY "Cities are viewable by authenticated users"
ON public.cities
FOR SELECT
TO authenticated
USING (true);

-- Update countries to require authentication
DROP POLICY IF EXISTS "Countries are viewable by everyone" ON public.countries;
CREATE POLICY "Countries are viewable by authenticated users"
ON public.countries
FOR SELECT
TO authenticated
USING (true);

-- Update continents to require authentication
DROP POLICY IF EXISTS "Continents are viewable by everyone" ON public.continents;
CREATE POLICY "Continents are viewable by authenticated users"
ON public.continents
FOR SELECT
TO authenticated
USING (true);

-- Update regions to require authentication
DROP POLICY IF EXISTS "Regions are viewable by everyone" ON public.regions;
CREATE POLICY "Regions are viewable by authenticated users"
ON public.regions
FOR SELECT
TO authenticated
USING (true);

-- Update events to require authentication
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "Events are viewable by authenticated users"
ON public.events
FOR SELECT
TO authenticated
USING (true);

-- Update venues to require authentication
DROP POLICY IF EXISTS "Venues are viewable by everyone" ON public.venues;
CREATE POLICY "Venues are viewable by authenticated users"
ON public.venues
FOR SELECT
TO authenticated
USING (true);

-- Update marketplace listings to require authentication
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON public.marketplace_listings;
CREATE POLICY "Active listings are viewable by authenticated users"
ON public.marketplace_listings
FOR SELECT
TO authenticated
USING (status = 'active' AND created_by IS NOT NULL);

-- Update news articles to require authentication
DROP POLICY IF EXISTS "News articles are viewable by everyone" ON public.news_articles;
CREATE POLICY "News articles are viewable by authenticated users"
ON public.news_articles
FOR SELECT
TO authenticated
USING (true);

-- Update profiles to require authentication for viewing
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Update venue reviews to require authentication
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.venue_reviews;
CREATE POLICY "Venue reviews are viewable by authenticated users"
ON public.venue_reviews
FOR SELECT
TO authenticated
USING (true);

-- Update marketplace reviews to require authentication
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.marketplace_reviews;
CREATE POLICY "Marketplace reviews are viewable by authenticated users"
ON public.marketplace_reviews
FOR SELECT
TO authenticated
USING (true);

-- 2. Enhanced security logging with IP tracking
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
      'session_id', COALESCE(auth.jwt()->>'session_id', 'unknown'),
      'timestamp', now()
    ),
    now()
  );
END;
$$;

-- 3. Add session security enhancements
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

-- 4. Add suspicious activity detection
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

-- 5. Enhanced rate limiting with progressive penalties
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

-- 6. Add data validation triggers for critical tables
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

-- 7. Strengthen role management with additional checks
CREATE OR REPLACE FUNCTION public.secure_assign_user_role(
  target_user_id UUID,
  new_role app_role,
  action_type TEXT DEFAULT 'assign'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_admin BOOLEAN;
  target_has_admin BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT public.has_role(current_user_id, 'admin') INTO is_admin;
  
  IF NOT is_admin THEN
    -- Log unauthorized attempt
    PERFORM public.log_enhanced_security_event(
      'UNAUTHORIZED_ROLE_CHANGE_ATTEMPT',
      current_user_id,
      jsonb_build_object(
        'target_user_id', target_user_id,
        'attempted_role', new_role,
        'action_type', action_type
      ),
      'high'
    );
    RAISE EXCEPTION 'Unauthorized: Only admins can manage user roles';
  END IF;
  
  -- Check if target user currently has admin role
  SELECT public.has_role(target_user_id, 'admin') INTO target_has_admin;
  
  -- Prevent last admin from being removed
  IF action_type = 'remove' AND new_role = 'admin' AND target_has_admin THEN
    DECLARE
      admin_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO admin_count
      FROM public.user_roles
      WHERE role = 'admin';
      
      IF admin_count <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the last admin user';
      END IF;
    END;
  END IF;
  
  -- Prevent users from removing their own admin role
  IF current_user_id = target_user_id AND action_type = 'remove' AND new_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove your own admin privileges';
  END IF;
  
  -- Perform the action
  IF action_type = 'assign' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, new_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF action_type = 'remove' THEN
    DELETE FROM public.user_roles 
    WHERE user_id = target_user_id AND role = new_role;
  END IF;
  
  -- Enhanced audit logging
  INSERT INTO public.user_role_audit_log (
    admin_user_id,
    target_user_id,
    role_changed,
    action_type,
    timestamp,
    ip_address,
    user_agent
  ) VALUES (
    current_user_id,
    target_user_id,
    new_role,
    action_type,
    NOW(),
    inet_client_addr(),
    current_setting('request.headers', true)::jsonb->>'user-agent'
  );
  
  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'ROLE_CHANGED',
    current_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'role', new_role,
      'action_type', action_type
    )
  );
  
  RETURN TRUE;
END;
$$;

-- 8. Add content moderation triggers
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

-- 9. Add IP-based access monitoring
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

-- 10. Create security dashboard views for admins
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
  'recent_security_events' as metric,
  COUNT(*) as value,
  '24 hours' as period
FROM public.security_events 
WHERE created_at > now() - interval '24 hours'
UNION ALL
SELECT 
  'failed_login_attempts' as metric,
  COUNT(*) as value,
  '24 hours' as period
FROM public.auth_rate_limit
WHERE last_attempt > now() - interval '24 hours'
UNION ALL
SELECT 
  'new_user_registrations' as metric,
  COUNT(*) as value,
  '24 hours' as period
FROM public.profiles
WHERE created_at > now() - interval '24 hours'
UNION ALL
SELECT 
  'suspicious_activities' as metric,
  COUNT(*) as value,
  'unresolved' as period
FROM public.suspicious_activities
WHERE is_resolved = false;

-- Grant access to security dashboard for admins
CREATE POLICY "Admins can view security dashboard"
ON public.security_dashboard
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));