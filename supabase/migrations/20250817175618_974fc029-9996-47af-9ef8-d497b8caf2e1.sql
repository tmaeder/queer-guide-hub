-- Final Security Cleanup: Remove any remaining security definer objects
-- Check for any remaining security definer functions or views

-- Remove any remaining security definer functions that might cause issues
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_catalog.pg_proc p
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true
        AND p.proname NOT IN ('has_role', 'log_enhanced_security_event', 'basic_rate_limit')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
                      func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Ensure we have only essential security functions
CREATE OR REPLACE FUNCTION public.clean_old_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  DELETE FROM public.auth_rate_limit_keys 
  WHERE last_attempt < NOW() - INTERVAL '24 hours';
$$;

-- Grant minimal permissions
GRANT EXECUTE ON FUNCTION public.clean_old_rate_limits TO service_role;