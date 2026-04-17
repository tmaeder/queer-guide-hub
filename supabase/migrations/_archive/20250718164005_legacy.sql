-- Critical Security Fixes (Fixed Syntax)

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

-- 2. Strengthen role assignment security - prevent self-role escalation
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent users from assigning roles to themselves unless they're already admin
  IF NEW.user_id = auth.uid() AND NEW.role IN ('admin', 'moderator') THEN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Cannot assign elevated roles to yourself';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to prevent role escalation
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.user_roles;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();

-- 3. Add role audit logging table
CREATE TABLE IF NOT EXISTS public.user_role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  role_changed app_role NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('assign', 'remove')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- Enable RLS on audit log
ALTER TABLE public.user_role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
DROP POLICY IF EXISTS "Only admins can view role audit logs" ON public.user_role_audit_log;
CREATE POLICY "Only admins can view role audit logs"
ON public.user_role_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Add security events table for monitoring
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_type TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view security events" ON public.security_events;
CREATE POLICY "Only admins can view security events"
ON public.security_events
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Add security logging function
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type TEXT,
  user_id_param UUID,
  details JSONB DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.security_events (
    user_id,
    event_type,
    details
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    event_type,
    details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;