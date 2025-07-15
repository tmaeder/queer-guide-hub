-- SECURITY FIXES: Update all database functions to include proper search_path protection
-- This prevents SQL injection attacks through search_path manipulation

-- Fix update_tag_usage_count function
CREATE OR REPLACE FUNCTION public.update_tag_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  -- Update usage counts for all tags
  UPDATE public.tags 
  SET usage_count = (
    SELECT COALESCE(
      (SELECT COUNT(*) FROM public.events WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.venues WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.marketplace_listings WHERE tags @> ARRAY[tags.name]) +
      (SELECT COUNT(*) FROM public.community_posts WHERE tags @> ARRAY[tags.name]),
      0
    )
  );
  
  RETURN NULL;
END;
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix increment_listing_views function
CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.marketplace_listings 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = listing_id;
END;
$function$;

-- Fix increment_post_likes function
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = COALESCE(likes_count, 0) + 1 
  WHERE id = post_id;
END;
$function$;

-- Fix decrement_post_likes function
CREATE OR REPLACE FUNCTION public.decrement_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.community_posts 
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = post_id;
END;
$function$;

-- Fix increment_post_comments function
CREATE OR REPLACE FUNCTION public.increment_post_comments(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.community_posts 
  SET comments_count = COALESCE(comments_count, 0) + 1 
  WHERE id = post_id;
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, created_at, updated_at)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data ->> 'display_name', new.email), 
    now(), 
    now()
  );
  RETURN new;
END;
$function$;

-- Fix increment_article_views function
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.news_articles 
  SET views_count = COALESCE(views_count, 0) + 1 
  WHERE id = article_id;
END;
$function$;

-- Fix has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

-- Fix assign_user_role function
CREATE OR REPLACE FUNCTION public.assign_user_role(target_user_id uuid, new_role app_role, action_type text DEFAULT 'assign'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  is_admin BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT public.has_role(current_user_id, 'admin') INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can manage user roles';
  END IF;
  
  -- Prevent users from removing their own admin role (safety check)
  IF current_user_id = target_user_id AND new_role != 'admin' AND action_type = 'assign' THEN
    RAISE EXCEPTION 'Cannot remove your own admin privileges';
  END IF;
  
  -- Perform the action
  IF action_type = 'assign' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, new_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF action_type = 'remove' THEN
    DELETE FROM public.user_roles 
    WHERE user_id = target_user_id AND role = new_role;
  END IF;
  
  -- Log the action (basic audit trail)
  INSERT INTO public.user_role_audit_log (
    admin_user_id,
    target_user_id,
    role_changed,
    action_type,
    timestamp
  ) VALUES (
    current_user_id,
    target_user_id,
    new_role,
    action_type,
    NOW()
  );
  
  RETURN TRUE;
END;
$function$;

-- Fix update_conversation_timestamp function
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.conversations 
  SET updated_at = now(), last_message_at = now(), last_message_id = NEW.id
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

-- Fix get_or_create_direct_conversation function
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  conversation_id UUID;
BEGIN
  -- Check if conversation already exists
  SELECT c.id INTO conversation_id
  FROM public.conversations c
  WHERE c.conversation_type = 'direct'
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp1 
      WHERE cp1.conversation_id = c.id AND cp1.user_id = user1_id
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp2 
      WHERE cp2.conversation_id = c.id AND cp2.user_id = user2_id
    )
    AND c.participants_count = 2;

  -- If conversation doesn't exist, create it
  IF conversation_id IS NULL THEN
    INSERT INTO public.conversations (conversation_type, participants_count)
    VALUES ('direct', 2)
    RETURNING id INTO conversation_id;

    -- Add both users to the conversation
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conversation_id, user1_id), (conversation_id, user2_id);
  END IF;

  RETURN conversation_id;
END;
$function$;

-- Fix create_notification function
CREATE OR REPLACE FUNCTION public.create_notification(target_user_id uuid, notification_type text, notification_title text, notification_content text DEFAULT NULL::text, notification_action_url text DEFAULT NULL::text, notification_related_id uuid DEFAULT NULL::uuid, notification_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    content,
    action_url,
    related_id,
    metadata
  ) VALUES (
    target_user_id,
    notification_type,
    notification_title,
    notification_content,
    notification_action_url,
    notification_related_id,
    notification_metadata
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$function$;

-- Fix update_group_member_count function
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_groups 
    SET member_count = member_count + 1 
    WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_groups 
    SET member_count = member_count - 1 
    WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Fix is_group_member_or_admin function
CREATE OR REPLACE FUNCTION public.is_group_member_or_admin(group_id uuid, check_admin boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $function$
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
$function$;