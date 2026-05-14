-- Fix the function parameter error by dropping and recreating the function
DROP FUNCTION IF EXISTS public.consolidate_table_policies(text, text);

-- Recreate the function with proper search path
CREATE OR REPLACE FUNCTION public.consolidate_table_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    -- Set search path to empty to prevent search path attacks
    SET search_path = '';
    
    -- Placeholder function for policy consolidation
    -- In a real implementation, this would consolidate multiple policies
    RAISE NOTICE 'Policy consolidation would be implemented here for %.%', schema_name, table_name;
END;
$function$;