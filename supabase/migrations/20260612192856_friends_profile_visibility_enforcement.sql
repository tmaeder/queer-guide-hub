-- Friends profile visibility was a promise the product never kept:
--   * get_public_profile_safe (SECURITY DEFINER) ignored profile_visibility entirely —
--     it returned display_name/bio/avatar for ANY profile (even 'private') to any
--     signed-in user, and never returned privacy_settings, so the client-side
--     "Private Profile" gate in UserProfile.tsx was dead code.
--   * RLS on profiles had no friends carve-out, so an accepted friend could not
--     read a 'friends'-visibility profile row at all.
--   * identity_visibility / relationships_visibility were stored but enforced nowhere.
-- This migration makes the RPC the single server-side enforcement point and adds
-- the friends carve-out to RLS.

-- 1) Friendship helper (accepted friend in either direction)
CREATE OR REPLACE FUNCTION public.are_friends(viewer uuid, owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_relationships ur
    WHERE ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
      AND ((ur.user_id = viewer AND ur.target_user_id = owner)
        OR (ur.user_id = owner AND ur.target_user_id = viewer))
  );
$$;

REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated, service_role;

-- 2) RLS: let accepted friends read 'friends'-visibility profile rows
DROP POLICY IF EXISTS "profiles_read_access" ON public.profiles;
CREATE POLICY "profiles_read_access" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.uid()) = user_id)
    OR public.has_role_jwt('admin'::public.app_role)
    OR (COALESCE(privacy_settings ->> 'profile_visibility', 'public') = 'public')
    OR ((privacy_settings ->> 'profile_visibility') = 'friends'
        AND public.are_friends((SELECT auth.uid()), user_id))
  );

-- 3) Enforce profile-level + section-level visibility in the safe-profile RPC
CREATE OR REPLACE FUNCTION public.get_public_profile_safe(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  profile_record record;
  safe_data jsonb;
  privacy_settings jsonb;
  viewer uuid := auth.uid();
  visibility text;
  identity_vis text;
  relationships_vis text;
  is_owner boolean;
  is_admin boolean;
  is_friend boolean := false;
BEGIN
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  privacy_settings := COALESCE(profile_record.privacy_settings, '{}'::jsonb);
  visibility := COALESCE(privacy_settings ->> 'profile_visibility', 'public');
  is_owner := viewer IS NOT NULL AND viewer = target_user_id;
  is_admin := public.has_role_jwt('admin'::public.app_role);

  -- A block in either direction hides the profile entirely
  IF viewer IS NOT NULL AND NOT is_owner AND NOT is_admin AND EXISTS (
    SELECT 1 FROM public.user_relationships ur
    WHERE ur.relationship_type = 'block'
      AND ur.status = 'accepted'
      AND ((ur.user_id = get_public_profile_safe.target_user_id AND ur.target_user_id = viewer)
        OR (ur.user_id = viewer AND ur.target_user_id = get_public_profile_safe.target_user_id))
  ) THEN
    RETURN NULL;
  END IF;

  -- Private: indistinguishable from nonexistent for everyone but owner/admin
  IF visibility = 'private' AND NOT is_owner AND NOT is_admin THEN
    RETURN NULL;
  END IF;

  IF viewer IS NOT NULL AND NOT is_owner THEN
    is_friend := public.are_friends(viewer, target_user_id);
  END IF;

  -- Friends-only: non-friends get a minimal locked stub so the profile page
  -- can show a lock screen with an Add Friend action
  IF visibility = 'friends' AND NOT (is_owner OR is_admin OR is_friend) THEN
    RETURN jsonb_build_object(
      'user_id', profile_record.user_id,
      'display_name', profile_record.display_name,
      'avatar_url', profile_record.avatar_url,
      'created_at', profile_record.created_at,
      'profile_visibility', 'friends',
      'locked', true
    );
  END IF;

  safe_data := jsonb_build_object(
    'id', profile_record.id,
    'user_id', profile_record.user_id,
    'display_name', profile_record.display_name,
    'bio', profile_record.bio,
    'avatar_url', profile_record.avatar_url,
    'created_at', profile_record.created_at,
    'is_business', profile_record.is_business,
    'profile_visibility', visibility
  );

  IF COALESCE((privacy_settings ->> 'location_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object('location', profile_record.location);
  END IF;

  IF COALESCE((privacy_settings ->> 'pronouns_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object('pronouns', profile_record.pronouns);
  END IF;

  IF COALESCE((privacy_settings ->> 'contact_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object(
      'website', profile_record.website,
      'social_links', profile_record.social_links
    );
  END IF;

  IF COALESCE((privacy_settings ->> 'interests_public')::boolean, false) = true THEN
    safe_data := safe_data || jsonb_build_object(
      'interests', profile_record.interests,
      'occupation', profile_record.occupation,
      'education', profile_record.education
    );
  END IF;

  -- Section visibility (public | friends | private), defaults match PrivacyTab.
  -- These are the controls the settings UI actually exposes for these fields.
  identity_vis := COALESCE(privacy_settings ->> 'identity_visibility', 'friends');
  IF identity_vis = 'public'
     OR (identity_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'gender_identity', profile_record.gender_identity,
      'sexual_orientation', profile_record.sexual_orientation
    );
  END IF;

  relationships_vis := COALESCE(privacy_settings ->> 'relationships_visibility', 'friends');
  IF relationships_vis = 'public'
     OR (relationships_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'relationship_status', profile_record.relationship_status
    );
  END IF;

  -- NEVER exposed to other users regardless of settings:
  -- phone, date_of_birth, income_range, emergency_contact_*, encrypted fields,
  -- intimacy/lifestyle preferences.

  RETURN safe_data;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_safe(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
