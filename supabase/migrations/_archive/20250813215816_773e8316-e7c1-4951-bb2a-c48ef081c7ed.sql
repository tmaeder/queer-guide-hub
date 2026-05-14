-- Create secure passkey tables
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  is_revoked boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge integer[] NOT NULL,
  action text NOT NULL CHECK (action IN ('enroll', 'authenticate')),
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on passkey tables
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;

-- RLS policies for passkey tables
CREATE POLICY "Users can view their own passkeys" 
ON public.user_passkeys 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage passkeys" 
ON public.user_passkeys 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage challenges" 
ON public.passkey_challenges 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

-- Auto-cleanup expired challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_passkey_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.passkey_challenges 
  WHERE expires_at < now();
END;
$$;

-- Consolidate duplicate RLS policies
-- Drop and recreate consolidated policies for comment_likes
DROP POLICY IF EXISTS "Authenticated users can manage comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can manage their own comment likes" ON public.comment_likes;

CREATE POLICY "Comment likes access control" 
ON public.comment_likes 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Consolidate accessibility_attributes policies
DROP POLICY IF EXISTS "Accessibility attributes are viewable by authenticated users" ON public.accessibility_attributes;
DROP POLICY IF EXISTS "Public read access" ON public.accessibility_attributes;

CREATE POLICY "Accessibility attributes public read" 
ON public.accessibility_attributes 
FOR SELECT 
USING (true);

-- Consolidate events policies for better performance
DROP POLICY IF EXISTS "Events are viewable by authenticated users" ON public.events;
DROP POLICY IF EXISTS "Public read access for events" ON public.events;

CREATE POLICY "Events public read access" 
ON public.events 
FOR SELECT 
USING (true);

-- Consolidate countries policies
DROP POLICY IF EXISTS "Countries are viewable by authenticated users" ON public.countries;
DROP POLICY IF EXISTS "Public read access" ON public.countries;

CREATE POLICY "Countries public read access" 
ON public.countries 
FOR SELECT 
USING (true);

-- Consolidate cities policies  
DROP POLICY IF EXISTS "Cities are viewable by authenticated users" ON public.cities;
DROP POLICY IF EXISTS "Public read access" ON public.cities;

CREATE POLICY "Cities public read access" 
ON public.cities 
FOR SELECT 
USING (true);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON public.user_passkeys(credential_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON public.passkey_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_id ON public.passkey_challenges(user_id);

-- Enhanced privacy: Automatic cleanup of old location data
CREATE OR REPLACE FUNCTION public.schedule_privacy_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete venue check-ins older than 90 days for privacy
  DELETE FROM public.venue_checkins 
  WHERE created_at < (NOW() - INTERVAL '90 days');
  
  -- Delete expired passkey challenges
  PERFORM public.cleanup_expired_passkey_challenges();
  
  -- Log privacy cleanup
  PERFORM public.log_enhanced_security_event(
    'PRIVACY_CLEANUP_COMPLETED',
    NULL,
    jsonb_build_object(
      'cleanup_timestamp', now(),
      'retention_days', 90
    ),
    'info'
  );
END;
$$;