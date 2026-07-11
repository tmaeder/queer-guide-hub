-- Privacy contract tests for friends_birthdays(p_from, p_to).
-- Run via: psql ... -f friends_birthdays_rls.sql
-- Invariants: opt-in gating, accepted-friendship gating, no year/age in the
-- return shape, anon denial.

begin;

do $$
declare
  viewer_id uuid := gen_random_uuid();
  friend_optin_id uuid := gen_random_uuid();
  friend_optout_id uuid := gen_random_uuid();
  stranger_optin_id uuid := gen_random_uuid();
  win_from date := date '2026-07-01';
  win_to date := date '2026-07-31';
  row_count int;
  got date;
begin
  insert into auth.users (id, email) values
    (viewer_id, 'viewer@t'), (friend_optin_id, 'fin@t'),
    (friend_optout_id, 'fout@t'), (stranger_optin_id, 'str@t')
    on conflict do nothing;

  -- Profiles are auto-created by the on-auth-user-insert trigger — UPDATE them.
  -- All born July 15 (different years to prove the year never leaks).
  update profiles set display_name = 'Friend In',  date_of_birth = date '1990-07-15',
         privacy_settings = coalesce(privacy_settings, '{}'::jsonb) || jsonb_build_object('birthday_visibility', 'friends')
   where user_id = friend_optin_id;
  update profiles set display_name = 'Friend Out', date_of_birth = date '1985-07-15'
   where user_id = friend_optout_id;
  update profiles set display_name = 'Stranger',   date_of_birth = date '1970-07-15',
         privacy_settings = coalesce(privacy_settings, '{}'::jsonb) || jsonb_build_object('birthday_visibility', 'friends')
   where user_id = stranger_optin_id;

  -- Friendships: viewer <-> optin (accepted), viewer <-> optout (accepted).
  -- No relationship with stranger.
  insert into user_relationships (user_id, target_user_id, relationship_type, status) values
    (viewer_id, friend_optin_id, 'friend', 'accepted'),
    (friend_optout_id, viewer_id, 'friend', 'accepted');

  -- Authenticated as viewer.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);

  -- 1. Opted-in accepted friend appears, anchored to the window year.
  select count(*), min(fb.occurs_on) into row_count, got
    from friends_birthdays(win_from, win_to) fb
   where fb.user_id = friend_optin_id;
  if row_count <> 1 then
    raise exception 'FAIL: opted-in friend should appear exactly once, got %', row_count;
  end if;
  if got <> date '2026-07-15' then
    raise exception 'FAIL: occurs_on must be window-year anchored (no birth year), got %', got;
  end if;

  -- 2. Opted-out friend never appears.
  if exists (select 1 from friends_birthdays(win_from, win_to) fb
              where fb.user_id = friend_optout_id) then
    raise exception 'FAIL: opted-out friend must not appear';
  end if;

  -- 3. Opted-in NON-friend never appears.
  if exists (select 1 from friends_birthdays(win_from, win_to) fb
              where fb.user_id = stranger_optin_id) then
    raise exception 'FAIL: non-friend must not appear even when opted in';
  end if;

  -- 4. Window without the birthday month/day → empty.
  if exists (select 1 from friends_birthdays(date '2026-08-01', date '2026-08-31')) then
    raise exception 'FAIL: no birthdays expected in August window';
  end if;

  -- 5. Anon gets nothing.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into row_count from friends_birthdays(win_from, win_to);
    if row_count <> 0 then
      raise exception 'FAIL: anon must get zero rows, got %', row_count;
    end if;
  exception
    when insufficient_privilege then
      null; -- EXECUTE revoked from anon is equally acceptable
  end;

  raise notice 'PASS: friends_birthdays privacy contract holds';
end $$;

rollback;
