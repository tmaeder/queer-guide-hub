-- Hub redesign, Phase 1 — group chat schema unification.
--
-- Retires the standalone group_chat_messages schema by migrating group chat
-- rooms onto the existing conversations/conversation_participants/messages
-- tables. conversation_type='group' is already a reserved-but-unused enum
-- value (added in 20260525200001_intimate_dating_engine.sql alongside
-- 'match') — this finishes a data model that was half-built rather than
-- adding a second permanent chat schema (a second RLS surface, a second
-- realtime pattern, a second unread-count path) next to `messages`.
--
-- get_inbox_feed's existing `chat` CTE is already keyed off
-- conversation_participants, so once that table mirrors group_memberships
-- (via the trigger below), group threads fall out of the existing chat UNION
-- branch for free — no new branch needed there. The companion
-- 20260711100100 migration only needs to fix the CTE's single-other-
-- participant title/avatar logic (wrong for N-party groups) and add
-- p_filter='groups' support.
--
-- group_chat_messages itself is left in place (not dropped) pending a
-- verification window on this backfill — drop it in a follow-up migration
-- once confirmed safe, and retire src/hooks/useGroupChat.ts client-side.

-- ---------------------------------------------------------------------------
-- 1. Link groups to their chat conversation.
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS chat_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

-- UNIQUE (not just indexed): the relationship is strictly 1:1 — get_inbox_feed's
-- `LEFT JOIN community_groups cg ON cg.chat_conversation_id = c.id` would silently
-- fan out into duplicate inbox rows if two groups ever pointed at the same
-- conversation. A unique index both enforces this and serves as the lookup index.
CREATE UNIQUE INDEX IF NOT EXISTS community_groups_chat_conversation_idx
  ON public.community_groups (chat_conversation_id)
  WHERE chat_conversation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill, per group: create its conversation, mirror current members
--    into conversation_participants, copy existing group_chat_messages rows
--    across, and point the conversation's last_message_* at the newest one.
--
--    Idempotent: only groups with chat_conversation_id IS NULL are touched,
--    so re-running this migration (retry, repair-shim rename) is a no-op
--    once every group has been linked — including the message copy, which
--    would otherwise duplicate on a naive re-run.
--
--    reply_to_id is dropped on migrated rows (bigint id space on the old
--    table, uuid on messages — not worth a remap for a low-traffic table).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  g RECORD;
  v_conv uuid;
  v_last_id uuid;
  v_last_at timestamptz;
BEGIN
  FOR g IN SELECT id, name, member_count FROM public.community_groups WHERE chat_conversation_id IS NULL LOOP
    INSERT INTO public.conversations (conversation_type, title, participants_count)
    VALUES ('group', g.name, g.member_count)
    RETURNING id INTO v_conv;

    UPDATE public.community_groups SET chat_conversation_id = v_conv WHERE id = g.id;

    INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at, is_admin)
    SELECT v_conv, gm.user_id, gm.joined_at, (gm.role IN ('admin', 'moderator'))
      FROM public.group_memberships gm
     WHERE gm.group_id = g.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, attachments, edited_at, created_at, updated_at)
    SELECT v_conv, gcm.sender_id, gcm.content, 'text', gcm.attachments, gcm.edited_at, gcm.created_at,
           COALESCE(gcm.edited_at, gcm.created_at)
      FROM public.group_chat_messages gcm
     WHERE gcm.group_id = g.id
     ORDER BY gcm.created_at;

    SELECT id, created_at INTO v_last_id, v_last_at
      FROM public.messages
     WHERE conversation_id = v_conv
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_last_id IS NOT NULL THEN
      UPDATE public.conversations
         SET last_message_id = v_last_id, last_message_at = v_last_at, updated_at = now()
       WHERE id = v_conv;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. New groups: auto-create + link a chat conversation on insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_group_create_chat_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conv uuid;
BEGIN
  INSERT INTO public.conversations (conversation_type, title, participants_count)
  VALUES ('group', NEW.name, 0)
  RETURNING id INTO v_conv;

  NEW.chat_conversation_id := v_conv;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS group_create_chat_conversation ON public.community_groups;
CREATE TRIGGER group_create_chat_conversation
  BEFORE INSERT ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_create_chat_conversation();

REVOKE EXECUTE ON FUNCTION public.tg_group_create_chat_conversation() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membership sync: mirror group_memberships into conversation_participants
--    so get_inbox_feed's existing participant-keyed `chat` CTE needs no
--    group-specific branching to surface group threads, and a user removed
--    from a group immediately loses read/write access to its chat (RLS on
--    conversation_participants/messages is participant-keyed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_group_membership_sync_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conv uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT chat_conversation_id INTO v_conv FROM public.community_groups WHERE id = NEW.group_id;
    IF v_conv IS NOT NULL THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at, is_admin)
      VALUES (v_conv, NEW.user_id, NEW.joined_at, (NEW.role IN ('admin', 'moderator')))
      ON CONFLICT (conversation_id, user_id) DO UPDATE
        SET is_admin = EXCLUDED.is_admin;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      SELECT chat_conversation_id INTO v_conv FROM public.community_groups WHERE id = NEW.group_id;
      IF v_conv IS NOT NULL THEN
        UPDATE public.conversation_participants
           SET is_admin = (NEW.role IN ('admin', 'moderator'))
         WHERE conversation_id = v_conv AND user_id = NEW.user_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT chat_conversation_id INTO v_conv FROM public.community_groups WHERE id = OLD.group_id;
    IF v_conv IS NOT NULL THEN
      DELETE FROM public.conversation_participants
       WHERE conversation_id = v_conv AND user_id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS group_memberships_sync_conversation ON public.group_memberships;
CREATE TRIGGER group_memberships_sync_conversation
  AFTER INSERT OR UPDATE OR DELETE ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_membership_sync_conversation();

REVOKE EXECUTE ON FUNCTION public.tg_group_membership_sync_conversation() FROM PUBLIC, anon, authenticated;
