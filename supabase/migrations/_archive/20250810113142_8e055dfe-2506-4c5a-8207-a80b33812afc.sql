-- 1) Create per-user calendar feed tokens table
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false
);

-- Uniqueness and lookup indexes
CREATE UNIQUE INDEX IF NOT EXISTS calendar_feed_tokens_token_idx ON public.calendar_feed_tokens (token);
CREATE INDEX IF NOT EXISTS calendar_feed_tokens_user_idx ON public.calendar_feed_tokens (user_id);

-- Enable RLS and strict owner-only access
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their calendar tokens" ON public.calendar_feed_tokens;
CREATE POLICY "Owners manage their calendar tokens"
ON public.calendar_feed_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2) Harden domain-based admin auto-assignment: require confirmed email
CREATE OR REPLACE FUNCTION public.handle_domain_admin_auto_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_domain text;
BEGIN
  v_domain := split_part(lower(NEW.email), '@', 2);

  -- Only assign admin if domain matches and email is confirmed
  IF v_domain = 'queer.guide' AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Log successful auto-assignment
    PERFORM public.log_enhanced_security_event(
      'DOMAIN_ADMIN_AUTO_ASSIGN',
      NEW.id,
      jsonb_build_object('domain', v_domain, 'timestamp', now()),
      'high'
    );
  ELSE
    -- Log skipped assignment for monitoring
    PERFORM public.log_enhanced_security_event(
      'DOMAIN_ADMIN_ASSIGN_SKIPPED',
      NEW.id,
      jsonb_build_object(
        'domain', v_domain,
        'email_confirmed', NEW.email_confirmed_at IS NOT NULL,
        'timestamp', now()
      ),
      'medium'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Privacy-aware public profiles view
-- Expose only fields explicitly marked public via privacy_settings
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  p.user_id,
  p.display_name,
  CASE WHEN COALESCE(p.privacy_settings->>'pronouns_public','false')::boolean THEN p.pronouns ELSE NULL END AS pronouns,
  CASE WHEN COALESCE(p.privacy_settings->>'bio_public','false')::boolean THEN p.bio ELSE NULL END AS bio,
  CASE WHEN COALESCE(p.privacy_settings->>'location_public','false')::boolean THEN p.location ELSE NULL END AS location,
  CASE WHEN COALESCE(p.privacy_settings->>'gender_identity_public','false')::boolean THEN p.gender_identity ELSE NULL END AS gender_identity,
  CASE WHEN COALESCE(p.privacy_settings->>'sexual_orientation_public','false')::boolean THEN p.sexual_orientation ELSE NULL END AS sexual_orientation,
  p.avatar_url
FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO anon, authenticated;