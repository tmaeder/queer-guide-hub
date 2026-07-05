-- Retarget friend request / accept notifications to the /hub Contacts module
-- (workstream C3). The trigger already exists (20260623133216) and its rows
-- already flow into get_inbox_feed + the unread badge — this only moves the
-- action_url from the old /community/friends to /hub/contacts so the alert
-- opens the address book where requests are now managed. Body otherwise
-- unchanged.

CREATE OR REPLACE FUNCTION public.on_user_relationship_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_name text;
BEGIN
  IF NEW.relationship_type <> 'friend' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE user_id = NEW.user_id;
    INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read)
    VALUES (NEW.target_user_id, 'friend_request',
            COALESCE(v_name, 'Someone') || ' sent you a friend request', '',
            '/hub/contacts', NEW.user_id, false);

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE user_id = NEW.target_user_id;
    INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read)
    VALUES (NEW.user_id, 'friend_accepted',
            COALESCE(v_name, 'Someone') || ' accepted your friend request', '',
            '/hub/contacts', NEW.target_user_id, false);
    -- Land both users in a chat, exactly like a match.
    PERFORM public.ensure_conversation_between(NEW.user_id, NEW.target_user_id, 'direct');
  END IF;

  RETURN NEW;
END $$;
