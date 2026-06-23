-- Richer social presence on profiles: structured account array replacing the
-- flat social_links map. Phase 1 keeps the same single contact_visibility gate
-- as social_links (per-account visibility is Phase 2). social_links is retained
-- as a back-compat fallback and is still written by the editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_accounts jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from existing social_links map -> array of account objects.
-- Only rows that have links and an empty social_accounts get touched (idempotent).
UPDATE public.profiles p
SET social_accounts = sub.accounts
FROM (
  SELECT
    pr.id,
    jsonb_agg(
      jsonb_build_object(
        'platform', kv.key,
        'url', kv.value,
        'handle', NULL,
        'display_name', NULL,
        'avatar_url', NULL,
        'verified', 'unverified',
        'visibility', 'public',
        'featured', false,
        'embed_enabled', false
      )
    ) AS accounts
  FROM public.profiles pr
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(pr.social_links, '{}'::jsonb)) AS kv(key, value)
  WHERE pr.social_links IS NOT NULL
    AND jsonb_typeof(pr.social_links) = 'object'
    AND pr.social_links <> '{}'::jsonb
    AND (pr.social_accounts IS NULL OR pr.social_accounts = '[]'::jsonb)
    AND kv.value IS NOT NULL
    AND kv.value <> ''
  GROUP BY pr.id
) sub
WHERE p.id = sub.id;

-- Recreate get_public_profile_safe with social_accounts emitted under the same
-- contact_visibility gate as social_links (faithful copy of the live body).
CREATE OR REPLACE FUNCTION public.get_public_profile_safe(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  profile_record record;
  safe_data jsonb;
  privacy_settings jsonb;
  viewer uuid := auth.uid();
  visibility text;
  identity_vis text;
  relationships_vis text;
  field_vis text;
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
  IF visibility = 'false' THEN visibility := 'private'; END IF;
  IF visibility = 'true' THEN visibility := 'public'; END IF;
  is_owner := viewer IS NOT NULL AND viewer = target_user_id;
  is_admin := public.has_role_jwt('admin'::public.app_role);

  IF viewer IS NOT NULL AND NOT is_owner AND NOT is_admin AND EXISTS (
    SELECT 1 FROM public.user_relationships ur
    WHERE ur.relationship_type = 'block'
      AND ur.status = 'accepted'
      AND ((ur.user_id = get_public_profile_safe.target_user_id AND ur.target_user_id = viewer)
        OR (ur.user_id = viewer AND ur.target_user_id = get_public_profile_safe.target_user_id))
  ) THEN
    RETURN NULL;
  END IF;

  IF visibility = 'private' AND NOT is_owner AND NOT is_admin THEN
    RETURN NULL;
  END IF;

  IF visibility = 'community' AND viewer IS NULL AND NOT is_owner THEN
    RETURN NULL;
  END IF;

  IF viewer IS NOT NULL AND NOT is_owner THEN
    is_friend := public.are_friends(viewer, target_user_id);
  END IF;

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
    'username', profile_record.username,
    'bio', profile_record.bio,
    'avatar_url', profile_record.avatar_url,
    'created_at', profile_record.created_at,
    'is_business', profile_record.is_business,
    'user_mode', profile_record.user_mode,
    'profile_visibility', visibility,
    'privacy_settings', jsonb_build_object(
      'profile_visibility', visibility,
      'contributions_visibility', privacy_settings->'contributions_visibility',
      'social_visibility', privacy_settings->'social_visibility'
    )
  );

  field_vis := public.resolve_profile_field_visibility(privacy_settings, 'location_visibility', 'location_public', 'public');
  IF field_vis = 'public'
     OR (field_vis = 'community' AND viewer IS NOT NULL)
     OR (field_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object('location', profile_record.location);
  END IF;

  field_vis := public.resolve_profile_field_visibility(privacy_settings, 'pronouns_visibility', 'pronouns_public', 'public');
  IF field_vis = 'public'
     OR (field_vis = 'community' AND viewer IS NOT NULL)
     OR (field_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object('pronouns', profile_record.pronouns);
  END IF;

  field_vis := public.resolve_profile_field_visibility(privacy_settings, 'contact_visibility', 'contact_public', 'friends');
  IF field_vis = 'public'
     OR (field_vis = 'community' AND viewer IS NOT NULL)
     OR (field_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'website', profile_record.website,
      'social_links', profile_record.social_links,
      'social_accounts', profile_record.social_accounts
    );
  END IF;

  field_vis := public.resolve_profile_field_visibility(privacy_settings, 'interests_visibility', 'interests_public', 'community');
  IF field_vis = 'public'
     OR (field_vis = 'community' AND viewer IS NOT NULL)
     OR (field_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'interests', profile_record.interests,
      'occupation', profile_record.occupation,
      'education', profile_record.education
    );
  END IF;

  identity_vis := COALESCE(privacy_settings ->> 'identity_visibility', 'friends');
  IF identity_vis = 'public'
     OR (identity_vis = 'community' AND viewer IS NOT NULL)
     OR (identity_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'gender_identity', profile_record.gender_identity,
      'sexual_orientation', profile_record.sexual_orientation
    );
  END IF;

  relationships_vis := COALESCE(privacy_settings ->> 'relationships_visibility', 'friends');
  IF relationships_vis = 'public'
     OR (relationships_vis = 'community' AND viewer IS NOT NULL)
     OR (relationships_vis = 'friends' AND (is_friend OR is_owner OR is_admin)) THEN
    safe_data := safe_data || jsonb_build_object(
      'current_relationship_status', profile_record.current_relationship_status
    );
  END IF;

  RETURN safe_data;
END;
$function$;
