-- Trip metadata (traveler_type, vibe_tags) + trip_collections curation tables.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS traveler_type text
    CHECK (traveler_type IS NULL OR traveler_type IN ('solo','couple','group','family')),
  ADD COLUMN IF NOT EXISTS vibe_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS trips_vibe_tags_gin ON public.trips USING GIN (vibe_tags);

CREATE TABLE IF NOT EXISTS public.trip_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_collection_items (
  collection_id uuid NOT NULL REFERENCES public.trip_collections(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, trip_id)
);

CREATE INDEX IF NOT EXISTS trip_collection_items_trip_idx ON public.trip_collection_items(trip_id);

ALTER TABLE public.trip_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_collections_public_read ON public.trip_collections;
CREATE POLICY trip_collections_public_read ON public.trip_collections
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS trip_collection_items_public_read ON public.trip_collection_items;
CREATE POLICY trip_collection_items_public_read ON public.trip_collection_items
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.trip_collections c WHERE c.id = collection_id AND c.is_active = true)
  );

DROP POLICY IF EXISTS trip_collections_admin_write ON public.trip_collections;
CREATE POLICY trip_collections_admin_write ON public.trip_collections
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS trip_collection_items_admin_write ON public.trip_collection_items;
CREATE POLICY trip_collection_items_admin_write ON public.trip_collection_items
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
