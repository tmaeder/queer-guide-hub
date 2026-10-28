-- 99991793210560_profiles_grant_social_links_update
--
-- /profile/settings -> Social Links could not save. Every attempt failed with a
-- generic "Failed to save. Please try again." toast, and had done since
-- 20540101100000 narrowed `authenticated`'s write grant on `profiles` from all
-- 174 columns to a 52-column allowlist.
--
-- `SocialLinksManager.save()` writes BOTH columns in one statement:
--
--   updateRowsBy('profiles', { col: 'user_id', val: user.id },
--     { social_accounts: accounts, social_links: toLegacyLinks(accounts) })
--
-- and neither column is in that allowlist. Measured on prod as `authenticated`
-- with a real JWT, in a rolled-back transaction, WITH A POSITIVE CONTROL so the
-- denial is attributable to these columns rather than to the probe:
--
--   both columns      -> 42501 permission denied for table profiles
--   social_links only -> 42501 permission denied for table profiles
--   bio (allowlisted) -> SUCCEEDED
--
-- Note the message is "permission denied for table profiles", the GRANT form,
-- not "new row violates row-level security policy", the RLS form. Both raise
-- 42501, so a handler switching on SQLSTATE alone cannot tell them apart.
--
-- Corroboration, and the limit of it: 0 of 22 profiles carry any social link or
-- account. That is consistent with the feature being broken AND with nobody
-- having tried, so it is not evidence on its own — the grant is what settles it.
--
-- WHY THE CONTRACT TEST DID NOT CATCH THIS. Its own comment says "a subset means
-- a write path the editor still uses has been cut off", which is exactly this
-- case. It missed it because its `expected` array was derived from the same
-- incomplete enumeration as the grant: 20540101100000 swept `updateProfile`
-- call sites, and this component does not use that hook — it writes through
-- `updateRowsBy('profiles', ...)` directly, so a sweep keyed on the hook name
-- could not see it. The array is widened to 54 in the same change.
--
-- UPDATE AND INSERT ONLY, NO NEW SELECT. Reads already work and need no grant:
-- `useProfile` loads the own row through `get_my_profile()`, a SECURITY DEFINER
-- function that selects * and therefore bypasses column grants entirely. That
-- matters because a column GRANT is per-ROLE and `authenticated` is ONE role
-- shared by the profile owner, every other member and every admin — so adding
-- SELECT here would expose every member's social accounts to every other
-- member, which is a different decision from letting someone edit their own.
-- INSERT is granted alongside UPDATE because the contract test requires the two
-- privilege sets to be identical, and because `useProfile`'s upsert path writes
-- the same columns; neither is an escalation column.

grant update (social_links, social_accounts) on public.profiles to authenticated;
grant insert (social_links, social_accounts) on public.profiles to authenticated;

do $verify$
declare
  v_uid uuid;
  v_missing text;
  v_leak text;
  v_update_ok boolean := false;
  v_anon_select text;
  v_links jsonb;
  v_accounts jsonb;
begin
  -- P1: both columns are now writable by `authenticated`, for both privileges.
  select string_agg(format('%s/%s', c, p), ', ') into v_missing
  from unnest(array['social_links','social_accounts']) c
  cross join unnest(array['UPDATE','INSERT']) p
  where not exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='profiles'
       and grantee='authenticated' and column_name=c and privilege_type=p);
  if v_missing is not null then
    raise exception 'P1 failed: grant missing for %', v_missing;
  end if;

  -- P2: no SELECT was added for `authenticated` on social_accounts. social_links
  -- already had SELECT before this migration and keeps it; social_accounts must
  -- not gain one, or every member can read every other member's accounts.
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='profiles'
       and grantee='authenticated' and column_name='social_accounts'
       and privilege_type='SELECT') then
    raise exception 'P2 failed: this migration must not grant authenticated SELECT on social_accounts';
  end if;

  -- P3: anon gained nothing at all, on either column.
  select string_agg(format('%s/%s', column_name, privilege_type), ', ') into v_anon_select
  from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and grantee in ('anon','PUBLIC')
     and column_name in ('social_links','social_accounts');
  if v_anon_select is not null then
    raise exception 'P3 failed: anon/PUBLIC reached social columns: %', v_anon_select;
  end if;

  -- P4: the escalation columns 20540101100000 withdrew are STILL not writable.
  -- Asserted positively here because this migration touches the same ACL, and a
  -- careless `grant update on public.profiles` (no column list) would restore
  -- self-verification and self-approval while P1 still passed.
  select string_agg(distinct column_name, ', ') into v_leak
  from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and grantee='authenticated' and privilege_type in ('UPDATE','INSERT')
     and column_name in ('verified_identity','moderation_status','verified_email',
       'verified_phone','is_business','profile_completion_percentage',
       'welcome_email_sent_at','id','created_at');
  if v_leak is not null then
    raise exception 'P4 failed: self-escalation column(s) became writable: %', v_leak;
  end if;

  -- P5: BEHAVIOURAL. A source/ACL check cannot tell a working write path from a
  -- broken one, which is how this shipped: the grant was absent and every
  -- structural check still passed. So perform the real statement as
  -- `authenticated` with a real JWT, and roll it back.
  --
  -- THE PROBE MUST NOT PARAPHRASE THE STATEMENT. A first draft wrote
  -- `set social_accounts = coalesce(social_accounts, '[]')`, which READS the
  -- column and therefore needs SELECT — a privilege this migration deliberately
  -- does not grant — so it failed 42501 against a correct grant and looked like
  -- the fix had not worked. The app sends client-held values as literals
  -- (`updateRowsBy` issues `.update(...).eq(...)` with no trailing `.select()`,
  -- so PostgREST sends no RETURNING either). The values are captured here BEFORE
  -- dropping to `authenticated` so the probe assigns literals exactly as the app
  -- does, and remains a no-op write.
  select user_id, social_links, social_accounts
    into v_uid, v_links, v_accounts
    from public.profiles limit 1;
  if v_uid is null then
    raise notice 'P5 skipped: no profile row to probe';
  else
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.profiles
         set social_accounts = v_accounts,
             social_links = v_links
       where user_id = v_uid;
      v_update_ok := true;
    exception when others then
      v_update_ok := false;
      raise notice 'P5 probe error: % %', sqlstate, sqlerrm;
    end;
    reset role;
    if not v_update_ok then
      raise exception 'P5 failed: authenticated still cannot write the social columns';
    end if;
  end if;

  raise notice 'OK: social_links/social_accounts writable by authenticated; no new SELECT, no anon reach, escalation columns still withheld';
end $verify$;
