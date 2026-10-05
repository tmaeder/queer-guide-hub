-- Enforce user blocks on one-to-one messaging.
--
-- `is_blocked(a, b)` (20260624110000_safety_spine_block_enforcement) checks a
-- `user_relationships` block in EITHER direction and is applied to the feed,
-- comments and group invites — but nowhere in messaging. Measured before this
-- migration: `get_or_create_direct_conversation` / `ensure_conversation_between`
-- never consulted it, the `messages` INSERT policy only checks participation,
-- and `suggest_message_recipients` offered blocked users as recipients. So a
-- blocked person could open a DM, or keep writing into an existing one.
--
-- Scope, deliberately:
--   * DIRECT conversations only. A block does not eject anyone from a group
--     chat; that is a group-moderation question, not this one.
--   * The check lives in the public RPC, NOT in `ensure_conversation_between`.
--     That helper is also called by the friend-accept path; raising there would
--     turn an unrelated accept into an error instead of simply not messaging.
--   * Message sends are gated by a RESTRICTIVE policy rather than by rewriting
--     the existing permissive one, so the participation rule is untouched and a
--     later CREATE OR REPLACE of either cannot silently drop the other.
--
-- Found while dry-running this: `suggest_message_recipients` could not run AT
-- ALL. Its RETURNS TABLE has an OUT column `user_id`, and the body's
-- `NOT IN (SELECT user_id FROM recent)` is ambiguous with it, so every call by
-- a user with a recent conversation raised 42702 at plan time — the
-- RecipientPicker on /messages has been erroring, not just leaking blocked
-- users. `CREATE OR REPLACE` only parses a plpgsql body; it never plans the
-- queries inside it, which is how this shipped. Fixed with
-- `#variable_conflict use_column`, and the postcondition below EXECUTES the
-- function as a real participant instead of grepping its source.
--
-- Blast radius measured on prod at authoring time: 0 block rows, 6 direct
-- conversations, 0 conversations between a blocked pair. Nothing existing
-- changes behaviour; this closes the path before it is used.

-- 1. Helper: would this sender be writing into a direct conversation with
--    someone they are in a block relationship with?
create or replace function public.dm_send_blocked(p_conversation_id uuid, p_sender uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_participants op
      on op.conversation_id = c.id and op.user_id <> p_sender
    where c.id = p_conversation_id
      and coalesce(c.conversation_type, 'direct') = 'direct'
      and public.is_blocked(p_sender, op.user_id)
  );
$$;

revoke all on function public.dm_send_blocked(uuid, uuid) from public, anon;
grant execute on function public.dm_send_blocked(uuid, uuid) to authenticated, service_role;

-- 2. Opening a DM with a blocked user is refused.
create or replace function public.get_or_create_direct_conversation(user1_id uuid, user2_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> user1_id AND auth.uid() <> user2_id THEN
    RAISE EXCEPTION 'cannot create a conversation on behalf of other users';
  END IF;
  IF public.is_blocked(user1_id, user2_id) THEN
    RAISE EXCEPTION 'cannot message this user' USING ERRCODE = '42501';
  END IF;
  RETURN public.ensure_conversation_between(user1_id, user2_id, 'direct');
END $function$;

-- 3. Sending into an existing DM with a blocked user is refused.
drop policy if exists "Blocked users cannot send direct messages" on public.messages;
create policy "Blocked users cannot send direct messages"
  on public.messages
  as restrictive
  for insert
  to authenticated
  with check (not public.dm_send_blocked(conversation_id, sender_id));

-- 4. Recipient suggestions: make the function runnable, then skip blocked
--    users. Patched from the LIVE definition rather than restated, so whatever
--    the current body is survives intact. Each step is idempotent.
do $patch$
declare
  v_def text := pg_get_functiondef('public.suggest_message_recipients(uuid,integer)'::regprocedure);
  v_new text := v_def;
begin
  if position('#variable_conflict use_column' in v_new) = 0 then
    v_new := regexp_replace(v_new, 'AS \$function\$\n', E'AS $function$\n#variable_conflict use_column\n');
    if position('#variable_conflict use_column' in v_new) = 0 then
      raise exception 'suggest_message_recipients: body opener not found; conflict directive not applied';
    end if;
  end if;
  if position('is_blocked(p_user, m.user_id)' in v_new) = 0 then
    v_new := replace(
      v_new,
      E'  FROM merged m\n  ORDER BY',
      E'  FROM merged m\n  WHERE NOT public.is_blocked(p_user, m.user_id)\n  ORDER BY'
    );
    if position('is_blocked(p_user, m.user_id)' in v_new) = 0 then
      raise exception 'suggest_message_recipients: anchor "FROM merged m / ORDER BY" not found; block filter not applied';
    end if;
  end if;
  if v_new <> v_def then
    execute v_new;
  end if;
end
$patch$;

-- Postconditions: assert what the file exists to reach.
do $verify$
begin
  if position('is_blocked(user1_id, user2_id)' in
       pg_get_functiondef('public.get_or_create_direct_conversation(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'get_or_create_direct_conversation lacks the block check';
  end if;
  if position('is_blocked(p_user, m.user_id)' in
       pg_get_functiondef('public.suggest_message_recipients(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'suggest_message_recipients lacks the block filter';
  end if;
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.messages'::regclass
      and polname = 'Blocked users cannot send direct messages'
      and polpermissive = false
      and polcmd = 'a'
  ) then
    raise exception 'restrictive block policy on messages missing';
  end if;
  if has_function_privilege('anon', 'public.dm_send_blocked(uuid,uuid)', 'EXECUTE') then
    raise exception 'dm_send_blocked must not be callable by anon';
  end if;
end
$verify$;

-- The function must actually RUN. It returns early unless p_user = auth.uid(),
-- so call it as a real conversation participant; on an empty database (a
-- rebuild from zero) there is nobody to call it as and the check is skipped.
do $verify_runs$
declare
  v_user uuid;
  v_n int;
begin
  select user_id into v_user from public.conversation_participants limit 1;
  if v_user is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  select count(*) into v_n from public.suggest_message_recipients(v_user, 5);
  perform set_config('request.jwt.claims', '', true);
end
$verify_runs$;
