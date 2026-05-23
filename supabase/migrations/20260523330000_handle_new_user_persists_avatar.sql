-- Extend handle_new_user() to persist avatar_config from raw_user_meta_data.
-- Email signup now ships an avatar_config jsonb alongside username; this
-- trigger needs to land it on the profile row at the same time as username.
-- OAuth providers still don't supply one, so OAuth users fall through to the
-- post-callback /claim-username page where both fields are set.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_display_name text := COALESCE(
    v_meta->>'display_name',
    v_meta->>'full_name',
    v_meta->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_username text := NULLIF(v_meta->>'username', '');
  v_avatar_config jsonb := CASE
    WHEN jsonb_typeof(v_meta->'avatar_config') = 'object'
      THEN v_meta->'avatar_config'
    ELSE NULL
  END;
BEGIN
  IF v_username IS NOT NULL AND v_username !~ '^[A-Za-z][A-Za-z0-9]{7,14}$' THEN
    v_username := NULL;
  END IF;
  IF v_username IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_username)
  ) THEN
    v_username := NULL;
  END IF;

  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    username,
    avatar_config,
    avatar_type,
    privacy_settings
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    v_username,
    v_avatar_config,
    CASE WHEN v_avatar_config IS NOT NULL THEN 'builder' ELSE NULL END,
    jsonb_build_object('profile_visibility', false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    avatar_config = COALESCE(public.profiles.avatar_config, EXCLUDED.avatar_config),
    avatar_type = COALESCE(public.profiles.avatar_type, EXCLUDED.avatar_type);
  RETURN NEW;
END;
$$;
