-- Column-level SELECT for `anon` on public.profiles.
--
-- THE HOLE. `profiles` has 173 columns. `anon` held a table-wide SELECT, and the only
-- thing standing between an anonymous caller and all of them was RLS policy
-- `profiles_public_read`, which filters ROWS ONLY:
--     COALESCE(privacy_settings->>'profile_visibility', 'public') = 'public'
-- There is no column-level security, so `GET /rest/v1/profiles?select=*` returned every
-- column of every public-visibility profile. Measured 2026-08-07: 2 email addresses,
-- 2 kink_interests arrays, 1 date_of_birth, 1 gender_identity, 1 sexual_orientation.
-- On an LGBTQ+ platform that is an outing risk, and it grows with every user who picks
-- public visibility.
--
-- The grant was never deliberate. 20260428060000_restore_anon_public_select.sql reverted
-- an earlier lockdown with a blanket `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`
-- aimed at countries/cities/venues, and swept `profiles` along with them.
--
-- THE FIX. Replace the table-wide grant with an enumerated column allowlist. This is
-- fail-closed in a way the previous posture was not: every future `ALTER TABLE profiles
-- ADD COLUMN` is invisible to anon until someone explicitly adds it here.
--
-- Scope: `anon` only. `authenticated` has the identical defect (policy
-- profiles_read_access also filters rows only, and admits every 'public' OR 'community'
-- profile, so any free signup reads all 173 columns) and is handled in a follow-up —
-- it needs get_my_profile() and admin RPCs first, because a column grant is per-ROLE and
-- cannot distinguish "my own row" from "someone else's".
--
-- ---------------------------------------------------------------------------
-- Two Postgres semantics decided this allowlist. Both were verified against this
-- database inside rolled-back transactions before the file was written:
--
--   1. An RLS policy USING-clause needs NO column privilege. Quals are injected by the
--      rewriter, after parse-analysis has fixed RTEPermissionInfo.selectedCols. Probed:
--      with only (user_id, display_name) granted, `set role anon; select count(*) from
--      profiles` returns rows even though the policy reads privacy_settings, while
--      `select privacy_settings` raises 42501. So privacy_settings stays OUT — granting
--      it would leak each user's per-field visibility configuration for nothing.
--
--   2. A security_invoker view body DOES need column privilege — for EVERY column in the
--      body, including columns used only in its WHERE. (rewriteHandler.c sets
--      checkAsUser = InvalidOid and leaves selectedCols as-is; planner column-pruning
--      happens after the permission check.) Probed: `select count(*) from
--      profile_status_v` raises 42501 with all 12 of its projected columns granted and
--      succeeds only once presence_visibility — which the client never selects — is added.
--      That is why the 9 presence columns below are load-bearing, and why safe_profiles
--      (WHERE reads privacy_settings) is revoked rather than kept.
--
-- Note the error message is useless for debugging either case: Postgres reports
-- `permission denied for table profiles` and never names the offending column.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. profiles ---------------------------------------------------------------
-- Order is load-bearing. A table-level SELECT subsumes every column ACL, so it has to go
-- first; granting columns while the table grant survives changes nothing. PUBLIC is
-- revoked too because anon inherits from it.
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC;

GRANT SELECT (
  -- identity + the anon members-directory card (src/components/user-directory/UserDirectoryGrid.tsx).
  -- Everything else that card renders sits behind `isAuthed`.
  id,                  -- FK target for 14 constraints and the PostgREST embeds
  user_id,
  username,
  display_name,
  avatar_url,
  website,
  user_mode,
  is_business,
  verified_identity,

  -- NOT rendered for anon. These back the search `.or(display_name/bio/location ilike)`
  -- in src/hooks/useUserDirectoryQuery.ts, whose input is visible signed-out.
  bio,
  location,

  -- the anon-visible sort select: newest/oldest, alphabetical, last active
  created_at,
  last_active_at,

  -- the full body of public.profile_status_v (security_invoker). presence_visibility is
  -- WHERE-only and dnd_until feeds a CASE — neither is ever selected by the client, and
  -- per note 2 above the view 42501s without them.
  last_seen_at,
  status_emoji,
  status_text,
  status_expires_at,
  availability_tags,
  dnd_until,
  travel_mode,
  presence_visibility
) ON TABLE public.profiles TO anon;

-- Deliberately NOT granted, beyond the obviously-sensitive set (email, phone,
-- date_of_birth, emergency_contact_*, kink_*, sexual_health_status, income_range,
-- immigration_status, moderation_status, discovery_profile, mailbox_address, the 8
-- *_encrypted twins, ...):
--   gender_identity, sexual_orientation, pronouns, age_range, occupation, education,
--   relationship_status, has_children, has_pets, interests
-- The directory filter panel that queries these is gated `showFilters && isAuthed`
-- (UserDirectoryFilters.tsx), so no anon-reachable query names them.
--   privacy_settings — per note 1, the policy reads it without needing the grant.

-- 2. views over profiles ----------------------------------------------------
-- Every one of these carries a full anon/authenticated write set inherited from Supabase's
-- stock `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`. Not currently exploitable —
-- they are all security_invoker, so a write is re-checked against the base table and anon
-- has no INSERT/UPDATE/DELETE on profiles — but it is the exact shape of the incident in
-- 20260806180000, and one flipped invoker flag is all that stands between here and there.
-- Revoke, then re-grant only the SELECT each surface actually uses.

-- consumer: src/hooks/usePublicStatus.ts (presence dots, anon-visible)
REVOKE ALL ON TABLE public.profile_status_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.profile_status_v TO anon, authenticated;

