-- Personality attachments — evidence/source snapshots per person, ported from
-- the PHP curation tool (Wikipedia-Artikel als Anhang ablegen).
--
-- Primary use: an editor pastes a Wikipedia URL; the archive-wikipedia-personality
-- edge function fetches the article HTML, stores it in the private
-- `personality-attachments` bucket, and records a row here. Files never leave
-- the bucket unsigned — the admin panel mints short-lived signed URLs at read.

-- 1. Wikipedia URL on personalities (cities/countries already have this column;
--    personalities only had wikidata_qid / external_ids until now).
ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS wikipedia_url text;

COMMENT ON COLUMN public.personalities.wikipedia_url IS
  'Canonical Wikipedia article URL. Set when an editor archives the article via archive-wikipedia-personality.';

-- 2. Attachments table.
CREATE TABLE IF NOT EXISTS public.personality_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id uuid NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,

  kind text NOT NULL DEFAULT 'wikipedia_snapshot'
    CHECK (kind IN ('wikipedia_snapshot', 'file', 'other')),
  title text NOT NULL,
  source_url text,

  /** Path inside the private `personality-attachments` bucket. */
  storage_path text NOT NULL,
  mime_type text,
  size_bytes integer,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personality_attachments_person
  ON public.personality_attachments (personality_id, created_at DESC);

-- RLS: staff-only (editors and up), mirroring personality_internal_notes.
ALTER TABLE public.personality_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personality_attachments_staff_select" ON public.personality_attachments;
CREATE POLICY "personality_attachments_staff_select" ON public.personality_attachments
  FOR SELECT USING (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  );

DROP POLICY IF EXISTS "personality_attachments_staff_write" ON public.personality_attachments;
CREATE POLICY "personality_attachments_staff_write" ON public.personality_attachments
  FOR ALL USING (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  ) WITH CHECK (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  );

-- 3. Private storage bucket. Writes happen from the edge function (service role,
--    bypasses RLS); staff get read + delete so the admin panel can mint signed
--    URLs and remove snapshots.
INSERT INTO storage.buckets (id, name, public)
VALUES ('personality-attachments', 'personality-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "personality_attachments_storage_staff_select" ON storage.objects;
CREATE POLICY "personality_attachments_storage_staff_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'personality-attachments'
    AND (has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor'))
  );

DROP POLICY IF EXISTS "personality_attachments_storage_staff_delete" ON storage.objects;
CREATE POLICY "personality_attachments_storage_staff_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'personality-attachments'
    AND (has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor'))
  );
