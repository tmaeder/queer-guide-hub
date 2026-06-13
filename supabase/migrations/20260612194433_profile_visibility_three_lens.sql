-- Three-lens profile visibility: public | community | private.
-- 1) Normalize legacy boolean values (false→private, true→public) and 'friends'→'community'.
UPDATE public.profiles
SET privacy_settings = jsonb_set(
  privacy_settings,
  '{profile_visibility}',
  CASE
    WHEN privacy_settings->'profile_visibility' = 'false'::jsonb THEN '"private"'::jsonb
    WHEN privacy_settings->'profile_visibility' = 'true'::jsonb THEN '"public"'::jsonb
    WHEN privacy_settings->>'profile_visibility' = 'friends' THEN '"community"'::jsonb
    ELSE privacy_settings->'profile_visibility'
  END
)
WHERE jsonb_typeof(privacy_settings->'profile_visibility') = 'boolean'
   OR privacy_settings->>'profile_visibility' = 'friends';

-- 2) Trigger default: string vocabulary instead of boolean.
CREATE OR REPLACE FUNCTION public.validate_privacy_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NEW.privacy_settings IS NULL OR NEW.privacy_settings = '{}'::jsonb THEN
    NEW.privacy_settings := jsonb_build_object(
      'profile_visibility', 'private',
      'location_public', false,
      'pronouns_public', false,
      'contact_public', false,
      'interests_public', false,
      'sexual_orientation_public', false,
      'gender_identity_public', false,
      'bio_public', true,
      'phone_public', false,
      'relationship_status_public', false,
      'contributions_visibility', 'public',
      'social_visibility', 'community'
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.privacy_settings IS DISTINCT FROM NEW.privacy_settings THEN
    PERFORM public.log_enhanced_security_event(
      'PRIVACY_SETTINGS_UPDATED',
      NEW.user_id,
      jsonb_build_object(
        'old_settings', OLD.privacy_settings,
        'new_settings', NEW.privacy_settings,
        'timestamp', NOW()
      ),
      'medium'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3) RLS: community-visible profiles readable by any signed-in member.
--    Anon keeps public-only. Missing key still defaults to 'public' (legacy posture).
DROP POLICY IF EXISTS profiles_read_access ON public.profiles;
CREATE POLICY profiles_read_access ON public.profiles
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR has_role_jwt('admin'::app_role)
  OR COALESCE(NULLIF(privacy_settings->>'profile_visibility','friends'), 'public')
       IN ('public','community')
);

-- 4) get_public_profile_safe: STOP leaking private profiles (it never checked
--    profile_visibility and is anon-executable), honor the community tier, and
--    return the public-by-design username.
CREATE OR REPLACE FUNCTION public.get_public_profile_safe(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  profile_record record;
  safe_data jsonb;
  privacy_settings jsonb;
  visibility text;
  caller uuid := auth.uid();
BEGIN
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RETURN null;
  END IF;

  privacy_settings := COALESCE(profile_record.privacy_settings, '{}'::jsonb);
  visibility := COALESCE(privacy_settings->>'profile_visibility', 'public');
  IF visibility = 'friends' THEN visibility := 'community'; END IF;
  IF visibility = 'false' THEN visibility := 'private'; END IF;
  IF visibility = 'true' THEN visibility := 'public'; END IF;

  -- Visibility gate (owner always passes; admins use the RLS path, not this RPC)
  IF caller IS DISTINCT FROM target_user_id THEN
    IF visibility = 'private' THEN
      RETURN null;
    END IF;
    IF visibility = 'community' AND caller IS NULL THEN
      RETURN null;
    END IF;
  END IF;

  safe_data := jsonb_build_object(
    'id', profile_record.id,
    'user_id', profile_record.user_id,
    'display_name', profile_record.display_name,
    'username', profile_record.username,
    'bio', profile_record.bio,
    'avatar_url', profile_record.avatar_url,
    'created_at', profile_record.created_at,
    'is_business', profile_record.is_business,
    'user_mode', profile_record.user_mode,
    'privacy_settings', jsonb_build_object(
      'profile_visibility', visibility,
      'contributions_visibility', privacy_settings->'contributions_visibility',
      'social_visibility', privacy_settings->'social_visibility'
    )
  );

  IF COALESCE((privacy_settings ->> 'location_public')::boolean, false) THEN
    safe_data := safe_data || jsonb_build_object('location', profile_record.location);
  END IF;

  IF COALESCE((privacy_settings ->> 'pronouns_public')::boolean, false) THEN
    safe_data := safe_data || jsonb_build_object('pronouns', profile_record.pronouns);
  END IF;

  IF COALESCE((privacy_settings ->> 'contact_public')::boolean, false) THEN
    safe_data := safe_data || jsonb_build_object(
      'website', profile_record.website,
      'social_links', profile_record.social_links
    );
  END IF;

  IF COALESCE((privacy_settings ->> 'interests_public')::boolean, false) THEN
    safe_data := safe_data || jsonb_build_object(
      'interests', profile_record.interests,
      'occupation', profile_record.occupation,
      'education', profile_record.education
    );
  END IF;

  RETURN safe_data;
END;
$$;
