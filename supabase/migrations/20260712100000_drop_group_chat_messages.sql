-- Hub redesign, Phase 1 (follow-up) — drop the retired group_chat_messages schema.
--
-- 20260711100000 unified group chat onto conversations/messages
-- (conversation_type='group') and backfilled every group. That backfill is
-- verified complete in prod (all groups linked to a group conversation,
-- memberships mirrored to conversation_participants, 0 unmirrored; 0
-- group_chat_messages rows existed, so no message data was ever at risk).
-- The client (useGroupChat / GroupChat) is retired in the same change, so
-- nothing reads or writes this table anymore. Drop it.
--
-- NOTE: the group.joined activity emit lives on group_memberships
-- (tg_group_membership_emit_activity / trigger group_memberships_emit_activity),
-- NOT on this table — it is untouched and stays.

-- ---------------------------------------------------------------------------
-- 1. Remove from the realtime publication before dropping the table.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'group_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.group_chat_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Drop the table (CASCADE clears its policies, indexes, and self-FK).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.group_chat_messages CASCADE;
