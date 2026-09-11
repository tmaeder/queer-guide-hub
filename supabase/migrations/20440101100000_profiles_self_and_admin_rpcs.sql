-- RENUMBERED TWICE. First from 20260818120000, which sorted far below the
-- applied ceiling and so could never have run; then from 20410601100000,
-- because the ceiling moved 20400214091533 -> 20420301100000 within hours
-- while a concurrent session was landing migrations. A YEAR of headroom was
-- not enough: the observed jumps are 3, 2, 6 and then NINETEEN months, because
-- everyone applies the same leave-a-gap rule and the ceiling inflates. The gap
-- has to exceed the largest single jump you can see in the history, not a
-- fixed amount — hence 2044. All four
-- preconditions this header relies on were re-verified against prod first:
-- none of the five functions exist yet, postgres holds rolbypassrls, profiles is
-- FORCE ROW LEVEL SECURITY, and both precedent definer functions
-- (get_public_profile_safe, export_my_data) are present and SECURITY DEFINER.
--
-- SCOPE, stated plainly: this is part ONE. The column-allowlist narrowing it
-- exists to enable is NOT in this change and has never been written. What lands
-- here is the move of self-reads and admin-reads off direct table access onto
-- definer functions — additive, no grant touched, nothing can lose access.
-- `authenticated` still holds all 174 columns on profiles after this.
--
-- SECURITY DEFINER read paths for public.profiles, ahead of narrowing `authenticated`
-- to a column allowlist (next migration).
--
-- WHY THESE HAVE TO EXIST FIRST. A column GRANT is per-ROLE. `authenticated` is ONE role
-- shared by the profile owner, every other member, and every admin — `has_role_jwt('admin')`
-- cannot grant a column privilege, and RLS cannot either (it filters rows). So the naive
-- allowlist is the UNION of what a user reads about themselves, what admins read about
-- others, and what members read about each other. That union contains email, date_of_birth
-- and phone, granted on every row — i.e. it would achieve nothing.
--
-- The only way the allowlist can stay narrow is to move the self-reads and the admin-reads
-- off the table and behind definer functions, which is what this migration does. Nothing
-- here changes any grant; it is purely additive and safe to land on its own.
--
-- All of these rely on owner `postgres` holding rolbypassrls, because `profiles` is
-- FORCE ROW LEVEL SECURITY. That is already proven in production by get_public_profile_safe
-- and export_my_data, and is asserted by the contract test.
-- No explicit BEGIN/COMMIT: `supabase db push` supplies the transaction and
-- INSERTs the schema_migrations row AFTER the body. A COMMIT inside the file
-- closes that transaction early, so the effects land while the version is never
-- recorded and the file re-runs on every later push.

-- 1. self ---------------------------------------------------------------------
-- Replaces `select('*').eq('user_id', user.id)` in useProfile / useProfileData /
-- useSecurePublicProfile, plus the narrow own-row reads of mailbox_address,
-- discovery_profile and travel_preferences.
--
-- RETURNS SETOF public.profiles so the generated types.ts keeps typing this as
-- Tables<'profiles'> and it picks up new columns automatically — a RETURNS TABLE would
-- have to enumerate 173 columns and would silently go stale on the next ADD COLUMN.
--
-- No argument: it reads auth.uid() directly rather than taking p_user_id, so there is no
-- parameter to get wrong. (export_my_data takes p_user_id and has to compare it against
-- auth.uid(); this cannot be called for anyone else in the first place.)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.profiles WHERE user_id = (SELECT auth.uid());
$$;

