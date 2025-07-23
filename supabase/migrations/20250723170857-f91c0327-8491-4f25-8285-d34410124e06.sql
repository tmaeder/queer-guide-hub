-- Critical Security Fixes - Phase 1: Database Security

-- 1. Enable RLS on wrappers_fdw_stats table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wrappers_fdw_stats') THEN
    ALTER TABLE public.wrappers_fdw_stats ENABLE ROW LEVEL SECURITY;
    
    -- Create admin-only policy for wrappers_fdw_stats
    DROP POLICY IF EXISTS "Only admins can access FDW stats" ON public.wrappers_fdw_stats;
    CREATE POLICY "Only admins can access FDW stats"
    ON public.wrappers_fdw_stats
    FOR ALL
    TO authenticated
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- 2. Fix function search paths for security functions
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Prevent users from assigning roles to themselves unless they're already admin
  IF NEW.user_id = auth.uid() AND NEW.role IN ('admin', 'moderator') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Cannot assign elevated roles to yourself';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type TEXT,
  user_id_param UUID,
  ip_address_param INET DEFAULT NULL,
  user_agent_param TEXT DEFAULT NULL,
  details JSONB DEFAULT '{}'
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
    ip_address,
    user_agent,
    details
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    event_type,
    ip_address_param,
    user_agent_param,
    details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log sensitive table changes
  PERFORM public.log_security_event(
    TG_OP || '_' || TG_TABLE_NAME,
    auth.uid(),
    NULL,
    NULL,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', now(),
      'record_id', COALESCE(NEW.id, OLD.id)
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Add additional input validation constraints
ALTER TABLE public.profiles 
ADD CONSTRAINT IF NOT EXISTS valid_email_format 
CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE public.profiles
ADD CONSTRAINT IF NOT EXISTS valid_phone_format 
CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');

-- 4. Strengthen content policies
DROP POLICY IF EXISTS "Authors can delete their own content" ON public.community_posts;
CREATE POLICY "Authors can delete their own content"
ON public.community_posts
FOR DELETE
USING (auth.uid() = user_id);

-- 5. Add rate limiting for security events
CREATE TABLE IF NOT EXISTS public.auth_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  last_attempt TIMESTAMP WITH TIME ZONE DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;

-- Only system can manage rate limiting
CREATE POLICY "System manages rate limiting"
ON public.auth_rate_limit
FOR ALL
USING (false)
WITH CHECK (false);