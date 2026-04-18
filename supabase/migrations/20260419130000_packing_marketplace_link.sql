-- ============================================================
-- Trip Planning V2: Link packing items to marketplace listings
--
-- When a user accepts a marketplace suggestion into their
-- checklist, we remember which listing it came from so we can
-- attribute affiliate clicks and re-render the product card
-- alongside the checklist entry.
-- ============================================================

ALTER TABLE public.trip_packing_items
  ADD COLUMN IF NOT EXISTS marketplace_listing_id UUID
    REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_by TEXT
    CHECK (suggested_by IN ('user','template','marketplace_suggestion','llm'))
    DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS suggestion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_packing_items_marketplace_listing
  ON public.trip_packing_items(marketplace_listing_id)
  WHERE marketplace_listing_id IS NOT NULL;

COMMENT ON COLUMN public.trip_packing_items.marketplace_listing_id
  IS 'If the item was added from a marketplace suggestion, points back to the listing for product card re-render + affiliate attribution.';
COMMENT ON COLUMN public.trip_packing_items.suggested_by
  IS 'Provenance of this item: user (manual), template (rule-based), marketplace_suggestion, llm.';
COMMENT ON COLUMN public.trip_packing_items.suggestion_reason
  IS 'Human-readable why we suggested this (e.g. "Tropical climate + 10-day trip"). NULL for user-added items.';

-- ── LLM suggestion cache ───────────────────────────────────────
-- Rate-limits the packing-suggestions-llm edge function; cache
-- entries expire after 24h but are looked up by trip snapshot hash.
CREATE TABLE IF NOT EXISTS public.packing_suggestion_cache (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_hash  TEXT NOT NULL,
  suggestions    JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (trip_id, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_packing_suggestion_cache_trip
  ON public.packing_suggestion_cache(trip_id, expires_at DESC);

ALTER TABLE public.packing_suggestion_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY packing_suggestion_cache_own_row
  ON public.packing_suggestion_cache
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.packing_suggestion_cache
  IS 'Caches LLM-generated packing suggestions keyed by trip snapshot hash to limit Claude Haiku calls to ~3/trip/day.';
