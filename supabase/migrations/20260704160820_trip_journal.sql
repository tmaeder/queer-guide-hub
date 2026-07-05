-- Journey: per-trip travel journal (free-form entries with mood + photos).
-- Complements place-tied memories in user_place_marks (journal_note/photo_urls).

CREATE TABLE public.trip_journal_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id      UUID REFERENCES public.trip_days(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  mood        TEXT CHECK (mood IS NULL OR mood IN ('joy', 'good', 'mixed', 'tough')),
  photo_paths TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trip_journal_entries_trip_idx ON public.trip_journal_entries (trip_id, created_at DESC);
CREATE INDEX trip_journal_entries_user_idx ON public.trip_journal_entries (user_id, created_at DESC);

ALTER TABLE public.trip_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_journal_select" ON public.trip_journal_entries
  FOR SELECT USING (public.is_trip_member(trip_id, (SELECT auth.uid())));

CREATE POLICY "trip_journal_insert" ON public.trip_journal_entries
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_trip_member(trip_id, (SELECT auth.uid()))
  );

CREATE POLICY "trip_journal_update" ON public.trip_journal_entries
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "trip_journal_delete" ON public.trip_journal_entries
  FOR DELETE USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_journal_entries TO authenticated;

-- Photos live in a private bucket under {trip_id}/{user_id}/...; trip members
-- can read (signed URLs), authors write/delete their own folder. NOT the
-- encrypted trip-documents vault — journal photos are shared with the group.
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-photos', 'trip-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "trip_photos_member_select" ON storage.objects;
CREATE POLICY "trip_photos_member_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'trip-photos'
    AND public.is_trip_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "trip_photos_author_insert" ON storage.objects;
CREATE POLICY "trip_photos_author_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'trip-photos'
    AND public.is_trip_member(((storage.foldername(name))[1])::uuid, (SELECT auth.uid()))
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "trip_photos_author_delete" ON storage.objects;
CREATE POLICY "trip_photos_author_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'trip-photos'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );
