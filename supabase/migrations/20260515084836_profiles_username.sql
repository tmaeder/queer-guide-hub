-- Add unique username handle to profiles + case-insensitive availability RPC.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username text
    CHECK (username IS NULL OR username ~ '^[A-Za-z][A-Za-z0-9]{7,14}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION username_available(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    candidate ~ '^[A-Za-z][A-Za-z0-9]{7,14}$'
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE lower(username) = lower(candidate)
    );
$$;

GRANT EXECUTE ON FUNCTION username_available(text) TO anon, authenticated;

-- Extend handle_new_user() to persist username from raw_user_meta_data.
-- Only references columns that exist on production profiles.
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
    privacy_settings
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    v_username,
    jsonb_build_object('profile_visibility', false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    username = COALESCE(public.profiles.username, EXCLUDED.username);
  RETURN NEW;
END;
$$;
