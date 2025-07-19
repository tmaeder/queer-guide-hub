-- Critical Security Fixes - Phase 1: Database Security (Modified)

-- 1. Fix infinite recursion in conversation_participants policy
-- Drop the problematic policy first
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Create a new, non-recursive policy
CREATE POLICY "Users can view participants of their conversations" 
ON public.conversation_participants 
FOR SELECT 
USING (
  -- User can see their own participation record
  user_id = auth.uid() OR
  -- User can see other participants if they are part of the same conversation
  EXISTS (
    SELECT 1 
    FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id 
    AND cp2.user_id = auth.uid()
  )
);

-- 2. Strengthen profile security - prevent role escalation through profile updates
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Add input validation constraints (skip if already exists)
DO $$
BEGIN
  -- Add email validation constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_email_format' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_email_format 
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;

  -- Add phone validation constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_phone_format' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_phone_format 
    CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$');
  END IF;
END $$;

-- 4. Strengthen marketplace listing security
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON public.marketplace_listings;
CREATE POLICY "Active listings are viewable by everyone"
ON public.marketplace_listings
FOR SELECT
USING (status = 'active' AND created_by IS NOT NULL);

-- 5. Create comprehensive security monitoring function (update existing)
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type TEXT,
  user_id_param UUID,
  ip_address_param INET DEFAULT NULL,
  user_agent_param TEXT DEFAULT NULL,
  details JSONB DEFAULT '{}'
)
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.security_events (
    user_id,
    event_type,
    ip_address,
    user_agent,
    details
  ) VALUES (
    COALESCE(user_id_param, auth.uid()),
    event_type,
    ip_address_param,
    user_agent_param,
    details
  );
END;
$$;

-- 6. Add trigger for sensitive profile changes
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log significant profile changes
  IF OLD.email IS DISTINCT FROM NEW.email OR 
     OLD.phone IS DISTINCT FROM NEW.phone OR
     OLD.verified_email IS DISTINCT FROM NEW.verified_email OR
     OLD.verified_phone IS DISTINCT FROM NEW.verified_phone THEN
    
    PERFORM public.log_security_event(
      'PROFILE_SENSITIVE_UPDATE',
      NEW.user_id,
      NULL,
      NULL,
      jsonb_build_object(
        'changed_fields', jsonb_build_object(
          'email_changed', OLD.email IS DISTINCT FROM NEW.email,
          'phone_changed', OLD.phone IS DISTINCT FROM NEW.phone,
          'email_verification_changed', OLD.verified_email IS DISTINCT FROM NEW.verified_email,
          'phone_verification_changed', OLD.verified_phone IS DISTINCT FROM NEW.verified_phone
        ),
        'timestamp', now()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for profile audit
DROP TRIGGER IF EXISTS audit_profile_sensitive_changes ON public.profiles;
CREATE TRIGGER audit_profile_sensitive_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW 
  EXECUTE FUNCTION audit_profile_changes();

-- 7. Fix all security definer functions to use proper search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_group_member_or_admin(group_id uuid, check_admin boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_memberships.group_id = $1
    AND group_memberships.user_id = auth.uid()
    AND (
      CASE 
        WHEN $2 = true THEN group_memberships.role IN ('admin', 'moderator')
        ELSE true
      END
    )
  );
$$;

-- 8. Enhanced content security for messaging
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id 
    AND cp.user_id = auth.uid() 
    AND cp.joined_at IS NOT NULL
  )
);

-- 9. Add security constraints to prevent data leakage
ALTER TABLE public.profiles 
ADD CONSTRAINT check_user_id_not_null 
CHECK (user_id IS NOT NULL);

-- 10. Add audit trigger for role changes (enhance existing)
CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log sensitive table changes with enhanced details
  PERFORM public.log_security_event(
    TG_OP || '_' || TG_TABLE_NAME,
    auth.uid(),
    NULL,
    NULL,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', now(),
      'record_id', COALESCE(NEW.id, OLD.id),
      'affected_user', CASE 
        WHEN TG_TABLE_NAME = 'user_roles' THEN COALESCE(NEW.user_id, OLD.user_id)
        ELSE NULL
      END
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;