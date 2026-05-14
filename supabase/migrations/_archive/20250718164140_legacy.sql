-- Critical Security Fixes (Fixed Constraints)

-- 1. Strengthen role assignment security - prevent self-role escalation
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

-- 2. Add role audit logging table
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

-- 3. Add security events table for monitoring
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

-- 4. Add security logging function
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

-- 5. Strengthen messaging policies to prevent unauthorized access
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
    AND cp.joined_at IS NOT NULL
  )
);

-- 6. Strengthen marketplace listing policies
DROP POLICY IF EXISTS "Listings are viewable by everyone" ON public.marketplace_listings;
CREATE POLICY "Active listings are viewable by everyone"
ON public.marketplace_listings
FOR SELECT
USING (status = 'active' AND created_by IS NOT NULL);

-- 7. Update assign_user_role function to use audit logging
CREATE OR REPLACE FUNCTION public.assign_user_role(target_user_id uuid, new_role app_role, action_type text DEFAULT 'assign'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_admin BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT public.has_role(current_user_id, 'admin') INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can manage user roles';
  END IF;
  
  -- Prevent users from removing their own admin role (safety check)
  IF current_user_id = target_user_id AND new_role != 'admin' AND action_type = 'assign' THEN
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
  
  -- Log the action (enhanced audit trail)
  INSERT INTO public.user_role_audit_log (
    admin_user_id,
    target_user_id,
    role_changed,
    action_type,
    timestamp
  ) VALUES (
    current_user_id,
    target_user_id,
    new_role,
    action_type,
    NOW()
  );
  
  RETURN TRUE;
END;
$$;