-- People-layer rethink — Phase 1: connection → conversation pipeline.
--
-- Wires the three connection events (match, friend-request/accept, and the existing
-- DM start path) into the unified inbox, and fixes three latent bugs found while
-- grounding the design against the live DB:
--   1. `get_or_create_direct_conversation` was a STUB returning a random uuid and
--      creating nothing — the frontend "start conversation" path was a silent no-op.
--   2. The `watched_urls` migration dropped 'dm' from notifications_type_check, so the
--      very next DM-notification insert would have thrown. Restored here.
--   3. `on_intimate_like_inserted` wrote intimate-space ids (profiles.id) into
--      conversation_participants.user_id, but the inbox/messages id-space is
--      profiles.user_id (== auth.uid()). For users where profiles.id <> user_id (15
--      live rows) match conversations were invisible. Bridged here. (0 match
--      conversations exist today, so no data backfill is required.)
--
-- ID-SPACE CONTRACT (load-bearing, see CLAUDE.md):
--   * conversation_participants.user_id, messages.sender_id, notifications.user_id,
--     user_relationships.{user_id,target_user_id}  →  auth.uid() == profiles.user_id
--   * intimate_likes.{actor_id,target_id}            →  profiles.id
--   Any bridge between the two MUST map via profiles (id <-> user_id) explicitly.

-- ---------------------------------------------------------------------------
-- 0. Notification type allowlist — restore 'dm', add the connection types.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'message','event','system','trip_nudge','event_reminder','watch_import','dm',
    'friend_request','friend_accepted','new_match','wave','someone_nearby',
    'traveler_incoming','sos'
  ]));

-- ---------------------------------------------------------------------------
-- 1. ensure_conversation_between(a_uid, b_uid, type) — internal helper.
--    Idempotent: returns the existing 1:1 conversation of the given type between
--    the two auth-uids, else creates it (conversation + both participants).
--    Inputs are auth-uids (profiles.user_id). Internal only — not granted to
--    anon/authenticated; callers are SECURITY DEFINER functions/triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_conversation_between(
  a_uid uuid, b_uid uuid, p_type text DEFAULT 'direct'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_conv uuid;
BEGIN
  IF a_uid IS NULL OR b_uid IS NULL OR a_uid = b_uid THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_conv
  FROM public.conversations c
  JOIN public.conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = a_uid
  JOIN public.conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = b_uid
  WHERE COALESCE(c.conversation_type,'direct') = p_type
  LIMIT 1;
  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations (conversation_type, participants_count, title)
  VALUES (p_type, 2, NULL)
  RETURNING id INTO v_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at, is_admin)
  VALUES (v_conv, a_uid, now(), false),
         (v_conv, b_uid, now(), false);

  RETURN v_conv;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fix the get_or_create_direct_conversation stub (frontend startConversation).
--    Authenticated callers may only create a conversation they are part of.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  user1_id uuid, user2_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> user1_id AND auth.uid() <> user2_id THEN
    RAISE EXCEPTION 'cannot create a conversation on behalf of other users';
  END IF;
  RETURN public.ensure_conversation_between(user1_id, user2_id, 'direct');
END $$;

-- ---------------------------------------------------------------------------
-- 3. Match → conversation + new_match notification (id-space bridged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_intimate_like_inserted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_reverse     boolean;
  v_actor_uid   uuid;
  v_target_uid  uuid;
  v_actor_name  text;
  v_target_name text;
  v_existing    uuid;
  v_new_conv    uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.intimate_likes
    WHERE actor_id = NEW.target_id AND target_id = NEW.actor_id
  ) INTO v_reverse;
  IF NOT v_reverse THEN RETURN NEW; END IF;

  -- ID-SPACE BRIDGE: profiles.id (intimate) -> profiles.user_id (auth/conversation).
  SELECT user_id, display_name INTO v_actor_uid,  v_actor_name  FROM public.profiles WHERE id = NEW.actor_id;
  SELECT user_id, display_name INTO v_target_uid, v_target_name FROM public.profiles WHERE id = NEW.target_id;
  IF v_actor_uid IS NULL OR v_target_uid IS NULL THEN RETURN NEW; END IF;

  -- Already matched? (re-like) — do nothing, don't re-notify.
  SELECT c.id INTO v_existing
  FROM public.conversations c
  JOIN public.conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = v_actor_uid
  JOIN public.conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = v_target_uid
  WHERE c.conversation_type = 'match' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN NEW; END IF;

  v_new_conv := public.ensure_conversation_between(v_actor_uid, v_target_uid, 'match');

  INSERT INTO public.intimate_thread_consent (conversation_id, matched_at)
  VALUES (v_new_conv, now())
  ON CONFLICT (conversation_id) DO NOTHING;

  -- Activity ledger keyed in intimate space (profiles.id), unchanged.
  PERFORM public.emit_user_activity(NEW.actor_id, 'dating.match_formed', 'conversation', v_new_conv,
    jsonb_build_object('other_id', NEW.target_id), 0, NULL);
  PERFORM public.emit_user_activity(NEW.target_id, 'dating.match_formed', 'conversation', v_new_conv,
    jsonb_build_object('other_id', NEW.actor_id), 0, NULL);

  -- Inbox + push: notify both users (auth-uid space).
  INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read)
  VALUES
    (v_actor_uid,  'new_match', 'New match',
     'You matched with ' || COALESCE(v_target_name, 'someone'),
     '/messages?conversation=' || v_new_conv::text, v_new_conv, false),
    (v_target_uid, 'new_match', 'New match',
     'You matched with ' || COALESCE(v_actor_name, 'someone'),
     '/messages?conversation=' || v_new_conv::text, v_new_conv, false);

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Friend request / accept → notification (+ direct conversation on accept).
--    user_relationships is already in auth-uid space — no mapping needed.
-- ---------------------------------------------------------------------------
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
            '/community/friends', NEW.user_id, false);

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE user_id = NEW.target_user_id;
    INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read)
    VALUES (NEW.user_id, 'friend_accepted',
            COALESCE(v_name, 'Someone') || ' accepted your friend request', '',
            '/community/friends', NEW.target_user_id, false);
    -- Land both users in a chat, exactly like a match.
    PERFORM public.ensure_conversation_between(NEW.user_id, NEW.target_user_id, 'direct');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_relationships_notify ON public.user_relationships;
CREATE TRIGGER user_relationships_notify
  AFTER INSERT OR UPDATE ON public.user_relationships
  FOR EACH ROW EXECUTE FUNCTION public.on_user_relationship_changed();

-- Grants: get_or_create_direct_conversation is called by the frontend.
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid, uuid) TO authenticated;
