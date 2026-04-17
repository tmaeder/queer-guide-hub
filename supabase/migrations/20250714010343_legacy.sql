-- CRITICAL SECURITY FIX: Fix user_roles RLS policies to prevent privilege escalation

-- Drop the overly permissive policies that allow any authenticated user to manage roles
DROP POLICY IF EXISTS "Authenticated users can manage roles" ON public.user_roles;

-- Create secure, restrictive policies
CREATE POLICY "Users can view their own roles only"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Only existing admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only existing admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create secure function for role assignment with audit logging
CREATE OR REPLACE FUNCTION public.assign_user_role(
  target_user_id UUID,
  new_role app_role,
  action_type TEXT DEFAULT 'assign'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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
  
  -- Log the action (basic audit trail)
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

-- Create audit log table for role changes
CREATE TABLE IF NOT EXISTS public.user_role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  role_changed app_role NOT NULL,
  action_type TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE public.user_role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view role audit logs"
ON public.user_role_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_user_role_audit_target ON public.user_role_audit_log(target_user_id);
CREATE INDEX idx_user_role_audit_timestamp ON public.user_role_audit_log(timestamp DESC);