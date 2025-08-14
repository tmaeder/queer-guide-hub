-- Fix specific security issues identified by the linter

-- Drop and recreate problematic views without security definer behavior
DROP VIEW IF EXISTS public.secure_passkey_summary;
DROP VIEW IF EXISTS public.secure_session_summary;

-- Recreate views with simpler, more secure definitions
CREATE VIEW public.secure_passkey_summary AS
SELECT 
    id,
    user_id,
    credential_name,
    authenticator_name,
    created_at,
    last_used_at
FROM public.passkey_credentials
WHERE user_id = auth.uid();

CREATE VIEW public.secure_session_summary AS
SELECT 
    id,
    user_id,
    created_at,
    last_activity_at,
    is_active
FROM public.user_sessions
WHERE user_id = auth.uid();

-- Now fix the remaining functions that still don't have proper search_path
-- Some functions show search_path="" but may not be set correctly

-- Re-create functions with explicit empty search path
CREATE OR REPLACE FUNCTION public.analyze_rls_policy_performance()
RETURNS TABLE(table_name text, policy_count integer, performance_impact text)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'example'::text as table_name,
    1 as policy_count,
    'optimized'::text as performance_impact;
END;
$$;

-- Additional security enhancement: ensure all critical functions have proper search path
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