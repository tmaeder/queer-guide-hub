-- RLS contract tests for trip_inbox_messages + mark_trip_inbox_item_read.
-- Run via: psql ... -f trip_inbox_messages_rls.sql

begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  trip_uuid uuid := gen_random_uuid();
  item_id uuid;
  msg_id uuid;
begin
  insert into auth.users (id, email) values
    (owner_id, 'o@tm'), (viewer_id, 'v@tm'), (stranger_id, 's@tm')
    on conflict do nothing;

  insert into trips (id, owner_id, title) values (trip_uuid, owner_id, 'T')
    on conflict (id) do nothing;
  insert into trip_members (trip_id, user_id, role, accepted_at)
    values (trip_uuid, owner_id, 'owner', now()),
           (trip_uuid, viewer_id, 'viewer', now())
    on conflict do nothing;

  -- service-role: item from the worker + one assistant turn from the edge fn
  perform set_config('role', 'service_role', true);
  insert into trip_inbox_items (trip_id, raw_subject, parse_status)
    values (trip_uuid, 'hello', 'parsed')
    returning id into item_id;
  insert into trip_inbox_messages (item_id, trip_id, role, content)
    values (item_id, trip_uuid, 'assistant', 'hi')
    returning id into msg_id;

  -- member (viewer role) can read the thread
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  if not exists (select 1 from trip_inbox_messages where id = msg_id) then
    raise exception 'FAIL: trip member should see thread messages';
  end if;

  -- member can append their own user turn
  insert into trip_inbox_messages (item_id, trip_id, role, content, created_by)
    values (item_id, trip_uuid, 'user', 'fix the date', viewer_id);

  -- member cannot forge an assistant turn
  begin
    insert into trip_inbox_messages (item_id, trip_id, role, content, created_by)
      values (item_id, trip_uuid, 'assistant', 'forged', viewer_id);
    raise exception 'FAIL: member should NOT insert assistant turns';
  exception when insufficient_privilege or check_violation then
    null; -- expected
  end;

  -- member cannot write turns as someone else
  begin
    insert into trip_inbox_messages (item_id, trip_id, role, content, created_by)
      values (item_id, trip_uuid, 'user', 'spoofed', owner_id);
    raise exception 'FAIL: member should NOT spoof created_by';
  exception when insufficient_privilege or check_violation then
    null; -- expected
  end;

  -- read marker: viewer (no can_edit_trip) can mark read via the RPC
  perform public.mark_trip_inbox_item_read(item_id);
  if not exists (select 1 from trip_inbox_items where id = item_id and read_at is not null) then
    raise exception 'FAIL: viewer should be able to mark item read via RPC';
  end if;

  -- stranger sees nothing and cannot mark read
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  if exists (select 1 from trip_inbox_messages where id = msg_id) then
    raise exception 'FAIL: stranger should NOT see thread messages';
  end if;
  update trip_inbox_items set read_at = null where id = item_id; -- no-op under RLS
  perform public.mark_trip_inbox_item_read(item_id);
  perform set_config('role', 'service_role', true);
  if exists (select 1 from trip_inbox_items where id = item_id and read_at is null) then
    raise exception 'FAIL: stranger mark-read should not clear/change owner state';
  end if;

  raise notice 'OK: trip_inbox_messages RLS contract holds';
end$$;

rollback;
