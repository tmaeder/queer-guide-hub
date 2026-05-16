-- RLS contract tests for trip_inboxes + trip_inbox_items.
-- Run via: psql ... -f trip_inbox_rls.sql

begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  trip_uuid uuid := gen_random_uuid();
  inbox_id uuid;
  item_id uuid;
begin
  insert into auth.users (id, email) values
    (owner_id, 'o@t'), (member_id, 'm@t'), (stranger_id, 's@t')
    on conflict do nothing;

  -- minimal trip + members
  insert into trips (id, owner_id, title) values (trip_uuid, owner_id, 'T')
    on conflict (id) do nothing;
  insert into trip_members (trip_id, user_id, role, accepted_at)
    values (trip_uuid, owner_id, 'owner', now()),
           (trip_uuid, member_id, 'editor', now())
    on conflict do nothing;

  -- service-role: insert as if from the worker
  perform set_config('role', 'service_role', true);
  insert into trip_inboxes (trip_id, short_id, created_by)
    values (trip_uuid, 'rlstest1', owner_id)
    returning id into inbox_id;
  insert into trip_inbox_items (trip_id, raw_subject, parse_status)
    values (trip_uuid, 'hello', 'parsed')
    returning id into item_id;

  -- owner can see
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if not exists (select 1 from trip_inboxes where id = inbox_id) then
    raise exception 'FAIL: owner should see inbox';
  end if;
  if not exists (select 1 from trip_inbox_items where id = item_id) then
    raise exception 'FAIL: owner should see item';
  end if;

  -- member can see
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if not exists (select 1 from trip_inboxes where id = inbox_id) then
    raise exception 'FAIL: member should see inbox';
  end if;

  -- stranger cannot see
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  if exists (select 1 from trip_inboxes where id = inbox_id) then
    raise exception 'FAIL: stranger should NOT see inbox';
  end if;
  if exists (select 1 from trip_inbox_items where id = item_id) then
    raise exception 'FAIL: stranger should NOT see item';
  end if;

  raise notice 'OK: trip_inbox RLS contract holds';
end$$;

rollback;
