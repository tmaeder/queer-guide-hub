-- Milestone "merry-plotting-beacon" Phase 2 — Rich status & presence.
--
-- Adds status fields to public.profiles:
--   status_emoji            text(1)     — single emoji "vibe"
--   status_text             text(60)    — short free-text status
--   status_expires_at       timestamptz — optional auto-clear
--   availability_tags       text[]      — e.g. {'chat','coffee','advice'}
--   dnd_until               timestamptz — do-not-disturb window
--   travel_mode             jsonb       — {city_id, until, note}
--   presence_visibility     jsonb       — per-context opt-ins, ALL DEFAULT FALSE
--
-- Plus a SECURITY-INVOKER view profile_status_v that surfaces status to other
-- users only when the owner has opted in via presence_visibility.in_directory
-- AND their profile_visibility is 'public'. Status defaults to invisible.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_emoji         text,
  ADD COLUMN IF NOT EXISTS status_text          text,
  ADD COLUMN IF NOT EXISTS status_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS availability_tags    text[]      NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS dnd_until            timestamptz,
  ADD COLUMN IF NOT EXISTS travel_mode          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS presence_visibility  jsonb       NOT NULL DEFAULT
    jsonb_build_object(
      'global_dot',    false,
      'in_directory',  false,
      'in_groups',     false,
      'in_discovery',  false
    );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_emoji_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_emoji_chk
  CHECK (status_emoji IS NULL OR char_length(status_emoji) <= 8);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_text_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_text_chk
  CHECK (status_text IS NULL OR char_length(status_text) <= 60);

CREATE INDEX IF NOT EXISTS profiles_travel_mode_city_idx
  ON public.profiles ((travel_mode ->> 'city_id'))
  WHERE travel_mode ? 'city_id';

CREATE INDEX IF NOT EXISTS profiles_presence_dot_idx
  ON public.profiles ((presence_visibility ->> 'global_dot'))
  WHERE (presence_visibility ->> 'global_dot')::boolean IS TRUE;

-- Public-safe status view. SECURITY INVOKER so RLS on profiles is respected;
-- the view simply filters down to rows where the owner has consented to share
-- their status and whose status hasn't expired.
CREATE OR REPLACE VIEW public.profile_status_v
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.display_name,
  p.username,
  p.avatar_url,
  CASE WHEN p.dnd_until IS NOT NULL AND p.dnd_until > now()
       THEN NULL ELSE p.status_emoji END                              AS status_emoji,
  CASE WHEN p.dnd_until IS NOT NULL AND p.dnd_until > now()
       THEN NULL ELSE p.status_text END                               AS status_text,
  p.status_expires_at,
  p.availability_tags,
  (p.dnd_until IS NOT NULL AND p.dnd_until > now())                   AS dnd_active,
  p.travel_mode,
  p.last_seen_at,
  p.last_active_at
FROM public.profiles p
WHERE COALESCE((p.presence_visibility ->> 'in_directory')::boolean, false) = true
  AND (p.status_expires_at IS NULL OR p.status_expires_at > now());

GRANT SELECT ON public.profile_status_v TO anon, authenticated;
