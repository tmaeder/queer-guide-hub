-- CRITICAL SECURITY FIXES

-- 1. Fix RLS policies for failed_login_attempts table
DROP POLICY IF EXISTS "System manages rate limiting" ON public.failed_login_attempts;

CREATE POLICY "Admins can view failed login attempts" 
ON public.failed_login_attempts 
FOR SELECT 
USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "System can insert failed login attempts" 
ON public.failed_login_attempts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update failed login attempts" 
ON public.failed_login_attempts 
FOR UPDATE 
USING (true);

-- 2. Consolidate conflicting profile RLS policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view other users profiles" ON public.profiles;

-- Create consolidated profile policies with privacy enforcement
CREATE POLICY "Users can view public profile data" 
ON public.profiles 
FOR SELECT 
USING (
  CASE
    -- User can always see their own profile
    WHEN user_id = (SELECT auth.uid()) THEN true
    -- Others can see public data based on privacy settings
    ELSE (
      privacy_settings->>'bio_public' = 'true' OR 
      privacy_settings->>'pronouns_public' = 'true' OR
      privacy_settings->>'location_public' = 'true'
    )
  END
);

CREATE POLICY "Users can view sensitive profile data" 
ON public.profiles 
FOR SELECT 
USING (
  user_id = (SELECT auth.uid()) OR 
  public.can_view_sensitive_profile_data(user_id, (SELECT auth.uid()))
);

-- 3. Add comprehensive audit logging trigger for profile changes
CREATE OR REPLACE FUNCTION public.audit_sensitive_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log sensitive profile field changes
  IF OLD.sexual_orientation IS DISTINCT FROM NEW.sexual_orientation OR
     OLD.gender_identity IS DISTINCT FROM NEW.gender_identity OR
     OLD.phone IS DISTINCT FROM NEW.phone OR
     OLD.verified_email IS DISTINCT FROM NEW.verified_email OR
     OLD.verified_phone IS DISTINCT FROM NEW.verified_phone OR
     OLD.verified_identity IS DISTINCT FROM NEW.verified_identity OR
     OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
    
    PERFORM public.log_enhanced_security_event(
      'SENSITIVE_PROFILE_UPDATE',
      NEW.user_id,
      jsonb_build_object(
        'changed_fields', jsonb_build_object(
          'sexual_orientation_changed', OLD.sexual_orientation IS DISTINCT FROM NEW.sexual_orientation,
          'gender_identity_changed', OLD.gender_identity IS DISTINCT FROM NEW.gender_identity,
          'phone_changed', OLD.phone IS DISTINCT FROM NEW.phone,
          'email_verification_changed', OLD.verified_email IS DISTINCT FROM NEW.verified_email,
          'phone_verification_changed', OLD.verified_phone IS DISTINCT FROM NEW.verified_phone,
          'identity_verification_changed', OLD.verified_identity IS DISTINCT FROM NEW.verified_identity,
          'privacy_settings_changed', OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings
        ),
        'timestamp', now()
      ),
      'medium'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS audit_sensitive_profile_changes_trigger ON public.profiles;
CREATE TRIGGER audit_sensitive_profile_changes_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_profile_changes();

-- 4. Fix database function search paths (add to functions that are missing it)
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_uuid uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT ARRAY(
    SELECT conversation_id 
    FROM public.conversation_participants 
    WHERE user_id = user_uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_participants 
    WHERE conversation_id = conv_id AND user_id = user_uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_member_or_admin(group_uuid uuid, require_admin boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.group_memberships 
    WHERE group_id = group_uuid 
    AND user_id = auth.uid()
    AND (NOT require_admin OR role IN ('admin', 'moderator'))
  );
$$;

-- 5. Add content validation trigger for XSS protection
CREATE OR REPLACE FUNCTION public.validate_content_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  content_field text;
BEGIN
  -- Get the content field value
  IF TG_TABLE_NAME = 'community_posts' THEN
    content_field := NEW.content;
  ELSIF TG_TABLE_NAME = 'group_posts' THEN
    content_field := NEW.content;
  ELSIF TG_TABLE_NAME = 'group_post_comments' THEN
    content_field := NEW.content;
  ELSIF TG_TABLE_NAME = 'events' THEN
    content_field := NEW.description;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    content_field := NEW.bio;
  END IF;

  -- Basic XSS pattern detection
  IF content_field IS NOT NULL AND content_field ~* '<script|javascript:|data:|vbscript:|on\w+=' THEN
    PERFORM public.log_enhanced_security_event(
      'XSS_ATTEMPT_DETECTED',
      auth.uid(),
      jsonb_build_object(
        'content_preview', left(content_field, 100),
        'table', TG_TABLE_NAME,
        'timestamp', now()
      ),
      'high'
    );
    RAISE EXCEPTION 'Potentially malicious content detected';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply content security triggers to relevant tables
CREATE TRIGGER validate_community_posts_content
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();

CREATE TRIGGER validate_events_content
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();

CREATE TRIGGER validate_profiles_content
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();