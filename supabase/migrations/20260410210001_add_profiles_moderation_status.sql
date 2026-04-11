ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved'
  CHECK (moderation_status IN ('approved','suspended','banned'));

CREATE INDEX IF NOT EXISTS profiles_moderation_status_idx
  ON public.profiles (moderation_status);
