-- Milestone "merry-plotting-beacon" Phase 7 — Group chat rooms.
--
-- Adds public.group_chat_messages (lightweight realtime chat) alongside the
-- existing group_posts (announcements / threads). RLS: only members can read
-- or post. Realtime-enabled so the Chat tab updates live.
--
-- Also emits a group.joined activity event (already in activity_event_rules
-- from Phase 1) on every new group_memberships row via trigger.

-- ---------------------------------------------------------------------------
-- 1. group_chat_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id           bigserial PRIMARY KEY,
  group_id     uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  reply_to_id  bigint REFERENCES public.group_chat_messages(id) ON DELETE SET NULL,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  edited_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_chat_messages_group_created_idx
  ON public.group_chat_messages (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS group_chat_messages_sender_idx
  ON public.group_chat_messages (sender_id);

ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_messages FORCE ROW LEVEL SECURITY;

-- Member-only read.
DROP POLICY IF EXISTS group_chat_member_select ON public.group_chat_messages;
CREATE POLICY group_chat_member_select ON public.group_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_memberships m
     WHERE m.group_id = group_chat_messages.group_id
       AND m.user_id = auth.uid()
  ));

-- Member-only insert; sender must be self.
DROP POLICY IF EXISTS group_chat_member_insert ON public.group_chat_messages;
CREATE POLICY group_chat_member_insert ON public.group_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_memberships m
       WHERE m.group_id = group_chat_messages.group_id
         AND m.user_id = auth.uid()
    )
  );

-- Author can edit own messages; mods/admins can delete any message.
DROP POLICY IF EXISTS group_chat_self_update ON public.group_chat_messages;
CREATE POLICY group_chat_self_update ON public.group_chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS group_chat_author_or_mod_delete ON public.group_chat_messages;
CREATE POLICY group_chat_author_or_mod_delete ON public.group_chat_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_memberships m
       WHERE m.group_id = group_chat_messages.group_id
         AND m.user_id = auth.uid()
         AND m.role IN ('admin','moderator')
    )
  );

-- Realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_chat_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Emit group.joined activity on group_memberships insert.
--    Idempotent: the activity_event_rules cap (5/day) prevents farming.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_group_membership_emit_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emit_user_activity(
    NEW.user_id, 'group.joined', 'group', NEW.group_id,
    jsonb_build_object('membership_id', NEW.id));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS group_memberships_emit_activity ON public.group_memberships;
CREATE TRIGGER group_memberships_emit_activity
  AFTER INSERT ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_group_membership_emit_activity();

REVOKE EXECUTE ON FUNCTION public.tg_group_membership_emit_activity() FROM PUBLIC, anon, authenticated;
