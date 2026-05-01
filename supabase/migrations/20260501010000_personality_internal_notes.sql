-- Internal notes for personalities. Stored in a sibling table so the
-- public personalities row stays safe under its USING (true) SELECT
-- policy. Only staff (admin/moderator/editor) can read or write.
CREATE TABLE IF NOT EXISTS public.personality_internal_notes (
  personality_id uuid PRIMARY KEY
    REFERENCES public.personalities(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.personality_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read personality internal notes" ON public.personality_internal_notes;
CREATE POLICY "Staff can read personality internal notes"
  ON public.personality_internal_notes
  FOR SELECT
  TO authenticated
  USING (
    has_role_jwt('admin'::app_role)
    OR has_role_jwt('moderator'::app_role)
    OR has_role_jwt('editor'::app_role)
  );

DROP POLICY IF EXISTS "Staff can write personality internal notes" ON public.personality_internal_notes;
CREATE POLICY "Staff can write personality internal notes"
  ON public.personality_internal_notes
  FOR ALL
  TO authenticated
  USING (
    has_role_jwt('admin'::app_role)
    OR has_role_jwt('moderator'::app_role)
    OR has_role_jwt('editor'::app_role)
  )
  WITH CHECK (
    has_role_jwt('admin'::app_role)
    OR has_role_jwt('moderator'::app_role)
    OR has_role_jwt('editor'::app_role)
  );

REVOKE ALL ON public.personality_internal_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personality_internal_notes TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_personality_internal_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_personality_internal_notes ON public.personality_internal_notes;
CREATE TRIGGER trg_touch_personality_internal_notes
BEFORE UPDATE ON public.personality_internal_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_personality_internal_notes();
