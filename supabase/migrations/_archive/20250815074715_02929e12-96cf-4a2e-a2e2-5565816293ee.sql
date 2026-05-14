-- =======================================================================================
-- TARGETED SECURITY FIX: Function Search Path Security
-- =======================================================================================
-- This migration addresses remaining function security vulnerabilities by:
-- 1. Securing functions with mutable search_path vulnerabilities
-- 2. Adding security audit logging
-- =======================================================================================

-- =======================================================================================
-- FUNCTION SECURITY: Fix mutable search_path vulnerabilities
-- =======================================================================================

-- Fix functions that currently have mutable search_path (NULL proconfig)
-- These functions are vulnerable to search path hijacking attacks

-- Secure is_group_admin function
ALTER FUNCTION public.is_group_admin(uuid, uuid) SET search_path = '';

-- Secure is_admin function  
ALTER FUNCTION public.is_admin() SET search_path = '';

-- Secure update_updated_at_column function
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- =======================================================================================
-- SECURITY VERIFICATION: Confirm all critical tables have RLS enabled
-- =======================================================================================

-- Verify RLS is enabled on all critical tables (should already be enabled)
-- This is a safety check to ensure no tables were missed

DO $$ 
DECLARE
    table_record RECORD;
    missing_rls TEXT[] := '{}';
BEGIN
    -- Check each critical table for RLS
    FOR table_record IN 
        SELECT schemaname, tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('profiles', 'user_photos', 'user_relationships', 'user_passkeys', 'user_sessions', 'messages', 'user_push_tokens', 'donations')
    LOOP
        -- If RLS is not enabled, add to missing list
        IF NOT table_record.rowsecurity THEN
            missing_rls := array_append(missing_rls, table_record.tablename);
        END IF;
    END LOOP;
    
    -- Log results for audit
    IF array_length(missing_rls, 1) > 0 THEN
        RAISE NOTICE 'WARNING: Tables without RLS: %', array_to_string(missing_rls, ', ');
        
        -- Log security concern
        INSERT INTO public.security_events (
            event_type,
            user_id,
            metadata,
            severity
        ) VALUES (
            'RLS_VERIFICATION_FAILED',
            NULL,
            jsonb_build_object(
                'tables_missing_rls', to_jsonb(missing_rls),
                'timestamp', now(),
                'requires_immediate_attention', true
            ),
            'critical'
        );
    ELSE
        RAISE NOTICE 'SUCCESS: All critical tables have RLS enabled';
        
        -- Log successful verification
        INSERT INTO public.security_events (
            event_type,
            user_id,
            metadata,
            severity
        ) VALUES (
            'RLS_VERIFICATION_PASSED',
            NULL,
            jsonb_build_object(
                'tables_verified', jsonb_build_array(
                    'profiles', 'user_photos', 'user_relationships', 
                    'user_passkeys', 'user_sessions', 'messages', 
                    'user_push_tokens', 'donations'
                ),
                'timestamp', now()
            ),
            'low'
        );
    END IF;
END $$;

-- =======================================================================================
-- SECURITY AUDIT LOG
-- =======================================================================================

-- Log this targeted security fix for audit purposes
INSERT INTO public.security_events (
    event_type,
    user_id,
    metadata,
    severity
) VALUES (
    'FUNCTION_SEARCH_PATH_SECURITY_FIX',
    NULL,
    jsonb_build_object(
        'functions_secured', jsonb_build_array(
            'is_group_admin', 'is_admin', 'update_updated_at_column'
        ),
        'security_verification_completed', true,
        'timestamp', now(),
        'migration_version', '20250815_targeted_security_fix'
    ),
    'high'
);