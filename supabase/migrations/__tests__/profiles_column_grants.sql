-- Contract tests for the anon column-level SELECT allowlist on public.profiles.
-- Run via: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f profiles_column_grants.sql
-- (after 20260816120000_profiles_anon_column_grants.sql has been applied).
--
-- These assert the live grant state, which is the only protection there is: RLS on
-- `profiles` filters ROWS ONLY, so nothing else stops an anonymous
-- `GET /rest/v1/profiles?select=email` once the column ACL slips.
--
-- Note that `npm run typecheck` and `npm test` are structurally blind to this change —
-- `supabase gen types` introspects pg_attribute regardless of grantee, so types.ts keeps
-- all 173 columns, and every vitest spec mocks the Supabase client wholesale. This file
-- and e2e/members-directory-anon.spec.ts are the coverage.
--
-- The allowlist below is one of three copies of the same contract. The others are the
-- GRANT in 20260816120000 and the ARRAY inside profiles_column_exposure(). Test 2 asserts
-- exact set equality, so editing one and forgetting another fails here rather than in prod.

begin;

-- 1-3: static ACL shape ------------------------------------------------------
do $$
declare
  expected text[] := array[
    'id','user_id','username','display_name','avatar_url','website','user_mode',
    'is_business','verified_identity','bio','location','created_at','last_active_at',
    'last_seen_at','status_emoji','status_text','status_expires_at','availability_tags',
    'dnd_until','travel_mode','presence_visibility'
  ];
  granted  text[];
  sensitive text[] := array[
    'email','phone','date_of_birth','emergency_contact_name','emergency_contact_phone',
    'gender_identity','sexual_orientation','kink_interests','kink_experience_level',
    'bdsm_role','sexual_health_status','income_range','immigration_status',
    'coming_out_status','family_acceptance_level','political_views','religious_beliefs',
    'moderation_status','discovery_profile','dating_profile','intimacy_preferences',
    'partner_preferences','identity_details','mailbox_address','travel_preferences',
    'privacy_settings','phone_encrypted','gender_identity_encrypted',
    'sexual_orientation_encrypted','relationship_status_encrypted','income_range_encrypted',
    'political_views_encrypted','religious_beliefs_encrypted',
    'emergency_contact_phone_encrypted'
  ];
  n int;
  bad text[];
