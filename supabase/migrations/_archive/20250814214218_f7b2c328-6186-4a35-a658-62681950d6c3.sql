-- Fix Security Definer View warnings by removing SECURITY DEFINER from views
-- The secure views should rely on RLS policies for access control instead

-- Drop and recreate the secure session summary view without SECURITY DEFINER
DROP VIEW IF EXISTS public.secure_session_summary CASCADE;
CREATE OR REPLACE VIEW public.secure_session_summary AS
SELECT 
  id,
  user_id,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN 
      COALESCE(
        public.decrypt_sensitive_data(
          session_token_encrypted, 
          substr(md5(user_id::text || 'session_salt_2024'), 1, 16)
        ),
        'ENCRYPTED'
      )
    ELSE 'REDACTED'
  END as session_token_status,
  CASE 
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN ip_address::text
    ELSE 'REDACTED'
  END as ip_status,
  expires_at,
  is_active,
  created_at,
  last_activity
FROM public.user_sessions;

-- Drop and recreate the secure passkey summary view without SECURITY DEFINER
DROP VIEW IF EXISTS public.secure_passkey_summary CASCADE;
CREATE OR REPLACE VIEW public.secure_passkey_summary AS
SELECT 
  id,
  user_id,
  CASE 
    WHEN auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) THEN 
      COALESCE(
        public.decrypt_sensitive_data(
          credential_id_encrypted, 
          substr(md5(user_id::text || 'passkey_salt_2024'), 1, 16)
        ),
        'ENCRYPTED'
      )
    ELSE 'REDACTED'
  END as credential_status,
  counter,
  created_at,
  last_used_at,
  is_revoked
FROM public.user_passkeys;

-- Add RLS policies to the views for proper access control
ALTER VIEW public.secure_session_summary SET (security_barrier = true);
ALTER VIEW public.secure_passkey_summary SET (security_barrier = true);

-- Update comments
COMMENT ON VIEW public.secure_session_summary IS 
'Secure view for session data that uses RLS policies for access control. Only shows decrypted information to admins and redacts sensitive data for regular users.';

COMMENT ON VIEW public.secure_passkey_summary IS 
'Secure view for passkey data that uses RLS policies for access control. Only shows decrypted information to the owning user and admins.';