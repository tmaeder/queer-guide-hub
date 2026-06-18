-- Restore participant-scoped SELECT access to chat tables.
-- conversations + conversation_participants had only service_role SELECT
-- policies, so authenticated clients (useMessaging.fetchConversations /
-- fetchMessages) could not read their own conversations, participant
-- identities, or messages (the messages SELECT policy's EXISTS over
-- conversation_participants resolved false). The unified-inbox rail kept
-- working via the SECURITY DEFINER get_inbox_feed RPC, masking the gap.
-- Add participant-scoped SELECT policies, using a SECURITY DEFINER helper to
-- avoid recursive RLS evaluation on conversation_participants.

create or replace function public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated, service_role;

grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id, (select auth.uid())));

drop policy if exists "Participants can view participants" on public.conversation_participants;
create policy "Participants can view participants" on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id, (select auth.uid())));