begin
  -- 1. No TABLE-level SELECT. This is the assertion that matters: a blanket
  --    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` (what 20260428060000 did,
  --    and how this hole was created) restores the table ACL and subsumes all 173
  --    columns while leaving every column ACL intact. Checking that the column grants
  --    still exist would not catch it.
  --    aclexplode on relacl directly, NOT has_table_privilege — the latter returns true
  --    when merely *some* column is granted, so it can never express this.
  select count(*) into n
    from pg_class c cross join lateral aclexplode(c.relacl) a
   where c.oid = 'public.profiles'::regclass
     and a.privilege_type = 'SELECT'
     and (a.grantee = 0 or a.grantee::regrole::text = 'anon');
  if n <> 0 then
    raise exception 'FAIL(1): anon or PUBLIC holds a table-level SELECT on profiles — the column allowlist is bypassed';
  end if;

  -- 2. Exact set equality, so this catches widening AND accidental narrowing.
  select coalesce(array_agg(att.attname order by att.attname), '{}')
    into granted
    from pg_attribute att cross join lateral aclexplode(att.attacl) a
   where att.attrelid = 'public.profiles'::regclass
     and a.privilege_type = 'SELECT'
     and a.grantee::regrole::text = 'anon';

  if granted is distinct from (select array_agg(x order by x) from unnest(expected) x) then
    raise exception 'FAIL(2): anon column allowlist drift. unexpected=% missing=%',
      coalesce((select array_agg(g) from unnest(granted)  g where g <> all(expected)), '{}'),
      coalesce((select array_agg(e) from unnest(expected) e where e <> all(granted)),  '{}');
  end if;

  -- 3. Named deny-list. Redundant with test 2 today, but it survives a future widening
  --    of `expected` — someone adding a column to the allowlist still cannot quietly add
  --    one of these.
  select array_agg(s) into bad
    from unnest(sensitive) s
   where exists (
     select 1 from pg_attribute att cross join lateral aclexplode(att.attacl) a
      where att.attrelid = 'public.profiles'::regclass
        and att.attname = s
        and a.privilege_type = 'SELECT'
        and (a.grantee = 0 or a.grantee::regrole::text = 'anon'));
  if bad is not null then
    raise exception 'FAIL(3): sensitive column(s) granted to anon: %', bad;
  end if;

  raise notice 'PASS 1-3: no table grant, allowlist is exactly % columns, no sensitive column granted', array_length(expected, 1);
end $$;

-- 4: reads that must SUCCEED as anon -----------------------------------------
do $$
declare n int;
begin
  set local role anon;

  -- count(*) proves the load-bearing semantic: policy `profiles_public_read` reads
  -- privacy_settings, which anon has NO privilege on. RLS quals are injected by the
  -- rewriter after parse-analysis fixes selectedCols, so they need no column privilege.
  -- If this ever fails, privacy_settings has to join the allowlist (and leaks every
  -- user's per-field visibility config).
  select count(*) into n from public.profiles;

  -- the members directory, exactly as src/hooks/useUserDirectoryQuery.ts issues it
  perform user_id, display_name, avatar_url, bio, location, website, user_mode,
          is_business, verified_identity, created_at, last_active_at
     from public.profiles order by created_at desc limit 60;

  -- its anon-visible search box (bio/location are granted for this and nothing else)
  perform 1 from public.profiles
   where display_name ilike '%a%' or bio ilike '%a%' or location ilike '%a%';

  -- security_invoker views. profile_status_v is the sharp edge: its body reads
  -- presence_visibility in the WHERE and dnd_until in a CASE, neither of which the
  -- client ever selects. An invoker view needs privilege on EVERY column in its body,
  -- so dropping either from the allowlist 42501s the presence dots site-wide.
  select count(*) into n from public.profile_status_v;
  select count(*) into n from public.contributor_recognitions_public;

  reset role;
  raise notice 'PASS 4: anon can still count, browse, search and read both invoker views';
exception when insufficient_privilege then
  reset role;
  raise exception 'FAIL(4): a surface anon legitimately needs was denied: %', sqlerrm;
end $$;

-- 5-6: reads that must be DENIED to anon -------------------------------------
do $$
declare
  probes text[] := array[
    'select * from public.profiles limit 1',
    'select email from public.profiles limit 1',
    'select privacy_settings from public.profiles limit 1',
    'select gender_identity from public.profiles limit 1',
    'select sexual_orientation from public.profiles limit 1',
    'select date_of_birth from public.profiles limit 1',
    'select kink_interests from public.profiles limit 1',
    'select coming_out_status from public.profiles limit 1',
    'select moderation_status from public.profiles limit 1',
    'select discovery_profile from public.profiles limit 1',
    -- Both are consumer-less and revoked. safe_profiles additionally CANNOT work under
    -- the allowlist (its WHERE reads privacy_settings), and public_profiles' per-field
    -- masking is defeated by security_invoker anyway — the CASE runs only after the
    -- invoker has already read the raw column.
    'select 1 from public.safe_profiles limit 1',
    'select 1 from public.public_profiles limit 1'
  ];
  p text;
  leaked text[] := '{}';
begin
  foreach p in array probes loop
    begin
      set local role anon;
      execute p;
      leaked := leaked || p;      -- no exception => anon read it
    exception when insufficient_privilege then
      null;                        -- expected
    end;
  end loop;
  reset role;

  if array_length(leaked, 1) is not null then
    raise exception 'FAIL(5): anon can still read: %', array_to_string(leaked, ' | ');
  end if;
  raise notice 'PASS 5: all % sensitive probes denied', array_length(probes, 1);
end $$;

-- 7: the CI gate agrees ------------------------------------------------------
do $$
declare n int; detail text;
begin
  select count(*) into n from public.profiles_column_exposure();
  if n <> 0 then
    select string_agg(kind || ' ' || object_name || ' -> ' || grantee, '; ')
      into detail from public.profiles_column_exposure();
    raise exception 'FAIL(7): profiles_column_exposure() returned % row(s): %', n, detail;
  end if;
  raise notice 'PASS 7: profiles_column_exposure() is clean';
end $$;

-- 8: registered invoker views still carry the flag ---------------------------
-- CREATE OR REPLACE VIEW resets reloptions and silently drops security_invoker. For a
-- view over profiles that does not merely bypass RLS — it bypasses the column allowlist,
-- because the view then executes as postgres.
do $$
declare bad text;
begin
  select string_agg(v.view_name, ', ') into bad
    from public.security_invoker_required_views v
    join pg_class c on c.relname = v.view_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where v.view_name in ('profile_status_v','contributor_recognitions_public',
                         'intimate_discovery_v','safe_profiles','public_profiles')
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'false') not in ('true','on','1');
  if bad is not null then
    raise exception 'FAIL(8): view(s) over profiles lost security_invoker: %', bad;
  end if;
  raise notice 'PASS 8: all five profiles-derived views keep security_invoker';
end $$;

rollback;
