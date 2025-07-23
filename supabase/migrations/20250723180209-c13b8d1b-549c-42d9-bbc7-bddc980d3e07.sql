-- Security Fix: Update remaining functions to include proper search paths

-- Fix log_security_event function (overloaded version)
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type TEXT,
  user_id_param UUID,
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
    details
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    event_type,
    details
  );
END;
$$;

-- Fix assign_user_role function 
CREATE OR REPLACE FUNCTION public.assign_user_role(
  target_user_id uuid, 
  new_role app_role, 
  action_type text DEFAULT 'assign'
)
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
  
  -- Enhanced audit logging
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

-- Add additional constraint to security_events table for better validation
ALTER TABLE public.security_events 
ADD CONSTRAINT IF NOT EXISTS valid_event_type_not_empty 
CHECK (event_type IS NOT NULL AND trim(event_type) != '');

-- Add index for better performance on security event queries
CREATE INDEX IF NOT EXISTS idx_security_events_user_id_event_type 
ON public.security_events(user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at 
ON public.security_events(created_at DESC);

-- Strengthen user_role_audit_log table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_role_audit_log') THEN
    -- Add constraint to ensure admin_user_id is not null
    ALTER TABLE public.user_role_audit_log 
    ADD CONSTRAINT IF NOT EXISTS valid_admin_user_id 
    CHECK (admin_user_id IS NOT NULL);
    
    -- Add index for audit log performance
    CREATE INDEX IF NOT EXISTS idx_user_role_audit_admin_user 
    ON public.user_role_audit_log(admin_user_id);
    
    CREATE INDEX IF NOT EXISTS idx_user_role_audit_target_user 
    ON public.user_role_audit_log(target_user_id);
  END IF;
END $$;