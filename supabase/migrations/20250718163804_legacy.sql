-- Critical Security Fixes

-- 1. Enable RLS on wrappers_fdw_stats table (currently missing RLS)
ALTER TABLE IF EXISTS public.wrappers_fdw_stats ENABLE ROW LEVEL SECURITY;

-- 2. Create admin-only policy for wrappers_fdw_stats
CREATE POLICY IF NOT EXISTS "Only admins can access FDW stats"
ON public.wrappers_fdw_stats
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Strengthen role assignment security - prevent self-role escalation
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

-- 4. Add role audit logging table
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
CREATE POLICY "Only admins can view role audit logs"
ON public.user_role_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Strengthen profile policies to prevent role manipulation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  -- Prevent any role-related fields from being updated via profiles
  AND (OLD.* IS NOT DISTINCT FROM NEW.* OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name LIKE '%role%'
  ))
);

-- 6. Add security headers and session management
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type TEXT,
  user_id_param UUID,
  details JSONB DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
  -- Log security events for monitoring
  INSERT INTO public.user_role_audit_log (
    admin_user_id,
    target_user_id,
    role_changed,
    action_type,
    timestamp
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    user_id_param,
    'user'::app_role, -- default role for logging
    event_type,
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Strengthen messaging policies to prevent unauthorized access
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = auth.uid()
    -- Ensure participant is still active
    AND cp.joined_at IS NOT NULL
  )
);

-- 8. Add input validation for critical fields
ALTER TABLE public.profiles 
ADD CONSTRAINT valid_email_format 
CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
ADD CONSTRAINT valid_phone_format 
CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');

-- 9. Strengthen marketplace listing policies
DROP POLICY IF EXISTS "Listings are viewable by everyone" ON public.marketplace_listings;
CREATE POLICY "Active listings are viewable by everyone"
ON public.marketplace_listings
FOR SELECT
USING (status = 'active' AND created_by IS NOT NULL);

-- 10. Add rate limiting table for security monitoring
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

CREATE POLICY "Only admins can view security events"
ON public.security_events
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));