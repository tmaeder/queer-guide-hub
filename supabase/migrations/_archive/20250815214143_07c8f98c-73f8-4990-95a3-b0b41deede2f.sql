-- Fix function search path security issue using correct PostgreSQL system tables
-- This ensures functions have a secure search path set

DO $$
DECLARE
    func_record RECORD;
    func_sql TEXT;
BEGIN
    -- Loop through functions that need search_path set
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as function_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND NOT (p.proconfig && ARRAY['search_path'])
        AND p.proname IN (
            'increment_personality_views',
            'update_import_jobs_updated_at'
        )
    LOOP
        -- Update each function to have a secure search_path
        func_sql := format('ALTER FUNCTION %I.%I(%s) SET search_path TO ''''', 
            func_record.schema_name, 
            func_record.function_name, 
            func_record.function_args
        );
        
        -- Execute the ALTER FUNCTION statement
        BEGIN
            EXECUTE func_sql;
            RAISE NOTICE 'Updated function: %.%', func_record.schema_name, func_record.function_name;
        EXCEPTION 
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to update function %.%: %', func_record.schema_name, func_record.function_name, SQLERRM;
        END;
    END LOOP;
END $$;