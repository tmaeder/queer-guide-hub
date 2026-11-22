-- Inbox: per-filter unread counts, DM-alert dedupe, per-user realtime ping.
-- Design: docs/plans/2026-11-22-messages-page-design.md
--
-- 1. A direct message wrote a 'dm' notification AND moved its chat to unread,
--    so one message was counted twice (bell + chat) and opening the chat never
--    cleared the alert — on prod all 4 'dm' notifications of the last 60 days
--    were still unread. The chat already carries the message, so 'dm' /
--    'message' notifications leave the inbox's alert lane, and reading a
--    conversation marks its 'dm' notifications read.
-- 2. get_inbox_unread_counts() returns one count per inbox filter. The header
--    badge and the filter chips used to count unread rows inside the first
--    30-row page of a full feed each; they now read one cheap query.
-- 3. The client subscribed to whole tables (messages, conversations,
--    post_likes, post_comments, trip_inbox_*) so any write by anyone refetched
--    every open inbox, and notifications / group_notifications are not in the
--    supabase_realtime publication at all, so alerts never arrived live.
--    Triggers now send one private broadcast 'inbox_changed' to
--    'inbox:<user_id>' per affected recipient.

-- ---------------------------------------------------------------------------
-- 1a. Feed: drop 'dm' / 'message' notifications from the alert lane.
--     Patched from the live definition (not restated) with an exactly-once
--     anchor, so whatever else the live body carries survives.
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_src text := pg_get_functiondef('api_private.get_inbox_feed(uuid, timestamptz, text, text, integer)'::regprocedure);
  v_from text := E'FROM public.notifications n\n    WHERE n.user_id = p_user';
  v_to text := E'FROM public.notifications n\n    WHERE n.user_id = p_user\n      AND n.type NOT IN (''dm'', ''message'')';
