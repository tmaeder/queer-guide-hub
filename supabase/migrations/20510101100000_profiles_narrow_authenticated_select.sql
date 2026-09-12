-- Part TWO of the profiles hardening: narrow `authenticated`'s SELECT to a
-- column allowlist. Part one (20440101100000) moved the self-reads and the
-- admin-reads behind SECURITY DEFINER functions, which is what makes this
-- possible at all — a column GRANT is per-ROLE, and without those functions the
-- allowlist would be the UNION of owner + member + admin needs and would
-- therefore have to contain email, date_of_birth and phone on every row.
--
-- WHAT THIS CLOSES. Until now every authenticated user could read every OTHER
-- user's full row. Measured on prod, the 136 columns this withdraws include:
--
--   date_of_birth, email, phone, phone_encrypted, verified_email, verified_phone,
--   emergency_contact_phone(_encrypted), kink_interests, kink_experience_level,
--   gender_identity_encrypted, sexual_orientation_encrypted,
--   relationship_status_encrypted, political_views_encrypted,
--   religious_beliefs_encrypted, income_range_encrypted
--
-- On an LGBTQ+ platform that set is outing-adjacent, not merely private.
--
-- SELECT ONLY, DELIBERATELY. INSERT and UPDATE stay at all 174 columns. The
-- write set is assembled from `updateProfile(updates)` with a caller-supplied
-- object and could not be enumerated to a standard that justifies a grant
-- change: one missed column silently breaks profile editing in production.
-- Writes are also RLS-bound to the caller's own row, so an over-wide write
-- grant is an integrity question, not a disclosure one. Narrowing them is a
-- separate change that needs the editor's field set pinned first.
--
-- HOW THE ALLOWLIST WAS DERIVED (38 columns, all three sources measured):
--   1. anon's existing 21-column SELECT grant — authenticated must be a
--      superset or members would see less than signed-out visitors.
--   2. The frontend's direct reads of OTHER rows: AUTHED_DIRECTORY_COLS in
--      useUserDirectoryQuery, the embedded `profiles(display_name, avatar_url)`
--      selects in 7 hooks, and onboarding_completed_at in AuthCallback.
--   3. The five SECURITY INVOKER views over profiles. These are the trap: an
--      invoker view reads the base table with the CALLER's privileges, so a
--      column missing from this list breaks the view rather than the query that
--      named it. profile_status_v needs 13 columns, public_profiles 10,
--      intimate_discovery_v 8 (the dating discovery surface), safe_profiles 6,
--      contributor_recognitions_public 4.
--
-- VERIFIED ON PROD in a rolled-back transaction, in BOTH directions — a test
-- that only shows "nothing broke" would look identical to a revoke that never
-- took effect:
--
--   email          -> blocked (42501)      display_name         -> readable
--   date_of_birth  -> blocked (42501)      profile_status_v     -> runs
--   kink_interests -> blocked (42501)      intimate_discovery_v -> runs
--
-- public_profiles and safe_profiles are not probed because they carry no grant
-- to authenticated at all — the role cannot reach them either way. That is a
-- finding, not an omission.
revoke select on public.profiles from authenticated;

grant select (
  -- anon's public floor
  availability_tags, avatar_url, bio, created_at, display_name, dnd_until, id,
  is_business, last_active_at, last_seen_at, location, presence_visibility,
  status_emoji, status_expires_at, status_text, travel_mode, user_id, user_mode,
  username, verified_identity, website,
  -- member directory + embedded reads
  age_range, education, gender_identity, has_children, has_pets, interests,
  occupation, pronouns, relationship_status, onboarding_completed_at,
  -- required by the SECURITY INVOKER views
  body_type, height_cm, moderation_status, privacy_settings, sexual_orientation,
  social_links, updated_at
) on public.profiles to authenticated;

