-- Adds community_owned_tags to marketplace_listings: the core "queer-owned /
-- trans-owned / BIPOC-owned / women-owned" filter currently has no
-- backing column. Phase 1 of the marketplace editorial atlas redesign
-- (docs/plans/2026-05-24-marketplace-redesign.md §4).
--
-- Values are free-form text[] but the UI exposes a fixed vocabulary:
--   'queer_owned' | 'trans_owned' | 'bipoc_owned' | 'women_owned'
--   | 'disabled_owned' | 'nonprofit'
-- Stored as snake_case so URL slugs round-trip cleanly.

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS community_owned_tags text[]
    NOT NULL DEFAULT '{}'::text[];

-- GIN index so `community_owned_tags && '{queer_owned}'::text[]` is fast
-- across the (large) active catalogue. Cannot use CONCURRENTLY inside
-- a migration transaction (CLAUDE.md gotcha).
CREATE INDEX IF NOT EXISTS marketplace_listings_community_owned_tags_idx
  ON public.marketplace_listings
  USING gin (community_owned_tags);
