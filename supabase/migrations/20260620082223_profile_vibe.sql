-- Phase 4a: per-user "vibe" (mood line) shown in chat surfaces.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vibe_emoji text,
  ADD COLUMN IF NOT EXISTS vibe_text text,
  ADD COLUMN IF NOT EXISTS vibe_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS vibe_expires_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_vibe_text_len') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_vibe_text_len CHECK (vibe_text IS NULL OR char_length(vibe_text) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_vibe_emoji_len') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_vibe_emoji_len CHECK (vibe_emoji IS NULL OR char_length(vibe_emoji) <= 8);
  END IF;
END $$;
