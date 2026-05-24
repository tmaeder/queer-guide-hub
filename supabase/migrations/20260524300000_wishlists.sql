-- Wishlists: named collections of marketplace listings owned by a user.
-- Replaces the flat marketplace_favorites flag-table with a structured layer
-- so users can group items (e.g. "Berlin Pride 2026", "Gift ideas") and
-- optionally share them. Each existing favorite is migrated into a single
-- default "Saved" wishlist per user, preserving all data.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TYPE wishlist_visibility AS ENUM ('private', 'unlisted', 'public');

CREATE TABLE wishlists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  cover_listing_id  UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  visibility        wishlist_visibility NOT NULL DEFAULT 'private',
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default wishlist per user; backfill below relies on this.
CREATE UNIQUE INDEX wishlists_user_default_idx
  ON wishlists (user_id) WHERE is_default;

CREATE INDEX wishlists_user_idx ON wishlists (user_id, updated_at DESC);
CREATE INDEX wishlists_visibility_idx ON wishlists (visibility) WHERE visibility <> 'private';

CREATE TABLE wishlist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id   UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  listing_id    UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  note          TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wishlist_id, listing_id)
);

CREATE INDEX wishlist_items_wishlist_idx ON wishlist_items (wishlist_id, position, added_at DESC);
CREATE INDEX wishlist_items_listing_idx ON wishlist_items (listing_id);

COMMENT ON TABLE wishlists IS
  'User-owned, named collections of marketplace listings. Replaces the legacy marketplace_favorites flat flag-table.';
COMMENT ON COLUMN wishlists.visibility IS
  'private = owner only, unlisted = anyone with the slug, public = listed publicly';
COMMENT ON COLUMN wishlists.is_default IS
  'True for the auto-created "Saved" wishlist that backs the heart icon when the user has not picked a target list.';

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Owners can do anything to their own wishlists.
CREATE POLICY "wishlists_owner_all"
  ON wishlists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone (including anon) can read public wishlists. Unlisted are
-- intentionally NOT included here — they're surfaced via direct slug
-- lookup through a SECURITY DEFINER RPC below, so they don't leak into
-- generic SELECT * queries.
CREATE POLICY "wishlists_public_read"
  ON wishlists FOR SELECT
  USING (visibility = 'public');

-- Items follow the parent wishlist's visibility.
CREATE POLICY "wishlist_items_owner_all"
  ON wishlist_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM wishlists w
      WHERE w.id = wishlist_items.wishlist_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wishlists w
      WHERE w.id = wishlist_items.wishlist_id AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "wishlist_items_public_read"
  ON wishlist_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wishlists w
      WHERE w.id = wishlist_items.wishlist_id AND w.visibility = 'public'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON wishlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON wishlist_items TO authenticated;
GRANT SELECT ON wishlists TO anon;
GRANT SELECT ON wishlist_items TO anon;

-- ---------------------------------------------------------------------------
-- 3. Unlisted-by-slug RPC
-- ---------------------------------------------------------------------------

-- Lets the /wishlists/:slug page resolve unlisted wishlists when the
-- caller already knows the slug, without exposing unlisted lists to
-- broad SELECT queries.
CREATE OR REPLACE FUNCTION public.get_wishlist_by_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  slug TEXT,
  title TEXT,
  description TEXT,
  cover_listing_id UUID,
  visibility wishlist_visibility,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT w.id, w.user_id, w.slug, w.title, w.description, w.cover_listing_id,
         w.visibility, w.is_default, w.created_at, w.updated_at
  FROM public.wishlists w
  WHERE w.slug = p_slug
    AND (
      w.visibility IN ('public', 'unlisted')
      OR w.user_id = auth.uid()
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_wishlist_by_slug(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_wishlists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wishlists_touch
  BEFORE UPDATE ON wishlists
  FOR EACH ROW EXECUTE FUNCTION public.touch_wishlists_updated_at();

-- Bump parent when an item is added/removed/reordered so the wishlist
-- list-view sorts naturally by most recently changed.
CREATE OR REPLACE FUNCTION public.touch_wishlist_on_item_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE wishlists SET updated_at = now()
    WHERE id = COALESCE(NEW.wishlist_id, OLD.wishlist_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_wishlist_items_touch_parent
  AFTER INSERT OR UPDATE OR DELETE ON wishlist_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_wishlist_on_item_change();

-- ---------------------------------------------------------------------------
-- 5. Backfill from marketplace_favorites
-- ---------------------------------------------------------------------------

-- One default "Saved" wishlist per user with at least one favorite.
INSERT INTO wishlists (user_id, slug, title, is_default, visibility)
SELECT DISTINCT
  mf.user_id,
  'saved-' || substr(replace(mf.user_id::text, '-', ''), 1, 12),
  'Saved',
  true,
  'private'
FROM marketplace_favorites mf
ON CONFLICT (slug) DO NOTHING;

-- Move each favorite into its owner's default wishlist.
INSERT INTO wishlist_items (wishlist_id, listing_id, added_at)
SELECT w.id, mf.listing_id, mf.created_at
FROM marketplace_favorites mf
JOIN wishlists w ON w.user_id = mf.user_id AND w.is_default
ON CONFLICT (wishlist_id, listing_id) DO NOTHING;

-- marketplace_favorites stays for now — the heart UI still reads it for
-- "is this saved?" until the frontend cuts over fully. A later migration
-- will drop it once the new pathway has been live for a release cycle.

-- ---------------------------------------------------------------------------
-- 6. Aggregated counts: how many wishlists hold each listing
-- ---------------------------------------------------------------------------

-- Used for "Saved by 12 people" social proof on hot listings. Public
-- wishlists only — private/unlisted lists are not leaked into counts.
CREATE OR REPLACE FUNCTION public.get_wishlist_save_counts(p_listing_ids UUID[])
RETURNS TABLE (listing_id UUID, saves INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT wi.listing_id, COUNT(DISTINCT wi.wishlist_id)::INTEGER AS saves
  FROM wishlist_items wi
  JOIN wishlists w ON w.id = wi.wishlist_id
  WHERE wi.listing_id = ANY(p_listing_ids)
    AND w.visibility = 'public'
  GROUP BY wi.listing_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_wishlist_save_counts(UUID[]) TO anon, authenticated;
