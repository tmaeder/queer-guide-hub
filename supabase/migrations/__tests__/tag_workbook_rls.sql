-- RLS + RPC contract tests for the workbook layer.
-- Run via: psql ... -f tag_workbook_rls.sql (after the workbook migrations).
--
-- Asserts the properties the migrations claim and that no source-text check can
-- prove: self-only answers, the two-party handshake, the per-answer `shared`
-- flag as an independent second gate, revocation taking effect immediately,
-- block precedence, and that an opted-out user keeps read + erase on their own
-- rows while losing writes.
--
-- Shape copied from kink_rls.sql, including the one non-obvious mechanic: the
-- policies are TO authenticated and postgres holds rolbypassrls, so each case
-- has to assume the role AND set the JWT claims — a superuser run would see no
-- denials and every case would pass vacuously.

begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  v_tag uuid;
  v_wb uuid;
  v_step_1 uuid;
  v_step_2 uuid;
  n int;
begin
  -- ── Fixtures ─────────────────────────────────────────────────────────────
  -- A published workbook with two prompt steps, on a real active tag.
  select id into v_tag from unified_tags where status = 'active' limit 1;
  if v_tag is null then
    raise exception 'FAIL: no active tag to hang a fixture workbook on';
  end if;

  insert into tag_workbooks (tag_id, slug, title, intro_md, kind, is_public, requires_partner)
  values (v_tag, 'zz-rls-fixture', 'Fixture', 'Fixture intro', 'negotiation', true, true)
  returning id into v_wb;

  insert into tag_workbook_steps (workbook_id, key, position, kind, prompt_md)
  values (v_wb, 'q1', 10, 'prompt', 'First question?') returning id into v_step_1;
  insert into tag_workbook_steps (workbook_id, key, position, kind, prompt_md)
  values (v_wb, 'q2', 20, 'prompt', 'Second question?') returning id into v_step_2;

  -- Three eligible intimate users. handle_new_user auto-creates profiles.
  insert into auth.users (id, email) values
    (a, 'wba@test'), (b, 'wbb@test'), (c, 'wbc@test') on conflict do nothing;
  update profiles set verified_email = true where user_id in (a, b, c);
  insert into intimate_profiles (id, consent_18plus_at, opted_in_at) values
    (a, now(), now()), (b, now(), now()), (c, now(), now())
  on conflict (id) do update set consent_18plus_at = now(), opted_in_at = now();

  execute 'set local role authenticated';

  -- A answers both, shares only the first.
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into tag_workbook_answers (user_id, step_id, body, shared) values
    (a, v_step_1, 'A answer one', true),
    (a, v_step_2, 'A answer two', false);

  -- ── Case 1: B cannot read A's answers directly ───────────────────────────
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if exists (select 1 from tag_workbook_answers where user_id = a) then
    raise exception 'FAIL case 1: B must not read A answers directly';
  end if;

  -- ── Case 2: B cannot write an answer for A ───────────────────────────────
  begin
    insert into tag_workbook_answers (user_id, step_id, body) values (a, v_step_1, 'forged');
    raise exception 'FAIL case 2: B inserted an answer for A';
  exception when insufficient_privilege or check_violation then
    null; -- expected
  end;

  -- ── Case 3: compare is empty before any handshake ────────────────────────
  insert into tag_workbook_answers (user_id, step_id, body, shared) values
    (b, v_step_1, 'B answer one', true),
    (b, v_step_2, 'B answer two', true);

  if workbook_compare_status(a) <> 'none' then
    raise exception 'FAIL case 3: status should be none, got %', workbook_compare_status(a);
  end if;
  select count(*) into n from workbook_compare(v_wb, a);
  if n <> 0 then
    raise exception 'FAIL case 3: compare returned % rows with no consent', n;
  end if;

  -- ── Case 4: the handshake, one half at a time ────────────────────────────
  perform kink_grant_set(a, 'workbook', true);           -- B -> A
  if workbook_compare_status(a) <> 'requested_by_me' then
    raise exception 'FAIL case 4: expected requested_by_me, got %', workbook_compare_status(a);
  end if;
  -- Still nothing: one grant is not consent.
  select count(*) into n from workbook_compare(v_wb, a);
  if n <> 0 then
    raise exception 'FAIL case 4: compare returned % rows on a half handshake', n;
  end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if workbook_compare_status(b) <> 'requested_by_other' then
    raise exception 'FAIL case 4: expected requested_by_other, got %', workbook_compare_status(b);
  end if;
  perform kink_grant_set(b, 'workbook', true);           -- A -> B
  if workbook_compare_status(b) <> 'active' then
    raise exception 'FAIL case 4: expected active, got %', workbook_compare_status(b);
  end if;

  -- ── Case 5: only the answer A SHARED appears ─────────────────────────────
  -- A shared q1 and withheld q2; B shared both. So exactly one row, and it must
  -- be q1. This is the property the per-answer flag exists for: the handshake
  -- alone must not reveal q2.
  select count(*) into n from workbook_compare(v_wb, b);
  if n <> 1 then
    raise exception 'FAIL case 5: expected exactly 1 shared row, got %', n;
  end if;
  if not exists (select 1 from workbook_compare(v_wb, b) where step_key = 'q1') then
    raise exception 'FAIL case 5: the shared step q1 is missing from the compare';
  end if;
  if exists (select 1 from workbook_compare(v_wb, b) where step_key = 'q2') then
    raise exception 'FAIL case 5: the UNSHARED step q2 leaked into the compare';
  end if;
  -- And both bodies are present on the row that did appear.
  if exists (
    select 1 from workbook_compare(v_wb, b)
    where step_key = 'q1' and (my_body is null or their_body is null)
  ) then
    raise exception 'FAIL case 5: a revealed row is missing one of the two bodies';
  end if;

  -- ── Case 6: flipping `shared` on reveals the second answer ───────────────
  -- Proves the flag is read live rather than captured at handshake time.
  update tag_workbook_answers set shared = true
   where user_id = a and step_id = v_step_2;
  select count(*) into n from workbook_compare(v_wb, b);
  if n <> 2 then
    raise exception 'FAIL case 6: expected 2 rows after sharing q2, got %', n;
  end if;

  -- ── Case 7: revoking one half empties it immediately ─────────────────────
  perform kink_grant_set(b, 'workbook', false);
  if workbook_compare_status(b) <> 'requested_by_other' then
    raise exception 'FAIL case 7: expected requested_by_other after revoke, got %',
      workbook_compare_status(b);
  end if;
  select count(*) into n from workbook_compare(v_wb, b);
  if n <> 0 then
    raise exception 'FAIL case 7: compare returned % rows after a revoke', n;
  end if;
  -- Re-grant for the remaining cases.
  perform kink_grant_set(b, 'workbook', true);

  -- ── Case 8: a block beats an active handshake ────────────────────────────
  insert into user_relationships (user_id, related_user_id, relationship_type)
  values (a, b, 'block') on conflict do nothing;
  if workbook_compare_status(b) <> 'none' then
    raise exception 'FAIL case 8: a block must collapse the status, got %',
      workbook_compare_status(b);
  end if;
  select count(*) into n from workbook_compare(v_wb, b);
  if n <> 0 then
    raise exception 'FAIL case 8: compare returned % rows across a block', n;
  end if;
  delete from user_relationships
   where user_id = a and related_user_id = b and relationship_type = 'block';

  -- ── Case 9: the workbook grant does NOT grant a kink compare ─────────────
  -- The separate `kind` is the whole reason the vocabulary was extended rather
  -- than reusing 'compare'; if this ever passes as 'active' the two reveals
  -- have been silently merged.
  if kink_compare_status(b) = 'active' then
    raise exception 'FAIL case 9: a workbook grant unlocked the kink-list compare';
  end if;

  -- ── Case 10: an unpublished workbook reveals nothing, even with consent ──
  update tag_workbooks set is_public = false where id = v_wb;
  select count(*) into n from workbook_compare(v_wb, b);
  if n <> 0 then
    raise exception 'FAIL case 10: an unpublished workbook revealed % rows', n;
  end if;
  update tag_workbooks set is_public = true where id = v_wb;

  -- ── Case 11: opting out keeps READ and DELETE, loses INSERT ──────────────
  -- The asymmetry copied from kink_ratings. A user who leaves the intimate
  -- layer must still be able to see and erase what they wrote.
  update intimate_profiles set opted_in_at = null where id = a;

  select count(*) into n from tag_workbook_answers where user_id = a;
  if n < 1 then
    raise exception 'FAIL case 11: an opted-out user lost read access to their own answers';
  end if;

  begin
    insert into tag_workbook_answers (user_id, step_id, body)
    values (a, v_step_1, 'should fail')
    on conflict (user_id, step_id) do update set body = 'should fail';
    raise exception 'FAIL case 11: an opted-out user wrote a new answer';
  exception when insufficient_privilege or check_violation then
    null; -- expected
  end;

  delete from tag_workbook_answers where user_id = a and step_id = v_step_2;
  if exists (select 1 from tag_workbook_answers where user_id = a and step_id = v_step_2) then
    raise exception 'FAIL case 11: an opted-out user could not erase their own answer';
  end if;

  -- ── Case 12: C, a third party with no grant, sees nothing ───────────────
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  if exists (select 1 from tag_workbook_answers where user_id in (a, b)) then
    raise exception 'FAIL case 12: C read another user''s answers';
  end if;
  select count(*) into n from workbook_compare(v_wb, a);
  if n <> 0 then
    raise exception 'FAIL case 12: C got % compare rows with no handshake', n;
  end if;

  -- ── Case 13: the definition IS publicly readable ─────────────────────────
  -- The mirror of every case above. If the answers are private AND the prompts
  -- are unreachable, the band renders nothing and every privacy case passes
  -- vacuously — so this asserts the public half still works.
  select count(*) into n from tag_workbook_steps where workbook_id = v_wb;
  if n <> 2 then
    raise exception 'FAIL case 13: a signed-in non-owner cannot read the prompts (% of 2)', n;
  end if;

  raise notice 'tag_workbook_rls: cases 1-13 pass';
end $$;

rollback;