-- consumer: contributor recognition rails (anon-visible)
REVOKE ALL ON TABLE public.contributor_recognitions_public FROM anon, authenticated;
GRANT SELECT ON TABLE public.contributor_recognitions_public TO anon, authenticated;

-- consumer: src/hooks/useIntimateProfile.ts — signed-in only, never anon
REVOKE ALL ON TABLE public.intimate_discovery_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.intimate_discovery_v TO authenticated;

-- Zero consumers in src/, workers/, supabase/functions/ or extension/. safe_profiles
-- additionally cannot survive the column allowlist (its WHERE reads privacy_settings), and
-- public_profiles is worse than useless: its per-field
-- `CASE WHEN privacy_settings->>'bio_public' ...` masking is evaluated AFTER the invoking
-- role has already read the raw column, it has no row filter of its own, and it exposes
-- social_links unmasked. Neither currently grants anon SELECT; this makes that explicit and
-- strips the stray write set. Candidates for DROP once this has soaked.
REVOKE ALL ON TABLE public.safe_profiles   FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_profiles FROM anon, authenticated;

-- Register the invoker-dependent views. CREATE OR REPLACE VIEW resets reloptions and
-- silently discards `security_invoker`; for these five that would not merely bypass RLS,
-- it would bypass the column allowlist above, since a definer view runs as postgres.
INSERT INTO public.security_invoker_required_views (view_name, reason) VALUES
  ('profile_status_v',                'reads public.profiles; without security_invoker it bypasses the anon column allowlist on profiles'),
  ('contributor_recognitions_public', 'joins public.profiles; without security_invoker it bypasses the anon column allowlist on profiles'),
  ('intimate_discovery_v',            'joins public.profiles; without security_invoker it bypasses the anon column allowlist on profiles'),
  ('safe_profiles',                   'reads public.profiles; without security_invoker it bypasses the anon column allowlist on profiles'),
  ('public_profiles',                 'reads public.profiles; without security_invoker it bypasses the anon column allowlist on profiles')
ON CONFLICT (view_name) DO NOTHING;

-- 3. CI gate ----------------------------------------------------------------
-- Consumed by scripts/check-profile-column-grants.mjs. Must always return zero rows.
--
-- Arm 1 is the one that matters. The realistic regression is not someone editing the
-- column list — it is someone re-running `GRANT SELECT ON ALL TABLES IN SCHEMA public TO
-- anon`, exactly as 20260428060000 did. That restores the TABLE-level ACL, which subsumes
-- all 173 columns, while leaving every column ACL in pg_attribute.attacl untouched. A gate
-- that asserted "the column grants are still present" would stay green through it. So the
-- assertion is the ABSENCE of a table-level grant, not the presence of the column grants.
CREATE OR REPLACE FUNCTION public.profiles_column_exposure()
RETURNS TABLE (kind text, object_name text, grantee text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Arm 1: any table-level SELECT on profiles for an API role.
  SELECT 'table_grant'::text,
         'public.profiles'::text,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
         'table-wide SELECT subsumes the column allowlist'::text
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  WHERE c.relname = 'profiles'
    AND a.privilege_type = 'SELECT'
    AND (a.grantee = 0 OR a.grantee::regrole::text = 'anon')

  UNION ALL

  -- Arm 2: any column granted to anon outside the allowlist. Keep this list in lockstep
  -- with the GRANT above and with supabase/migrations/__tests__/profiles_column_grants.sql.
  SELECT 'column_grant'::text,
         'public.profiles.' || att.attname,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
         'column granted outside the anon allowlist'::text
  FROM pg_catalog.pg_attribute att
  JOIN pg_catalog.pg_class c ON c.oid = att.attrelid AND c.relname = 'profiles'
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a
  WHERE a.privilege_type = 'SELECT'
    AND (a.grantee = 0 OR a.grantee::regrole::text = 'anon')
    AND att.attname <> ALL (ARRAY[
      'id','user_id','username','display_name','avatar_url','website','user_mode',
      'is_business','verified_identity','bio','location','created_at','last_active_at',
      'last_seen_at','status_emoji','status_text','status_expires_at','availability_tags',
      'dnd_until','travel_mode','presence_visibility'
    ])

  UNION ALL

  -- Arm 3: any NON-invoker view over profiles readable by an API role. Such a view runs as
  -- its owner (postgres) and therefore bypasses both RLS and the column allowlist — a
  -- complete re-exposure through a side door.
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
$$;

COMMENT ON FUNCTION public.profiles_column_exposure() IS
  'CI gate: every path by which anon can read a public.profiles column outside the allowlist. Must return zero rows. See scripts/check-profile-column-grants.mjs.';

REVOKE EXECUTE ON FUNCTION public.profiles_column_exposure() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.profiles_column_exposure() TO service_role;

-- 4. contract ---------------------------------------------------------------
COMMENT ON TABLE public.profiles IS
  'User profiles (173 columns). anon holds a COLUMN-LEVEL SELECT allowlist, not a table grant — '
  'RLS filters rows only, so the column ACL is the sole protection for email, date_of_birth, '
  'kink_interests, sexual_orientation and the rest. NEVER run GRANT SELECT ON ALL TABLES IN SCHEMA '
  'public TO anon: a table-level grant silently subsumes every column ACL. Widening the allowlist '
  'means editing 20260816120000, profiles_column_exposure() and supabase/migrations/__tests__/profiles_column_grants.sql '
  'together.';

NOTIFY pgrst, 'reload schema';

COMMIT;