COMMENT ON FUNCTION public.get_my_profile() IS
  'The caller''s own profile row, all columns. Exists because authenticated holds only a narrow column allowlist on profiles and a column grant cannot distinguish own-row from others-row. Returns zero rows when auth.uid() is null.';

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 2. admin: the /admin/users grid, both exports ---------------------------------
-- One function serves three surfaces that all need the same columns:
--   * the paginated grid            (p_page / p_per_page)
--   * the "export all users" xlsx   (large p_per_page)
--   * the bulk CSV of selected rows (p_ids)
-- Returning {items, total} in one round trip also collapses the grid's current
-- count-query + data-query pair.
--
-- The CSV export previously ran `select('*')` and wrote all 173 columns — including
-- kink_interests, date_of_birth and the *_encrypted twins — into a file for any admin who
-- ticked a checkbox. Routing it here fixes that too: the column list is fixed in SQL and
-- cannot be widened from the client.
CREATE OR REPLACE FUNCTION public.admin_users_list(
  p_search             text    DEFAULT NULL,
  p_is_online          boolean DEFAULT NULL,
  p_moderation_status  text    DEFAULT NULL,
  p_user_mode          text    DEFAULT NULL,
  p_sort               text    DEFAULT 'created_at',
  p_sort_asc           boolean DEFAULT false,
  p_page               integer DEFAULT 1,
  p_per_page           integer DEFAULT 25,
  p_ids                uuid[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_page     integer := GREATEST(COALESCE(p_page, 1), 1);
  v_per_page integer := LEAST(GREATEST(COALESCE(p_per_page, 25), 1), 5000);
  v_search   text;
  v_sort     text;
  v_dir      text := CASE WHEN p_sort_asc THEN 'ASC' ELSE 'DESC' END;
  v_total    bigint;
  v_items    jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  v_search := CASE WHEN COALESCE(p_search, '') <> ''
                   THEN '%' || lower(p_search) || '%' END;

  -- p_sort arrives from the client and this is SECURITY DEFINER, so it is resolved
  -- through a closed CASE (never interpolated) and re-quoted with %I below. An
  -- unrecognised value falls back to created_at rather than erroring.
  v_sort := CASE p_sort
              WHEN 'display_name'                  THEN 'display_name'
              WHEN 'email'                         THEN 'email'
              WHEN 'location'                      THEN 'location'
              WHEN 'user_mode'                     THEN 'user_mode'
              WHEN 'is_online'                     THEN 'is_online'
              WHEN 'moderation_status'             THEN 'moderation_status'
              WHEN 'profile_completion_percentage' THEN 'profile_completion_percentage'
              WHEN 'last_seen_at'                  THEN 'last_seen_at'
              ELSE 'created_at'
            END;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE (v_search IS NULL
         OR lower(p.display_name) LIKE v_search
         OR lower(p.first_name)   LIKE v_search
         OR lower(p.last_name)    LIKE v_search
         OR lower(p.email)        LIKE v_search)
    AND (p_is_online         IS NULL OR p.is_online = p_is_online)
    AND (p_moderation_status IS NULL OR p.moderation_status = p_moderation_status)
    AND (p_user_mode         IS NULL OR p.user_mode::text = p_user_mode)
    AND (p_ids               IS NULL OR p.id = ANY(p_ids));

  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.rn), '[]'::jsonb)
    FROM (
      SELECT p.id, p.user_id, p.email, p.display_name, p.first_name, p.last_name,
             p.avatar_url, p.location, p.user_mode, p.is_online, p.moderation_status,
             p.profile_completion_percentage, p.pronouns, p.created_at, p.last_seen_at,
             row_number() OVER (ORDER BY p.%I %s NULLS LAST, p.id) AS rn
      FROM public.profiles p
      WHERE ($1 IS NULL
             OR lower(p.display_name) LIKE $1
             OR lower(p.first_name)   LIKE $1
             OR lower(p.last_name)    LIKE $1
             OR lower(p.email)        LIKE $1)
        AND ($2 IS NULL OR p.is_online = $2)
        AND ($3 IS NULL OR p.moderation_status = $3)
        AND ($4 IS NULL OR p.user_mode::text = $4)
        AND ($5 IS NULL OR p.id = ANY($5))
      ORDER BY p.%I %s NULLS LAST, p.id
      LIMIT $6 OFFSET $7
    ) t
  $q$, v_sort, v_dir, v_sort, v_dir)
  INTO v_items
  USING v_search, p_is_online, p_moderation_status, p_user_mode, p_ids,
        v_per_page, (v_page - 1) * v_per_page;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END $$;

COMMENT ON FUNCTION public.admin_users_list(text, boolean, text, text, text, boolean, integer, integer, uuid[]) IS
  'Admin /admin/users grid + xlsx export + bulk CSV. Returns {items, total}. Fixed 15-column projection: the CSV export it replaces ran select(*) and wrote all 173 columns to a file.';

REVOKE EXECUTE ON FUNCTION public.admin_users_list(text, boolean, text, text, text, boolean, integer, integer, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_users_list(text, boolean, text, text, text, boolean, integer, integer, uuid[]) TO authenticated;

-- 3. admin: the user detail sheet ----------------------------------------------
-- date_of_birth is deliberately NOT returned. The sheet fetched it and never rendered it
-- (it existed only in the TS type), so shipping it to the browser was pure exposure.
CREATE OR REPLACE FUNCTION public.admin_user_detail(p_user_id uuid)
RETURNS TABLE (
  bio                text,
  gender_identity    text,
  pronouns           text,
  sexual_orientation text,
  location           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.bio, p.gender_identity, p.pronouns, p.sexual_orientation, p.location
  FROM public.profiles p
  WHERE p.user_id = p_user_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;

-- 4. admin: the four stat cards -------------------------------------------------
-- These were four PostgREST head-counts. Measured: PostgREST wraps a head-count as
--   WITH pgrst_source AS (SELECT profiles.* FROM profiles) SELECT count(*) ...
-- so `select=*` still expands and privilege-checks every column — it 42501s under the
-- allowlist. Worse, countRows() swallows the error and returns 0, so the dashboard would
-- have rendered a confident 0 / 0 / 0 / 0 rather than failing.
CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total',            count(*),
    'new_this_week',    count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
    'online',           count(*) FILTER (WHERE is_online),
    'needs_moderation', count(*) FILTER (WHERE moderation_status IS DISTINCT FROM 'approved')
  ) INTO v
  FROM public.profiles;

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;

-- 5. admin: resolve an email to a user id ---------------------------------------
-- For the pipeline AccessDialog, which grants pipeline permissions by email. The old code
-- did `.select('id').eq('email', ...)` — note a WHERE column needs SELECT privilege just
-- as a projected one does, so the clean-looking projection was not the whole story.
--
-- This also closes an email-enumeration oracle: previously ANY authenticated user could
-- probe whether an address had an account. Now it needs the admin role.
CREATE OR REPLACE FUNCTION public.admin_resolve_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  -- profiles.id, NOT user_id: pipeline_permissions.user_id references the former here.
  SELECT p.id INTO v_id
  FROM public.profiles p
  WHERE lower(p.email) = lower(trim(p_email))
  LIMIT 1;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_resolve_user_by_email(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_user_by_email(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
