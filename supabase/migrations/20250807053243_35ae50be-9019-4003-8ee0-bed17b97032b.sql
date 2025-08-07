-- CRITICAL SECURITY FIXES IMPLEMENTATION

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

-- 7. Create function to check if user can view sensitive profile data
CREATE OR REPLACE FUNCTION public.can_view_sensitive_profile_data(
  profile_user_id UUID, 
  requesting_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    -- User can always see their own sensitive data
    WHEN profile_user_id = requesting_user_id THEN true
    -- Check if profile owner has made sensitive data public
    WHEN EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = profile_user_id 
      AND privacy_settings->>'sexual_orientation_public' = 'true'
      AND privacy_settings->>'gender_identity_public' = 'true'
    ) THEN true
    -- Admins can view sensitive data
    WHEN public.has_role(requesting_user_id, 'admin') THEN true
    ELSE false
  END;
$$;

-- 8. Add privacy validation trigger
CREATE OR REPLACE FUNCTION public.validate_profile_privacy_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Ensure privacy settings are valid JSON with required keys
  IF NEW.privacy_settings IS NOT NULL THEN
    -- Check that required privacy keys exist
    IF NOT (NEW.privacy_settings ? 'sexual_orientation_public' AND
            NEW.privacy_settings ? 'gender_identity_public' AND
            NEW.privacy_settings ? 'pronouns_public' AND
            NEW.privacy_settings ? 'bio_public' AND
            NEW.privacy_settings ? 'location_public') THEN
      RAISE EXCEPTION 'Privacy settings must include all required fields';
    END IF;
    
    -- Log significant privacy changes
    IF OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
      PERFORM public.log_enhanced_security_event(
        'PRIVACY_SETTINGS_CHANGED',
        auth.uid(),
        jsonb_build_object(
          'old_settings', OLD.privacy_settings,
          'new_settings', NEW.privacy_settings,
          'timestamp', now()
        ),
        'low'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for privacy validation
DROP TRIGGER IF EXISTS validate_privacy_settings_trigger ON public.profiles;
CREATE TRIGGER validate_privacy_settings_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_privacy_update();

-- 9. Add audit trigger for profile changes
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER
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

-- Create trigger for profile audit
DROP TRIGGER IF EXISTS audit_profile_changes_trigger ON public.profiles;
CREATE TRIGGER audit_profile_changes_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_changes();

-- 10. Set default privacy settings for existing profiles
UPDATE public.profiles 
SET privacy_settings = '{
  "sexual_orientation_public": false,
  "gender_identity_public": false,
  "pronouns_public": true,
  "bio_public": true,
  "location_public": true
}'::jsonb
WHERE privacy_settings IS NULL;