-- Fix function conflicts and implement security fixes

-- Drop existing conflicting function
DROP FUNCTION IF EXISTS public.log_enhanced_security_event(text,uuid,jsonb,text);

-- 1. Create audit log table for role changes
CREATE TABLE IF NOT EXISTS public.user_role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'assign', 'remove'
  role_name app_role NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on audit log
ALTER TABLE public.user_role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access audit logs
DROP POLICY IF EXISTS "Only admins can access role audit logs" ON public.user_role_audit_log;
CREATE POLICY "Only admins can access role audit logs"
ON public.user_role_audit_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Create security events table for comprehensive logging
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on security events
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can access security events
DROP POLICY IF EXISTS "Only admins can access security events" ON public.security_events;
CREATE POLICY "Only admins can access security events"
ON public.security_events
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create enhanced security logging function
CREATE OR REPLACE FUNCTION public.log_enhanced_security_event(
  p_event_type TEXT,
  p_user_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_severity TEXT DEFAULT 'medium'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.security_events (event_type, user_id, metadata, severity)
  VALUES (p_event_type, p_user_id, p_metadata, p_severity);
END;
$$;

-- 4. Create secure role assignment function with audit logging
CREATE OR REPLACE FUNCTION public.assign_user_role(
  p_target_user_id UUID,
  p_role app_role
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  -- Get the current user ID
  v_admin_user_id := auth.uid();
  
  -- Verify admin has permission to assign roles
  IF NOT has_role(v_admin_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Insufficient privileges to assign roles';
  END IF;
  
  -- Prevent self-privilege escalation for admin role
  IF p_role = 'admin'::app_role AND v_admin_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot assign admin role to yourself';
  END IF;
  
  -- Insert or update the role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log the role assignment
  INSERT INTO public.user_role_audit_log (admin_user_id, target_user_id, action, role_name, metadata)
  VALUES (
    v_admin_user_id, 
    p_target_user_id, 
    'assign', 
    p_role,
    jsonb_build_object(
      'timestamp', now(),
      'admin_display_name', (SELECT display_name FROM public.profiles WHERE user_id = v_admin_user_id),
      'target_display_name', (SELECT display_name FROM public.profiles WHERE user_id = p_target_user_id)
    )
  );
  
  -- Log security event
  PERFORM public.log_enhanced_security_event(
    'ROLE_ASSIGNED',
    v_admin_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'role_assigned', p_role,
      'timestamp', now()
    ),
    'high'
  );
END;
$$;

-- 5. Create trigger to prevent role escalation
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Prevent users from inserting admin/moderator roles for themselves
  IF NEW.role IN ('admin'::app_role, 'moderator'::app_role) THEN
    -- Check if current user is admin (only admins can assign these roles)
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Insufficient privileges to assign role: %', NEW.role;
    END IF;
    
    -- Prevent admins from removing their own admin role
    IF TG_OP = 'DELETE' AND OLD.role = 'admin'::app_role AND OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Cannot remove your own admin privileges';
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.user_roles;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- 6. Add privacy settings to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'privacy_settings'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN privacy_settings JSONB DEFAULT '{
      "sexual_orientation_public": false,
      "gender_identity_public": false,
      "pronouns_public": true,
      "bio_public": true,
      "location_public": true
    }'::jsonb;
  END IF;
END
$$;