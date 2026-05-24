-- Editorial collections for the marketplace. Powers both the occasion
-- chips at the top of /marketplace ("Pride essentials", "Gifts under
-- $50"…) and the rotating editorial hero block. A single record is the
-- unit of both — display_mode controls which surface(s) it appears on.

CREATE TYPE marketplace_collection_display_mode AS ENUM ('chip', 'hero', 'rail');
CREATE TYPE marketplace_collection_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE marketplace_collections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  cover_image_url TEXT,
  editor_blurb    TEXT,
  status          marketplace_collection_status NOT NULL DEFAULT 'draft',
  display_mode    marketplace_collection_display_mode NOT NULL DEFAULT 'chip',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  pin_until       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE marketplace_collection_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES marketplace_collections(id) ON DELETE CASCADE,
  listing_id    UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  editor_note   TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, listing_id)
);

CREATE INDEX marketplace_collections_status_idx
  ON marketplace_collections (status, display_mode, sort_order);
CREATE INDEX marketplace_collection_items_collection_idx
  ON marketplace_collection_items (collection_id, position);

-- Only one collection is the hero at a time. Enforced via partial unique
-- index on display_mode + status so SQL guarantees the invariant rather
-- than relying on editor discipline.
CREATE UNIQUE INDEX marketplace_collections_single_hero_idx
  ON marketplace_collections ((1))
  WHERE display_mode = 'hero' AND status = 'published';

COMMENT ON TABLE marketplace_collections IS
  'Editor-curated collections shown as occasion chips, hero blocks, or rails on /marketplace.';
COMMENT ON COLUMN marketplace_collections.display_mode IS
  'chip = appears in top occasion chip row; hero = pinned editorial hero block (only one published at a time); rail = horizontal scroll row.';

-- RLS: public reads of published collections, admin writes.
ALTER TABLE marketplace_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_collections_public_read"
  ON marketplace_collections FOR SELECT
  USING (status = 'published');

CREATE POLICY "marketplace_collections_admin_write"
  ON marketplace_collections FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "marketplace_collection_items_public_read"
  ON marketplace_collection_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_collections c
      WHERE c.id = marketplace_collection_items.collection_id
        AND c.status = 'published'
    )
  );

CREATE POLICY "marketplace_collection_items_admin_write"
  ON marketplace_collection_items FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON marketplace_collections TO anon, authenticated;
GRANT SELECT ON marketplace_collection_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON marketplace_collections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON marketplace_collection_items TO authenticated;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_marketplace_collections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marketplace_collections_touch
  BEFORE UPDATE ON marketplace_collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketplace_collections_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: 4 starter chip collections so /marketplace has content from day 1.
-- Empty until admin (or scripts) attach listings; the UI hides chips with
-- zero linked items so an empty seed doesn't render an empty rail.
-- ---------------------------------------------------------------------------

INSERT INTO marketplace_collections (slug, title, subtitle, status, display_mode, sort_order, published_at)
VALUES
  ('pride-essentials', 'Pride essentials', 'For the parade, the protest, the after-party.', 'published', 'chip', 10, now()),
  ('gifts-under-50',  'Gifts under $50',  'Thoughtful, queer-owned, affordable.',           'published', 'chip', 20, now()),
  ('travel-kit',      'Travel kit',       'Pack smart for your next trip.',                 'published', 'chip', 30, now()),
  ('drag-night',      'Drag night',       'Looks, kits, gear.',                             'published', 'chip', 40, now())
ON CONFLICT (slug) DO NOTHING;
