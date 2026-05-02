-- Fix function search path security issue
-- This ensures functions have a secure search path set

-- Update all functions that don't have search_path set to use a secure path
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Loop through all functions without a set search_path
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as function_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND NOT EXISTS (
            SELECT 1 FROM pg_proc_config pc 
            WHERE pc.oid = p.oid 
            AND pc.proconfig::text LIKE '%search_path%'
        )
        AND p.proname IN (
            'increment_personality_views',
            'update_import_jobs_updated_at',
            'ensure_profile_privacy_defaults',
            'assign_user_role',
            'encrypt_session_data',
            'encrypt_passkey_data',
            'consolidate_all_multiple_policies',
            'handle_domain_admin_auto_assign',
            'consolidate_policies',
            'prevent_location_tampering',
            'audit_profile_changes',
            'validate_notification_creation',
            'encrypt_profile_data',
            'consolidate_table_policies',
            'prevent_notification_tampering',
            'decrypt_profile_data',
            'encrypt_all_profile_sensitive_data',
            'get_secure_profile_data',
            'audit_sensitive_profile_changes',
            'validate_booking_creation',
            'revoke_role',
            'prevent_profile_data_exposure',
            'prevent_booking_tampering',
            'cleanup_old_cancelled_bookings',
            'assign_role',
            'encrypt_sensitive_data',
            'decrypt_sensitive_data',
            'check_rate_limit',
            'encrypt_profile_sensitive_data',
            'validate_user_content',
            'log_passkey_access',
            'optimize_auth_uid_in_policies',
            'log_user_photo_access',
            'fix_rls_policies',
            'validate_content_security',
            'check_rate_limit_enhanced',
            'fix_table_rls_policies',
            'validate_user_input',
            'secure_assign_user_role'
        )
    LOOP
        -- Update each function to have a secure search_path
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path TO ''''', 
            func_record.schema_name, 
            func_record.function_name, 
            func_record.function_args
        );
    END LOOP;
END $$;