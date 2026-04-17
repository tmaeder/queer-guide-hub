-- Trip documents — encrypted vault for travel paperwork.
--
-- Use cases:
--   * Personal docs (passport, ID, vaccine card) — `trip_id` IS NULL.
--   * Trip-specific docs (visa, hotel voucher, e-ticket PDF) — attached
--     to a trip; trip co-members can read.
--
-- Storage layout: files live in the `trip-documents` bucket under
-- `{user_id}/{document_id}.{ext}`. The bucket is private; access is
-- gated entirely through Supabase signed URLs minted at read time
-- (see useTripDocuments hook).

CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,

  doc_type text NOT NULL CHECK (doc_type IN (
    'passport', 'id_card', 'visa', 'vaccine', 'insurance',
    'flight_ticket', 'hotel_voucher', 'event_ticket', 'other'
  )),
  title text NOT NULL,

  /** Storage path inside the `trip-documents` bucket. */
  storage_path text NOT NULL,
  file_size_bytes integer,
  mime_type text,

  /** Soft expiry — surfaced in the UI for warning banners. */
  expiry_date date,

  /** Country this doc is for (visa target, etc). Optional. */
  country_id uuid REFERENCES public.countries(id),

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_user
  ON public.trip_documents (user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip
  ON public.trip_documents (trip_id) WHERE trip_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_trip_documents_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_documents_touch_updated_at ON public.trip_documents;
CREATE TRIGGER trip_documents_touch_updated_at
  BEFORE UPDATE ON public.trip_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_trip_documents_updated_at();

-- RLS: owner full access; trip co-members read-only on attached docs.
ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_documents_select" ON public.trip_documents;
CREATE POLICY "trip_documents_select" ON public.trip_documents
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      trip_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.trip_members tm
        WHERE tm.trip_id = trip_documents.trip_id
          AND tm.user_id = auth.uid()
          AND tm.accepted_at IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "trip_documents_insert" ON public.trip_documents;
CREATE POLICY "trip_documents_insert" ON public.trip_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trip_documents_update" ON public.trip_documents;
CREATE POLICY "trip_documents_update" ON public.trip_documents
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "trip_documents_delete" ON public.trip_documents;
CREATE POLICY "trip_documents_delete" ON public.trip_documents
  FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket. Private — clients must use signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-documents', 'trip-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: a user can read/write objects under their own folder
-- ({user_id}/...). Sharing happens at the metadata level via
-- trip_documents.trip_id + signed URLs minted by the owner.

DROP POLICY IF EXISTS "trip_documents_storage_owner_select" ON storage.objects;
CREATE POLICY "trip_documents_storage_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'trip-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "trip_documents_storage_owner_insert" ON storage.objects;
CREATE POLICY "trip_documents_storage_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'trip-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "trip_documents_storage_owner_delete" ON storage.objects;
CREATE POLICY "trip_documents_storage_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'trip-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
