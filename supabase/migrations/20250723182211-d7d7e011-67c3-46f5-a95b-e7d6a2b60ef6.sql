-- Security Enhancement: Fix function search paths for remaining functions
-- This addresses the WARN: Function Search Path Mutable security linter warnings

-- Fix functions that are missing SET search_path TO '' security parameter

-- 1. Fix is_conversation_participant function (single parameter version)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- Check if the current user is a participant in the conversation
  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_participants 
    WHERE conversation_participants.conversation_id = $1 
    AND conversation_participants.user_id = (SELECT auth.uid())
  ) INTO result;
  
  RETURN result;
END;
$$;

-- 2. Fix get_user_conversation_ids function (no parameters version)
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Return conversation IDs where the current user is a participant
  RETURN QUERY
    SELECT conversation_id
    FROM public.conversation_participants
    WHERE user_id = (SELECT auth.uid());
END;
$$;

-- 3. Fix is_conversation_participant function (two parameter version)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation_id_param uuid, user_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_participants 
    WHERE conversation_id = conversation_id_param 
    AND user_id = user_id_param
  );
$$;

-- 4. Fix get_user_conversation_ids function (with parameter version)
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_id_param uuid)
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT cp.conversation_id 
  FROM public.conversation_participants cp 
  WHERE cp.user_id = user_id_param;
$$;

-- Add additional security monitoring indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_events_user_id_timestamp ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_role_audit_log_admin_timestamp ON public.user_role_audit_log(admin_user_id, timestamp DESC);

-- Add constraint for security event types validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_security_event_types' 
    AND table_name = 'security_events'
  ) THEN
    ALTER TABLE public.security_events 
    ADD CONSTRAINT valid_security_event_types 
    CHECK (event_type IN (
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 
      'ROLE_ASSIGNED', 'ROLE_REMOVED', 'PROFILE_UPDATE',
      'PROFILE_SENSITIVE_UPDATE', 'PASSWORD_CHANGE',
      'EMAIL_CHANGE', 'PHONE_CHANGE', 'ACCOUNT_LOCKED',
      'SUSPICIOUS_ACTIVITY', 'DATA_EXPORT', 'DATA_DELETE',
      'INSERT_user_roles', 'UPDATE_user_roles', 'DELETE_user_roles',
      'UPDATE_profiles'
    ));
  END IF;
END $$;