-- Fix remaining security function search path issues

-- Fix remaining security definer functions to use proper search path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.calculate_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  total_fields INTEGER := 50; -- Adjust based on total profile fields
  filled_fields INTEGER := 0;
  completion_percentage INTEGER;
BEGIN
  -- Count non-null fields
  IF NEW.display_name IS NOT NULL AND NEW.display_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.first_name IS NOT NULL AND NEW.first_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.last_name IS NOT NULL AND NEW.last_name != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.location IS NOT NULL AND NEW.location != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.age_range IS NOT NULL AND NEW.age_range != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.gender_identity IS NOT NULL AND NEW.gender_identity != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.pronouns IS NOT NULL AND NEW.pronouns != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.sexual_orientation IS NOT NULL AND NEW.sexual_orientation != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.occupation IS NOT NULL AND NEW.occupation != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.education IS NOT NULL AND NEW.education != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.height_cm IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.body_type IS NOT NULL AND NEW.body_type != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.industry IS NOT NULL AND NEW.industry != '' THEN filled_fields := filled_fields + 1; END IF;
  IF NEW.relationship_status IS NOT NULL AND NEW.relationship_status != '' THEN filled_fields := filled_fields + 1; END IF;
  
  -- Calculate percentage
  completion_percentage := ROUND((filled_fields::FLOAT / total_fields) * 100);
  NEW.profile_completion_percentage := completion_percentage;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_first_admin(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get user ID from auth.users by email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_admin_by_id(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  target_user_id uuid, 
  notification_type text, 
  notification_title text, 
  notification_content text DEFAULT NULL::text, 
  notification_action_url text DEFAULT NULL::text, 
  notification_related_id uuid DEFAULT NULL::uuid, 
  notification_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(user1_id uuid, user2_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.create_group_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  mention_user_id UUID;
  mention_data JSONB;
  group_id_val UUID;
BEGIN
  -- Get group_id based on the table
  IF TG_TABLE_NAME = 'group_posts' THEN
    group_id_val := NEW.group_id;
  ELSIF TG_TABLE_NAME = 'group_post_comments' THEN
    SELECT gp.group_id INTO group_id_val 
    FROM public.group_posts gp 
    WHERE gp.id = NEW.post_id;
  ELSIF TG_TABLE_NAME = 'group_post_likes' THEN
    SELECT gp.group_id INTO group_id_val 
    FROM public.group_posts gp 
    WHERE gp.id = NEW.post_id;
  END IF;

  -- Handle mentions
  IF NEW.mentions IS NOT NULL AND jsonb_array_length(NEW.mentions) > 0 THEN
    FOR mention_data IN SELECT * FROM jsonb_array_elements(NEW.mentions)
    LOOP
      mention_user_id := (mention_data->>'user_id')::UUID;
      
      IF mention_user_id IS NOT NULL AND mention_user_id != NEW.user_id THEN
        INSERT INTO public.group_notifications (
          group_id, user_id, notification_type, 
          related_post_id, related_comment_id, triggered_by_user_id, content
        ) VALUES (
          group_id_val, mention_user_id, 'mention',
          CASE WHEN TG_TABLE_NAME = 'group_posts' THEN NEW.id ELSE NEW.post_id END,
          CASE WHEN TG_TABLE_NAME = 'group_post_comments' THEN NEW.id ELSE NULL END,
          NEW.user_id,
          CASE WHEN TG_TABLE_NAME = 'group_posts' THEN 'mentioned you in a post' 
               ELSE 'mentioned you in a comment' END
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;