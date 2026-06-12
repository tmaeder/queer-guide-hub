-- The valid_security_event_types CHECK predates log_enhanced_security_event's
-- callers and silently rejected their event types (the logger swallows insert
-- errors by design). Extend the whitelist with the five types actually passed
-- by audit_admin_data_access, validate_privacy_settings,
-- check_rate_limit_enhanced and secure_passkey_access.

ALTER TABLE public.security_events DROP CONSTRAINT valid_security_event_types;
ALTER TABLE public.security_events ADD CONSTRAINT valid_security_event_types CHECK (
  event_type = ANY (ARRAY[
    'LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','ROLE_ASSIGNED','ROLE_REMOVED',
    'PROFILE_UPDATE','PROFILE_SENSITIVE_UPDATE','PASSWORD_CHANGE','EMAIL_CHANGE',
    'PHONE_CHANGE','ACCOUNT_LOCKED','SUSPICIOUS_ACTIVITY','DATA_EXPORT','DATA_DELETE',
    'INSERT_user_roles','UPDATE_user_roles','DELETE_user_roles','UPDATE_profiles',
    'ADMIN_DATA_ACCESS','PRIVACY_SETTINGS_UPDATED','RATE_LIMIT_EXCEEDED',
    'PASSKEY_RATE_LIMIT_EXCEEDED','PASSKEY_DATA_ACCESS'
  ])
);