begin
  if position(v_to in v_src) > 0 then
    return; -- already applied
  end if;
  if (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'get_inbox_feed: notifications anchor not found exactly once';
  end if;
  execute replace(v_src, v_from, v_to);
end
$patch$;

-- ---------------------------------------------------------------------------
-- 1b. Reading a conversation clears its 'dm' notifications.
-- ---------------------------------------------------------------------------
create or replace function api_private.clear_dm_notifications_on_read()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.last_read_at is not null
     and new.last_read_at is distinct from old.last_read_at then
    update public.notifications n
       set read = true
     where n.user_id = new.user_id
       and n.type = 'dm'
       and n.related_id = new.conversation_id
       and n.read = false
       and n.created_at <= new.last_read_at;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_cp_clear_dm_notifications on public.conversation_participants;
create trigger trg_cp_clear_dm_notifications
  after update of last_read_at on public.conversation_participants
  for each row execute function api_private.clear_dm_notifications_on_read();

-- Backfill: dm notifications for conversations already read past them.
update public.notifications n
   set read = true
  from public.conversation_participants cp
 where n.type = 'dm'
   and n.read = false
   and cp.user_id = n.user_id
   and cp.conversation_id = n.related_id
   and cp.last_read_at is not null
   and n.created_at <= cp.last_read_at;

-- ---------------------------------------------------------------------------
-- 2. Unread counts per filter. Same predicates as get_inbox_feed, except a
--    chat counts only when someone else wrote after your last read (the feed's
--    `unread` flag also fires on your own last message) and muted / archived
--    chats never count.
-- ---------------------------------------------------------------------------
create or replace function api_private.get_inbox_unread_counts(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_seen timestamptz;
  v_chats int; v_matches int; v_groups int; v_mail int;
  v_notif int; v_trip_nudge int; v_grp int; v_likes int; v_comments int; v_tripmail int;
begin
  if p_user is null or auth.uid() is null or p_user <> auth.uid() then
    return jsonb_build_object('all',0,'chats',0,'mail',0,'alerts',0,'matches',0,'groups',0,'trips',0);
  end if;

  select coalesce(post_engagement_seen_at, '1970-01-01'::timestamptz)
    into v_seen from public.profiles where user_id = p_user;
  v_seen := coalesce(v_seen, '1970-01-01'::timestamptz);

  select count(*),
         count(*) filter (where c.conversation_type = 'match'),
         count(*) filter (where c.conversation_type = 'group')
    into v_chats, v_matches, v_groups
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
   where cp.user_id = p_user
     and coalesce(cp.is_archived, false) = false
     and coalesce(cp.is_muted, false) = false
     and exists (
       select 1 from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> p_user
          and (cp.last_read_at is null or m.created_at > cp.last_read_at));

  select count(*) into v_mail
    from public.mailbox_emails e
   where e.owner_id = p_user and e.folder = 'inbox'
     and e.deleted_at is null and e.is_read = false;

  select count(*), count(*) filter (where n.type = 'trip_nudge')
    into v_notif, v_trip_nudge
    from public.notifications n
   where n.user_id = p_user and n.read = false
     and n.type not in ('dm', 'message');

  select count(*) into v_grp
    from public.group_notifications gn
   where gn.user_id = p_user and gn.read_at is null;

  select count(*) into v_likes
    from public.post_likes pl
    join public.community_posts p on p.id = pl.post_id
   where p.user_id = p_user and pl.user_id <> p_user and pl.created_at > v_seen;

  select count(*) into v_comments
    from public.post_comments pc
    join public.community_posts p on p.id = pc.post_id
   where p.user_id = p_user and pc.user_id <> p_user and pc.created_at > v_seen;

  select count(*) into v_tripmail
    from public.trip_inbox_items i
   where public.is_trip_member(i.trip_id, p_user)
     and i.parse_status <> 'dismissed'
     and (i.read_at is null or exists (
       select 1 from public.trip_inbox_messages am
        where am.item_id = i.id and am.role = 'assistant' and am.created_at > i.read_at));

  return jsonb_build_object(
    'all',     v_chats + v_mail + v_notif + v_grp + v_likes + v_comments + v_tripmail,
    'chats',   v_chats,
    'mail',    v_mail,
    'alerts',  v_notif + v_grp + v_likes + v_comments,
    'matches', v_matches,
    'groups',  v_groups,
    'trips',   v_tripmail + v_trip_nudge
  );
end
$fn$;

create or replace function public.get_inbox_unread_counts(p_user uuid)
returns jsonb
language sql
stable
set search_path to ''
as $fn$select api_private.get_inbox_unread_counts(p_user => $1)$fn$;

revoke all on function api_private.get_inbox_unread_counts(uuid) from public, anon;
revoke all on function public.get_inbox_unread_counts(uuid) from public, anon;
grant execute on function api_private.get_inbox_unread_counts(uuid) to authenticated, service_role;
grant execute on function public.get_inbox_unread_counts(uuid) to authenticated, service_role;

-- The single-number badge keeps its signature and now reads the same total.
create or replace function api_private.get_inbox_unread_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $fn$select (api_private.get_inbox_unread_counts(p_user) ->> 'all')::int$fn$;

-- ---------------------------------------------------------------------------
-- 3. Per-user realtime ping.
-- ---------------------------------------------------------------------------
create or replace function api_private.inbox_ping(p_users uuid[])
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user uuid;
begin
  foreach v_user in array coalesce(p_users, '{}'::uuid[]) loop
    if v_user is null then continue; end if;
    begin
      perform realtime.send('{}'::jsonb, 'inbox_changed', 'inbox:' || v_user::text, true);
    exception when others then
      -- A ping is a hint to refetch; it must never fail the write it describes.
      raise warning 'inbox_ping failed for %: %', v_user, sqlerrm;
    end;
  end loop;
end
$fn$;

revoke all on function api_private.inbox_ping(uuid[]) from public, anon, authenticated;

create or replace function api_private.inbox_ping_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r record := coalesce(new, old);
  v_users uuid[];
begin
  case tg_table_name
    when 'messages' then
      select array_agg(cp.user_id) into v_users
        from public.conversation_participants cp
       where cp.conversation_id = r.conversation_id;
    when 'conversation_participants', 'group_notifications' then
      v_users := array[r.user_id];
    when 'notifications' then
      v_users := array[r.user_id];
    when 'mailbox_emails' then
      v_users := array[r.owner_id];
    when 'post_likes', 'post_comments' then
      select array_agg(p.user_id) into v_users
        from public.community_posts p
       where p.id = r.post_id and p.user_id <> r.user_id;
    when 'trip_inbox_items' then
      select array_agg(tm.user_id) into v_users
        from public.trip_members tm
       where tm.trip_id = r.trip_id and tm.accepted_at is not null;
    when 'trip_inbox_messages' then
      select array_agg(tm.user_id) into v_users
        from public.trip_inbox_items i
        join public.trip_members tm on tm.trip_id = i.trip_id and tm.accepted_at is not null
       where i.id = r.item_id;
    else
      v_users := null;
  end case;
  perform api_private.inbox_ping(v_users);
  return null;
end
$fn$;

do $triggers$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'conversation_participants', 'notifications', 'group_notifications',
    'mailbox_emails', 'post_likes', 'post_comments', 'trip_inbox_items', 'trip_inbox_messages'
  ] loop
    execute format('drop trigger if exists trg_inbox_ping on public.%I', t);
    execute format(
      'create trigger trg_inbox_ping after insert or update or delete on public.%I '
      || 'for each row execute function api_private.inbox_ping_trigger()', t);
  end loop;
end
$triggers$;

-- Only the owner may join their private inbox topic.
drop policy if exists "inbox topic: owner receives" on realtime.messages;
create policy "inbox topic: owner receives"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'inbox:' || (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src text := pg_get_functiondef('api_private.get_inbox_feed(uuid, timestamptz, text, text, integer)'::regprocedure);
  v_n int;
begin
  if position('AND n.type NOT IN (''dm'', ''message'')' in v_src) = 0 then
    raise exception 'P1 failed: get_inbox_feed still lists dm notifications';
  end if;

  select count(*) into v_n from pg_trigger
   where tgname = 'trg_inbox_ping' and not tgisinternal;
  if v_n <> 9 then
    raise exception 'P2 failed: expected 9 trg_inbox_ping triggers, found %', v_n;
  end if;

  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_cp_clear_dm_notifications'
                    and tgrelid = 'public.conversation_participants'::regclass) then
    raise exception 'P3 failed: dm-clearing trigger missing';
  end if;

  if has_function_privilege('anon', 'public.get_inbox_unread_counts(uuid)', 'EXECUTE') then
    raise exception 'P4 failed: anon can execute get_inbox_unread_counts';
  end if;

  if not exists (select 1 from pg_policy
                  where polrelid = 'realtime.messages'::regclass
                    and polname = 'inbox topic: owner receives') then
    raise exception 'P5 failed: inbox topic policy missing';
  end if;
end
$verify$;
