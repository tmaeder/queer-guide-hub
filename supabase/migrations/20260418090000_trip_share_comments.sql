-- ============================================================
-- trip_share_comments: public-trip viewers leave short comments
-- on individual places. Paired with trip_share_reactions for the
-- full social layer on shared trips.
--
-- Identity model mirrors reactions: authenticated users → viewer_id,
-- anonymous viewers → viewer_fingerprint (localStorage UUID).
-- Display name is required — anons pick one per session.
-- ============================================================

CREATE TABLE public.trip_share_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.trip_places(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 600),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one identifier must be set
  CONSTRAINT viewer_identity_present_comment
    CHECK (viewer_id IS NOT NULL OR viewer_fingerprint IS NOT NULL)
);

CREATE INDEX idx_trip_share_comments_place ON public.trip_share_comments(place_id, created_at DESC);
CREATE INDEX idx_trip_share_comments_trip ON public.trip_share_comments(trip_id, created_at DESC);

ALTER TABLE public.trip_share_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: same as reactions — public trips open to all, private trips
-- visible only to owner + members.
CREATE POLICY trip_share_comments_select ON public.trip_share_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_comments.trip_id
      AND (
        t.is_public = true
        OR t.owner_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.trip_members m
          WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
        )
      )
  )
);

-- INSERT: anyone on a public trip, identity must match caller
CREATE POLICY trip_share_comments_insert ON public.trip_share_comments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_comments.trip_id AND t.is_public = true
  )
  AND (
    (auth.uid() IS NOT NULL AND viewer_id = auth.uid() AND viewer_fingerprint IS NULL)
    OR (auth.uid() IS NULL AND viewer_id IS NULL AND viewer_fingerprint IS NOT NULL)
  )
);

-- DELETE: only the author (by matching identity) or the trip owner
CREATE POLICY trip_share_comments_delete ON public.trip_share_comments FOR DELETE USING (
  (auth.uid() IS NOT NULL AND viewer_id = auth.uid())
  OR (auth.uid() IS NULL AND viewer_fingerprint IS NOT NULL)
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_comments.trip_id AND t.owner_id = (SELECT auth.uid())
  )
);
