-- Critical Security Fixes - Phase 1: Database Security (Final Fix)

-- 1. Fix function search paths for security functions
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

-- 2. Add input validation constraints (fixed syntax)
DO $$
BEGIN
  -- Add email validation constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' AND constraint_name = 'valid_email_format'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_email_format 
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;

  -- Add phone validation constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' AND constraint_name = 'valid_phone_format'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT valid_phone_format 
    CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');
  END IF;

  -- Add event type validation constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'security_events' AND constraint_name = 'valid_event_type'
  ) THEN
    ALTER TABLE public.security_events 
    ADD CONSTRAINT valid_event_type 
    CHECK (event_type IS NOT NULL AND length(event_type) > 0);
  END IF;
END $$;

-- 3. Add rate limiting table for security monitoring
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
DROP POLICY IF EXISTS "System manages rate limiting" ON public.auth_rate_limit;
CREATE POLICY "System manages rate limiting"
ON public.auth_rate_limit
FOR ALL
USING (false)
WITH CHECK (false);

-- 4. Add enhanced security monitoring for sensitive operations
CREATE OR REPLACE FUNCTION public.enhanced_audit_profile_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log significant profile changes with enhanced detail
  IF OLD.verified_email IS DISTINCT FROM NEW.verified_email OR
     OLD.verified_phone IS DISTINCT FROM NEW.verified_phone OR
     OLD.email IS DISTINCT FROM NEW.email OR
     OLD.phone IS DISTINCT FROM NEW.phone THEN
    
    PERFORM public.log_security_event(
      'PROFILE_SENSITIVE_UPDATE',
      NEW.user_id,
      NULL,
      NULL,
      jsonb_build_object(
        'changed_fields', jsonb_build_object(
          'email_changed', OLD.email IS DISTINCT FROM NEW.email,
          'phone_changed', OLD.phone IS DISTINCT FROM NEW.phone,
          'email_verification_changed', OLD.verified_email IS DISTINCT FROM NEW.verified_email,
          'phone_verification_changed', OLD.verified_phone IS DISTINCT FROM NEW.verified_phone
        ),
        'timestamp', now(),
        'user_id', NEW.user_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add trigger for enhanced profile monitoring
DROP TRIGGER IF EXISTS enhanced_profile_changes_trigger ON public.profiles;
CREATE TRIGGER enhanced_profile_changes_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW 
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION enhanced_audit_profile_changes();