-- Final fix for remaining Function Search Path Mutable warnings
-- Update the last 5 functions that need proper search_path settings

-- Fix audit functions
CREATE OR REPLACE FUNCTION public.audit_payment_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log payment data access for security audit
  PERFORM public.log_enhanced_security_event(
    'PAYMENT_DATA_ACCESSED',
    auth.uid(),
    jsonb_build_object(
      'payment_id', COALESCE(NEW.id, OLD.id),
      'access_type', 'payment_view',
      'timestamp', now()
    ),
    'medium'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log significant profile changes
  IF OLD.phone IS DISTINCT FROM NEW.phone OR
     OLD.verified_email IS DISTINCT FROM NEW.verified_email OR
     OLD.verified_phone IS DISTINCT FROM NEW.verified_phone OR
     OLD.verified_identity IS DISTINCT FROM NEW.verified_identity THEN
    
    PERFORM public.log_enhanced_security_event(
      'PROFILE_SENSITIVE_UPDATE',
      NEW.user_id,
      jsonb_build_object(
        'changed_fields', jsonb_build_object(
          'phone_changed', OLD.phone IS DISTINCT FROM NEW.phone,
          'email_verification_changed', OLD.verified_email IS DISTINCT FROM NEW.verified_email,
          'phone_verification_changed', OLD.verified_phone IS DISTINCT FROM NEW.verified_phone,
          'identity_verification_changed', OLD.verified_identity IS DISTINCT FROM NEW.verified_identity
        ),
        'timestamp', now()
      ),
      'medium'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log sensitive data changes
  PERFORM public.log_enhanced_security_event(
    'SENSITIVE_DATA_MODIFIED',
    COALESCE(NEW.user_id, OLD.user_id),
    jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'record_id', COALESCE(NEW.id, OLD.id),
      'timestamp', now()
    ),
    'high'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Fix user role management functions that still need search path
CREATE OR REPLACE FUNCTION public.assign_admin_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Only allow existing admins to assign admin roles
  IF NOT public.has_role(current_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can assign admin roles';
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log the action
  PERFORM public.log_enhanced_security_event(
    'ADMIN_ROLE_ASSIGNED',
    current_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'timestamp', now()
    ),
    'high'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_first_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  target_user_id uuid;
  admin_count integer;
BEGIN
  -- Check if any admins exist
  SELECT COUNT(*) INTO admin_count 
  FROM public.user_roles 
  WHERE role = 'admin'::app_role;
  
  -- Only allow if no admins exist
  IF admin_count > 0 THEN
    RAISE EXCEPTION 'Admin already exists. Use assign_admin_by_id instead.';
  END IF;
  
  -- Get user ID from email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;