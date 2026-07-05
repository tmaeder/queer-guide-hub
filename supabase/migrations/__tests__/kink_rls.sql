-- RLS + RPC contract tests for the kink checklist.
-- Run via: psql ... -f kink_rls.sql (after taxonomy seed).
-- Asserts: self-only ratings, private-by-default tiers, positives-only view,
-- compare handshake, hard-limit silent veto, block precedence.

begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  v_kissing uuid;
  v_oral uuid;
  v_spanking uuid;
  v_cat_affection uuid;
  v_cat_oral uuid;
  v_cat_impact uuid;
  n int;
begin
  select id into v_kissing  from kink_items where slug = 'kissing';
  select id into v_oral     from kink_items where slug = 'oral-sex';
  select id into v_spanking from kink_items where slug = 'spanking';
  select category_id into v_cat_affection from kink_items where slug = 'kissing';
  select category_id into v_cat_oral      from kink_items where slug = 'oral-sex';
  select category_id into v_cat_impact    from kink_items where slug = 'spanking';
  if v_kissing is null or v_oral is null or v_spanking is null then
    raise exception 'FAIL: taxonomy seed missing';
  end if;

  -- fixtures: two eligible intimate users
  -- handle_new_user trigger auto-creates the profiles rows; just flip the flag.
  insert into auth.users (id, email) values (a, 'ka@test'), (b, 'kb@test') on conflict do nothing;
  update profiles set verified_email = true where user_id in (a, b);
  insert into intimate_profiles (id, consent_18plus_at, opted_in_at) values
    (a, now(), now()), (b, now(), now())
  on conflict (id) do update set consent_18plus_at = now(), opted_in_at = now();

  -- Kink policies are role-scoped (TO authenticated) — assume the role so they
  -- apply; superuser with FORCE RLS and no matching policy would see denials.
  execute 'set local role authenticated';

  -- A rates: kissing favorite (general), oral giving like, oral receiving favorite,
  -- spanking hard_limit (giving).
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into kink_ratings (user_id, item_id, side, rating) values
    (a, v_kissing, 'general', 'favorite'),
    (a, v_oral, 'giving', 'like'),
    (a, v_oral, 'receiving', 'favorite'),
    (a, v_spanking, 'giving', 'hard_limit');

  -- Case 1: B cannot read A's rating rows (self-only table RLS).
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if exists (select 1 from kink_ratings where user_id = a) then
    raise exception 'FAIL: B must not read A ratings directly';
  end if;

  -- Case 2: B cannot write rating rows for A.
  begin
    insert into kink_ratings (user_id, item_id, side, rating)
      values (a, v_kissing, 'general', 'no');
    raise exception 'FAIL: B inserted a rating for A';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS refusal
  end;

  -- Case 3: default tier = private → kink_get_visible empty for B.
  select count(*) into n from kink_get_visible(a);
  if n <> 0 then
    raise exception 'FAIL: private-by-default leaked % rows', n;
  end if;

  -- Case 4: A opens affection + impact categories at members tier → B sees the
  -- kissing favorite but NEVER the spanking hard_limit.
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into kink_category_visibility (user_id, category_id, tier) values
    (a, v_cat_affection, 'members'),
    (a, v_cat_impact, 'members')
  on conflict (user_id, category_id) do update set tier = 'members';

  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if not exists (select 1 from kink_get_visible(a) where item_slug = 'kissing') then
    raise exception 'FAIL: members-tier kissing should be visible to B';
  end if;
  if exists (select 1 from kink_get_visible(a) where item_slug = 'spanking') then
    raise exception 'FAIL: hard_limit must never be visible to others';
  end if;
  if exists (select 1 from kink_get_visible(a) where item_slug = 'oral-sex') then
    raise exception 'FAIL: private category (oral) leaked';
  end if;

  -- Case 5: compare requires BOTH grants; intersection only; veto silent.
  -- B rates: kissing favorite, oral receiving favorite (matches A giving like),
  -- oral giving curious (matches A receiving favorite), spanking receiving like
  -- (must be vetoed by A's hard_limit).
  insert into kink_ratings (user_id, item_id, side, rating) values
    (b, v_kissing, 'general', 'favorite'),
    (b, v_oral, 'receiving', 'favorite'),
    (b, v_oral, 'giving', 'curious'),
    (b, v_spanking, 'receiving', 'like');
  -- B exposes all three categories at members tier (compare ceiling <= 3 ok).
  insert into kink_category_visibility (user_id, category_id, tier) values
    (b, v_cat_affection, 'members'),
    (b, v_cat_oral, 'members'),
    (b, v_cat_impact, 'members')
  on conflict (user_id, category_id) do update set tier = 'members';

  if kink_compare_status(a) <> 'none' then
    raise exception 'FAIL: compare status should be none before grants';
  end if;
  select count(*) into n from kink_compare(a);
  if n <> 0 then
    raise exception 'FAIL: compare must be empty before handshake';
  end if;

  perform kink_grant_set(a, 'compare', true, null);
  if kink_compare_status(a) <> 'requested_by_me' then
    raise exception 'FAIL: status should be requested_by_me';
  end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if kink_compare_status(b) <> 'requested_by_other' then
    raise exception 'FAIL: status should be requested_by_other for A';
  end if;
  perform kink_grant_set(b, 'compare', true, null);
  if kink_compare_status(b) <> 'active' then
    raise exception 'FAIL: status should be active after both grants';
  end if;

  -- A also needs oral + affection exposed (compare ceiling: tier <> private).
  insert into kink_category_visibility (user_id, category_id, tier) values
    (a, v_cat_oral, 'matches')
  on conflict (user_id, category_id) do update set tier = 'matches';

  -- kissing overlap (general/general) + oral both directions = 3 rows; spanking vetoed.
  select count(*) into n from kink_compare(b);
  if n <> 3 then
    raise exception 'FAIL: expected 3 compare rows, got %', n;
  end if;
  if exists (select 1 from kink_compare(b) where item_slug = 'spanking') then
    raise exception 'FAIL: vetoed item leaked into compare';
  end if;

  -- Case 6: revoke one side → empty again.
  perform kink_grant_set(b, 'compare', false, null);
  select count(*) into n from kink_compare(b);
  if n <> 0 then
    raise exception 'FAIL: compare must be empty after revoke';
  end if;

  -- Case 7: block precedence → rank 0, nothing visible either way.
  insert into user_relationships (user_id, target_user_id, relationship_type, status)
    values (a, b, 'block', 'accepted');
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from kink_get_visible(a);
  if n <> 0 then
    raise exception 'FAIL: blocked pair must see nothing';
  end if;

  raise notice 'PASS: kink checklist RLS + RPC contract';
end $$;

rollback;