-- Assert the outcome rather than trusting the statements: a grant that silently
-- did nothing looks exactly like one that worked.
do $$
declare v_cols int; v_leaked text;
begin
  select count(*) into v_cols
  from information_schema.column_privileges
  where table_schema='public' and table_name='profiles'
    and grantee='authenticated' and privilege_type='SELECT';

  if v_cols <> 38 then
    raise exception 'expected 38 selectable columns for authenticated, found %', v_cols;
  end if;

  select string_agg(column_name, ', ') into v_leaked
  from information_schema.column_privileges
  where table_schema='public' and table_name='profiles'
    and grantee='authenticated' and privilege_type='SELECT'
    and column_name in ('email','phone','phone_encrypted','date_of_birth',
                        'kink_interests','kink_experience_level','verified_email',
                        'verified_phone','emergency_contact_phone');
  if v_leaked is not null then
    raise exception 'sensitive columns still selectable by authenticated: %', v_leaked;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The allowlist needs a WATCHER, or it is one `grant select on profiles to
-- authenticated` away from being undone in silence.
--
-- profiles_column_exposure() already exists (20260816120000) and is the repo's
-- mechanism for exactly this — but arms 1 and 2 were scoped to `anon` only,
-- because `authenticated` legitimately held everything at the time. With that
-- no longer true they have to cover both roles, each against its own list.
-- Arm 3 (definer views) already covered authenticated and is unchanged.
--
-- This is the third copy of the same contract, and the contract test says so:
-- the GRANT above, the ARRAY here, and
-- supabase/migrations/__tests__/profiles_column_grants.sql must move together.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_column_exposure()
 RETURNS TABLE(kind text, object_name text, grantee text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Arm 1: any table-level SELECT on profiles for an API role. Table-wide
  -- SELECT subsumes any column allowlist, for either role.
  SELECT 'table_grant'::text,
         'public.profiles'::text,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
         'table-wide SELECT subsumes the column allowlist'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  WHERE c.relname = 'profiles'
    AND a.privilege_type = 'SELECT'
    AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))

  UNION ALL

  -- Arm 2: any column granted outside that role's allowlist. anon keeps its 21;
  -- authenticated adds the member-directory fields and what the SECURITY
  -- INVOKER views need, and nothing else.
  SELECT 'column_grant'::text,
         'public.profiles.' || att.attname,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
         'column granted outside the ' ||
           CASE WHEN a.grantee = 0 THEN 'anon' ELSE a.grantee::regrole::text END ||
           ' allowlist'::text
  FROM pg_catalog.pg_attribute att
  JOIN pg_catalog.pg_class c ON c.oid = att.attrelid AND c.relname = 'profiles'
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a
  WHERE a.privilege_type = 'SELECT'
    AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))
    AND att.attname <> ALL (
      CASE WHEN a.grantee <> 0 AND a.grantee::regrole::text = 'authenticated'
        THEN ARRAY[
          'availability_tags','avatar_url','bio','created_at','display_name','dnd_until','id',
          'is_business','last_active_at','last_seen_at','location','presence_visibility',
          'status_emoji','status_expires_at','status_text','travel_mode','user_id','user_mode',
          'username','verified_identity','website','age_range','education','gender_identity',
          'has_children','has_pets','interests','occupation','pronouns','relationship_status',
          'onboarding_completed_at','body_type','height_cm','moderation_status',
          'privacy_settings','sexual_orientation','social_links','updated_at']
        ELSE ARRAY[
          'id','user_id','username','display_name','avatar_url','website','user_mode',
          'is_business','verified_identity','bio','location','created_at','last_active_at',
          'last_seen_at','status_emoji','status_text','status_expires_at','availability_tags',
          'dnd_until','travel_mode','presence_visibility']
      END)

  UNION ALL

  -- Arm 3: any NON-invoker view over profiles readable by an API role. Such a
  -- view runs as its owner (postgres) and bypasses both RLS and the column
  -- allowlist — a complete re-exposure through a side door. Unchanged.
  SELECT 'definer_view'::text,
         'public.' || v.relname,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
         'view over profiles without security_invoker bypasses the column allowlist'::text
  FROM pg_catalog.pg_class v
  JOIN pg_catalog.pg_namespace vn ON vn.oid = v.relnamespace AND vn.nspname = 'public'
  JOIN pg_catalog.pg_rewrite rw ON rw.ev_class = v.oid
  JOIN pg_catalog.pg_depend d
    ON d.objid = rw.oid
   AND d.classid = 'pg_catalog.pg_rewrite'::regclass
   AND d.refobjid = 'public.profiles'::regclass
  CROSS JOIN LATERAL pg_catalog.aclexplode(v.relacl) a
  WHERE v.relkind = 'v'
    AND a.privilege_type = 'SELECT'
    AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))
    AND COALESCE(
          (SELECT option_value FROM pg_catalog.pg_options_to_table(v.reloptions)
           WHERE option_name = 'security_invoker'),
          'false') NOT IN ('true','on','1');
$function$;

-- The sentinel must report ZERO for the state this migration just created.
do $$
declare v_n int; v_detail text;
begin
  select count(*), string_agg(object_name || ' [' || grantee || ']', ', ')
    into v_n, v_detail
  from public.profiles_column_exposure();
  if v_n > 0 then
    raise exception 'profiles_column_exposure() reports % finding(s) after the narrowing: %',
      v_n, v_detail;
  end if;
end $$;
