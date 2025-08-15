-- =======================================================================================
-- CRITICAL SECURITY FIX: Function Search Path Vulnerabilities
-- =======================================================================================
-- This migration fixes mutable search_path vulnerabilities that could allow 
-- search path hijacking attacks on database functions
-- =======================================================================================

-- Fix is_admin function search path vulnerability
ALTER FUNCTION public.is_admin(uuid) SET search_path = '';

-- Fix is_group_admin function search path vulnerability  
ALTER FUNCTION public.is_group_admin(uuid, uuid) SET search_path = '';

-- =======================================================================================
-- VERIFICATION: Display security status
-- =======================================================================================

DO $$ 
BEGIN
    RAISE NOTICE '=== SECURITY VULNERABILITIES FIXED ===';
    RAISE NOTICE 'FUNCTIONS: is_admin(uuid) and is_group_admin(uuid,uuid) secured';
    RAISE NOTICE 'IMPACT: Prevented potential search path hijacking attacks';
    RAISE NOTICE 'STATUS: Critical function security vulnerabilities resolved';
    RAISE NOTICE '======================================';
END $$;