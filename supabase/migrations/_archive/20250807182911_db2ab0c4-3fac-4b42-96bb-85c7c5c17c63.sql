-- CRITICAL SECURITY FIXES - Phase 2: Fix Function Search Paths

-- Fix remaining functions that need secure search paths
DROP FUNCTION IF EXISTS public.get_user_conversation_ids(uuid);
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

DROP FUNCTION IF EXISTS public.is_conversation_participant(uuid, uuid);
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

DROP FUNCTION IF EXISTS public.is_group_member_or_admin(uuid, boolean);
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

-- Add content validation trigger for XSS protection
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
DROP TRIGGER IF EXISTS validate_community_posts_content ON public.community_posts;
CREATE TRIGGER validate_community_posts_content
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();

DROP TRIGGER IF EXISTS validate_events_content ON public.events;
CREATE TRIGGER validate_events_content
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();

DROP TRIGGER IF EXISTS validate_profiles_content ON public.profiles;
CREATE TRIGGER validate_profiles_content
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_security();