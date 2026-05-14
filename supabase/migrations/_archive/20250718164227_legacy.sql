-- Fix remaining security issues identified by linter

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

-- 2. Enable RLS on any missing tables identified by linter
-- Check if tag_usage_summary needs RLS
ALTER TABLE IF EXISTS public.tag_usage_summary ENABLE ROW LEVEL SECURITY;

-- Add policy for tag_usage_summary if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tag_usage_summary') THEN
    DROP POLICY IF EXISTS "Tag usage summary is publicly viewable" ON public.tag_usage_summary;
    CREATE POLICY "Tag usage summary is publicly viewable"
    ON public.tag_usage_summary
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- 3. Add additional security monitoring
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
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', now()
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add audit triggers for sensitive tables
DROP TRIGGER IF EXISTS audit_user_roles_changes ON public.user_roles;
CREATE TRIGGER audit_user_roles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION audit_sensitive_changes();

DROP TRIGGER IF EXISTS audit_profile_changes ON public.profiles;
CREATE TRIGGER audit_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW 
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION audit_sensitive_changes();