-- Fix all function search path security issues
-- Query existing functions that need search_path set
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM 
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE 
    n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
        SELECT 1 
        FROM pg_proc_config c 
        WHERE c.oid = p.oid 
        AND c.setting[1] LIKE 'search_path%'
    );

-- Fix specific functions that may be missing search_path
ALTER FUNCTION public.validate_import_data(UUID, JSONB) SET search_path = '';
ALTER FUNCTION public.get_import_statistics(UUID) SET search_path = '';