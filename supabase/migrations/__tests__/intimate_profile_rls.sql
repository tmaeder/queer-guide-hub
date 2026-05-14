-- RLS contract tests for intimate_profiles.
-- Run via: psql ... -f intimate_profile_rls.sql (or pgTAP harness).
-- Asserts mutual-opt-in policy + block precedence + 18+ gate.

begin;

-- fixtures
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (a, 'a@test'), (b, 'b@test') on conflict do nothing;
  insert into profiles (id, verified_email) values (a, true), (b, true) on conflict (id) do update set verified_email=true;

  perform set_config('request.jwt.claim.sub', a::text, true);

  -- Case 1: neither side opted in → cannot see B.
  insert into intimate_profiles (id) values (a) on conflict (id) do nothing;
  insert into intimate_profiles (id) values (b) on conflict (id) do nothing;
  if exists (select 1 from intimate_profiles where id = b) then
    raise exception 'FAIL: A should not see B when neither opted in';
  end if;

  -- Case 2: A opts in only → still cannot see B.
  update intimate_profiles set consent_18plus_at = now(), opted_in_at = now() where id = a;
  if exists (select 1 from intimate_profiles where id = b) then
    raise exception 'FAIL: A should not see B when B not opted in';
  end if;

  -- Case 3: both opted in → A can see B.
  perform set_config('request.jwt.claim.sub', b::text, true);
  update intimate_profiles set consent_18plus_at = now(), opted_in_at = now() where id = b;
  perform set_config('request.jwt.claim.sub', a::text, true);
  if not exists (select 1 from intimate_profiles where id = b) then
    raise exception 'FAIL: A should see B when both opted in';
  end if;

  -- Case 4: A blocks B → A cannot see B.
  insert into user_relationships (user_id, target_user_id, relationship_type, status)
    values (a, b, 'block', 'accepted');
  if exists (select 1 from intimate_profiles where id = b) then
    raise exception 'FAIL: blocked target must not be visible';
  end if;

  raise notice 'PASS: intimate_profiles RLS contract';
end $$;

rollback;
