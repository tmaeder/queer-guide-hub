-- =============================================================================
-- Signup rewrite: safe defaults, consent tracking, signup funnel analytics
-- =============================================================================
-- Adds legal/safety columns to profiles, default-private visibility, and a
-- funnel events table for signup analytics. Updates handle_new_user() to
-- read consent + provider + display_name from auth.users.raw_user_meta_data.
--
-- Supabase Auth dashboard config (manual, not in this migration):
--   - Enable Google provider (client_id/secret in vault)
--   - Enable Apple provider (client_id/secret/key in vault)
--   - Site URL allowlist must include /onboarding/welcome
--   - Email confirm template redirect → {{ .SiteURL }}/onboarding/welcome
-- =============================================================================

-- 1. New columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_provider text CHECK (signup_provider IN ('email', 'google', 'apple', 'passkey', 'unknown')),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

-- 2. Default privacy_settings.profile_visibility = false (private) for new rows
ALTER TABLE public.profiles
  ALTER COLUMN privacy_settings SET DEFAULT jsonb_build_object('profile_visibility', false);

-- 3. Updated handle_new_user(): pull consent timestamps + provider + display_name
--    from auth.users metadata. Idempotent on re-run.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_app_meta jsonb := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
  v_provider text := COALESCE(v_app_meta->>'provider', 'email');
  v_display_name text := COALESCE(
    v_meta->>'display_name',
    v_meta->>'full_name',
    v_meta->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_terms_at timestamptz := NULLIF(v_meta->>'terms_accepted_at', '')::timestamptz;
  v_privacy_at timestamptz := NULLIF(v_meta->>'privacy_accepted_at', '')::timestamptz;
  v_age_at timestamptz := NULLIF(v_meta->>'age_confirmed_at', '')::timestamptz;
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    signup_provider,
    terms_accepted_at,
    privacy_accepted_at,
    age_confirmed_at,
    privacy_settings
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    CASE
      WHEN v_provider IN ('google', 'apple', 'email') THEN v_provider
      ELSE 'unknown'
    END,
    v_terms_at,
    v_privacy_at,
    v_age_at,
    jsonb_build_object('profile_visibility', false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    signup_provider = COALESCE(public.profiles.signup_provider, EXCLUDED.signup_provider);
  RETURN NEW;
END;
$$;

-- profiles.display_name column may not yet exist on every env; create if missing.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;

-- 4. Signup funnel events (Supabase-native analytics, no third-party SDK)
CREATE TABLE IF NOT EXISTS public.signup_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN (
    'signup_landing_view',
    'oauth_start',
    'oauth_complete',
    'step_started',
    'step_completed',
    'step_validation_error',
    'signup_completed',
    'email_verified',
    'onboarding_skipped',
    'onboarding_completed'
  )),
  step smallint,
  provider text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_funnel_session ON public.signup_funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_signup_funnel_event_created ON public.signup_funnel_events(event, created_at DESC);

ALTER TABLE public.signup_funnel_events ENABLE ROW LEVEL SECURITY;

-- Anon can insert their own funnel events (signup happens pre-auth)
CREATE POLICY "Anon can insert signup funnel events"
  ON public.signup_funnel_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read funnel events
CREATE POLICY "Admins read signup funnel events"
  ON public.signup_funnel_events
  FOR SELECT
  USING (public.has_role_jwt('admin'));

COMMENT ON TABLE public.signup_funnel_events IS
  'Append-only signup funnel analytics. Anon insert, admin read. See useSignupFunnel hook.';
