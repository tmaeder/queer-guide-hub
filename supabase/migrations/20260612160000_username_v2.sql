-- Username v2: mandatory rollout machinery.
-- Relaxed format (3-20 lowercase, a-z 0-9 _ .), lookalike collision key,
-- reserved names, change policy (once/12mo + safety fast-track), redirects,
-- auto-assign job for the T+60 deadline.

-- 1. Fold existing usernames to lowercase (unique index is already on lower()).
UPDATE profiles SET username = lower(username)
WHERE username IS NOT NULL AND username <> lower(username);

-- 2. Relax the format CHECK. POSIX regex (no lookahead): shape + no
--    consecutive separators as two conditions. 3-20 chars, letter start,
--    alnum end, separators only between alnums.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_check CHECK (
  username IS NULL OR (
    username ~ '^[a-z][a-z0-9._]{1,18}[a-z0-9]$'
    AND username !~ '[._]{2}'
  )
);

-- 3. Lookalike collision key: separators stripped. mari.posa / mari_posa /
--    mariposa all collide — blocks lookalike-handle impersonation.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_key text
  GENERATED ALWAYS AS (replace(replace(username, '.', ''), '_', '')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key_unique
  ON profiles (username_key) WHERE username_key IS NOT NULL;

-- 4. Change-policy bookkeeping.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_auto_assigned boolean NOT NULL DEFAULT false;

-- 5. Reserved names. Stored in stripped-lowercase form (compare against
--    username_key shape). Route words + brand/impersonation terms only —
--    deliberately NO reclaimed-identity terms (queer, dyke, … are identity
--    here, not abuse).
CREATE TABLE IF NOT EXISTS reserved_usernames (
  name text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reserved_usernames ENABLE ROW LEVEL SECURITY;
-- read-only reference data; mutations via service role / migrations only
CREATE POLICY reserved_usernames_read ON reserved_usernames FOR SELECT USING (true);

INSERT INTO reserved_usernames (name, reason) VALUES
  -- top-level routes (stripped form)
  ('about','route'),('abouthub','route'),('accessibility','route'),('admin','route'),
  ('affiliates','route'),('analytics','route'),('auth','route'),('blog','route'),
  ('bookings','route'),('cities','route'),('city','route'),('claimusername','route'),
  ('cms','route'),('community','route'),('contact','route'),('content','route'),
  ('contributors','route'),('cookies','route'),('countries','route'),('country','route'),
  ('discover','route'),('dmca','route'),('donate','route'),('events','route'),
  ('extension','route'),('favorites','route'),('feed','route'),('feedback','route'),
  ('festivals','route'),('flights','route'),('friends','route'),('groups','route'),
  ('help','route'),('hotels','route'),('inbox','route'),('legal','route'),
  ('links','route'),('map','route'),('maps','route'),('marketplace','route'),
  ('me','route'),('media','route'),('messages','route'),('news','route'),
  ('onboarding','route'),('p','route'),('pages','route'),('personalities','route'),
  ('places','route'),('press','route'),('pride','route'),('privacy','route'),
  ('professions','route'),('profile','route'),('quests','route'),('recognition','route'),
  ('resources','route'),('review','route'),('search','route'),('settings','route'),
  ('sitemap','route'),('submit','route'),('submissions','route'),('sustainability','route'),
  ('tags','route'),('terms','route'),('travel','route'),('trips','route'),
  ('u','route'),('user','route'),('users','route'),('values','route'),
  ('venues','route'),('villages','route'),('vision','route'),('wishlists','route'),
  -- brand & impersonation
  ('queerguide','brand'),('queer','brand'),('official','impersonation'),
  ('support','impersonation'),('moderator','impersonation'),('moderation','impersonation'),
  ('staff','impersonation'),('team','impersonation'),('security','impersonation'),
  ('helpdesk','impersonation'),('webmaster','impersonation'),('postmaster','impersonation'),
  ('abuse','impersonation'),('root','impersonation'),('system','impersonation'),
  ('api','impersonation'),('noreply','impersonation'),('everyone','impersonation'),
  ('here','impersonation'),('anonymous','impersonation'),('deleted','impersonation')
ON CONFLICT (name) DO NOTHING;

-- 6. Redirects: old handle reserved + resolvable for 90 days after a normal
--    change. Safety fast-track changes get NO redirect row (linkability is
--    the threat being mitigated).
CREATE TABLE IF NOT EXISTS username_redirects (
  old_username text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);
ALTER TABLE username_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY username_redirects_read ON username_redirects
  FOR SELECT USING (expires_at > now());
CREATE INDEX IF NOT EXISTS username_redirects_user_idx ON username_redirects (user_id);

-- 7. Availability v2: format + reserved + lookalike-key collision + active
--    redirect holds. Case-folds input so the client can pass raw typing.
--    The _for variant excludes a user's own row (and own redirect holds) so
--    self-changes like mari.posa -> mariposa, or reclaiming your own old
--    handle, don't false-collide. Internal only.
CREATE OR REPLACE FUNCTION username_available_for(candidate text, p_exclude uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT lower(trim(candidate)) AS u,
           replace(replace(lower(trim(candidate)), '.', ''), '_', '') AS k
  )
  SELECT
    u ~ '^[a-z][a-z0-9._]{1,18}[a-z0-9]$'
    AND u !~ '[._]{2}'
    AND NOT EXISTS (SELECT 1 FROM reserved_usernames r, c WHERE r.name = c.k)
    AND NOT EXISTS (
      SELECT 1 FROM profiles p, c
      WHERE p.username_key = c.k
        AND (p_exclude IS NULL OR p.user_id <> p_exclude)
    )
    AND NOT EXISTS (
      SELECT 1 FROM username_redirects ur, c
      WHERE lower(ur.old_username) = c.u AND ur.expires_at > now()
        AND (p_exclude IS NULL OR ur.user_id <> p_exclude)
    )
  FROM c;
$$;
REVOKE EXECUTE ON FUNCTION username_available_for(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION username_available(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT username_available_for(candidate, NULL);
$$;
GRANT EXECUTE ON FUNCTION username_available(text) TO anon, authenticated;

-- 8. Self-service change RPC. Claim is free; afterwards once per rolling
--    12 months. Auto-assigned handles get one free change. Old handle gets a
--    90-day redirect.
CREATE OR REPLACE FUNCTION change_username(new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new text := lower(trim(new_username));
  v_old text;
  v_changed_at timestamptz;
  v_auto boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT username, username_changed_at, username_auto_assigned
    INTO v_old, v_changed_at, v_auto
    FROM profiles WHERE user_id = v_uid
    FOR UPDATE;

  IF v_old IS NOT NULL AND lower(v_old) = v_new THEN
    RETURN jsonb_build_object('ok', true, 'username', v_new, 'unchanged', true);
  END IF;

  IF NOT username_available_for(v_new, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unavailable');
  END IF;

  -- policy gate only applies to a real change (not first claim, not the free
  -- change after auto-assignment)
  IF v_old IS NOT NULL AND NOT v_auto
     AND v_changed_at IS NOT NULL
     AND v_changed_at > now() - interval '12 months' THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'next_change_at', v_changed_at + interval '12 months');
  END IF;

  IF v_old IS NOT NULL THEN
    INSERT INTO username_redirects (old_username, user_id)
    VALUES (lower(v_old), v_uid)
    ON CONFLICT (old_username) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          created_at = now(),
          expires_at = now() + interval '90 days';
  END IF;

  UPDATE profiles SET
    username = v_new,
    username_changed_at = CASE WHEN v_old IS NULL OR v_auto THEN username_changed_at ELSE now() END,
    username_auto_assigned = false,
    updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'username', v_new);
END;
$$;
REVOKE EXECUTE ON FUNCTION change_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_username(text) TO authenticated;

-- 9. Admin safety fast-track: bypasses the 12-month gate; p_with_redirect
--    false for deadname/harassment cases (old handle must NOT link to the
--    new identity). Audited via updated_at + the redirect row's absence.
CREATE OR REPLACE FUNCTION admin_change_username(p_user_id uuid, p_new_username text, p_with_redirect boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new text := lower(trim(p_new_username));
  v_old text;
BEGIN
  PERFORM assert_admin_or_internal();

  SELECT username INTO v_old FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT username_available_for(v_new, p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unavailable');
  END IF;

  IF v_old IS NOT NULL AND p_with_redirect THEN
    INSERT INTO username_redirects (old_username, user_id)
    VALUES (lower(v_old), p_user_id)
    ON CONFLICT (old_username) DO UPDATE
      SET user_id = EXCLUDED.user_id, created_at = now(),
          expires_at = now() + interval '90 days';
  ELSIF v_old IS NOT NULL THEN
    -- safety change: drop any existing redirect pointing at this user's old name
    DELETE FROM username_redirects WHERE old_username = lower(v_old);
  END IF;

  UPDATE profiles SET username = v_new, username_auto_assigned = false, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'username', v_new);
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_change_username(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_change_username(uuid, text, boolean) TO authenticated, service_role;

-- 10. T+60 deadline auto-assign: slugified display_name (or 'member') +
--     4 digits, collision-resolved. Marked auto_assigned so the first
--     self-service change stays free. Registered DISABLED — enable at T+60.
CREATE OR REPLACE FUNCTION auto_assign_usernames(p_batch int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_base text;
  v_candidate text;
  v_tries int;
  v_assigned int := 0;
BEGIN
  PERFORM assert_admin_or_internal();

  FOR r IN
    SELECT user_id, display_name FROM profiles
    WHERE username IS NULL
    ORDER BY created_at
    LIMIT p_batch
  LOOP
    v_base := regexp_replace(lower(coalesce(r.display_name, 'member')), '[^a-z0-9]', '', 'g');
    IF v_base = '' OR v_base ~ '^[0-9]' THEN v_base := 'member'; END IF;
    v_base := left(v_base, 14);
    IF length(v_base) < 2 THEN v_base := 'member'; END IF;

    v_tries := 0;
    LOOP
      v_candidate := v_base || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN username_available(v_candidate) OR v_tries > 25;
      v_tries := v_tries + 1;
    END LOOP;
    CONTINUE WHEN NOT username_available(v_candidate);

    UPDATE profiles SET
      username = v_candidate,
      username_auto_assigned = true,
      updated_at = now()
    WHERE user_id = r.user_id;
    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned);
END;
$$;
REVOKE EXECUTE ON FUNCTION auto_assign_usernames(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auto_assign_usernames(int) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'username_auto_assign',
  'Username deadline auto-assign',
  'Assigns generated @usernames to accounts that have not claimed one. ENABLE AT T+60 of the username rollout (do not enable before the claim window closes).',
  'system',
  false,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"sql","function":"auto_assign_usernames"}'::jsonb,
  '0 5 * * *'
)
ON CONFLICT (slug) DO NOTHING;

-- 11. handle_new_user: validate against the v2 rules (lowercase fold, key
--     collision, reserved) by delegating to username_available.
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
  v_username text := lower(NULLIF(trim(v_meta->>'username'), ''));
BEGIN
  IF v_username IS NOT NULL AND NOT public.username_available(v_username) THEN
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
