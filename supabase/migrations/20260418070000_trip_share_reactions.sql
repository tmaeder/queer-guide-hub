-- ============================================================
-- trip_share_reactions: emoji reactions from (mostly anonymous)
-- viewers of shared trips. Lets a traveler see which places
-- their friends loved, bookmarked, or flagged on a shared trip.
--
-- Viewer identification:
--   - Authenticated users: viewer_id set to auth.uid()
--   - Anonymous viewers:   viewer_fingerprint = client-generated
--                          random ID persisted in localStorage
--
-- The unique constraint prevents a single viewer from spamming
-- the same emoji on the same place. Clients toggle by reading
-- existing rows + inserting/deleting.
-- ============================================================

CREATE TABLE public.trip_share_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.trip_places(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 12),
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one identifier must be set
  CONSTRAINT viewer_identity_present
    CHECK (viewer_id IS NOT NULL OR viewer_fingerprint IS NOT NULL),
  -- Dedup per (place, emoji, viewer)
  CONSTRAINT trip_share_reactions_unique_viewer
    UNIQUE NULLS NOT DISTINCT (place_id, emoji, viewer_id, viewer_fingerprint)
);

CREATE INDEX idx_trip_share_reactions_place ON public.trip_share_reactions(place_id);
CREATE INDEX idx_trip_share_reactions_trip ON public.trip_share_reactions(trip_id);

ALTER TABLE public.trip_share_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone may read reactions for a public trip; trip members
-- may read reactions on their own trip regardless of public flag.
CREATE POLICY trip_share_reactions_select ON public.trip_share_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_reactions.trip_id
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

-- INSERT: anyone (including anon) may react on a public trip, as
-- long as the viewer identifier is consistent with who they are.
CREATE POLICY trip_share_reactions_insert ON public.trip_share_reactions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_reactions.trip_id AND t.is_public = true
  )
  AND (
    (auth.uid() IS NOT NULL AND viewer_id = auth.uid() AND viewer_fingerprint IS NULL)
    OR (auth.uid() IS NULL AND viewer_id IS NULL AND viewer_fingerprint IS NOT NULL)
  )
);

-- DELETE: viewer can remove their own reaction (un-react).
CREATE POLICY trip_share_reactions_delete ON public.trip_share_reactions FOR DELETE USING (
  (auth.uid() IS NOT NULL AND viewer_id = auth.uid())
  OR (auth.uid() IS NULL AND viewer_fingerprint IS NOT NULL)
);
