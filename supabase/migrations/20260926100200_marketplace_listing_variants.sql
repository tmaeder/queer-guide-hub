-- Marketplace listing variants (finer-categorisation program, PR 2).
--
-- Per-variant rows for the "offers size X / colour Y" model. Fed exclusively by
-- the marketplace-variant-backfill runner (PR 3) from the raw source payloads
-- already retained in marketplace_listing_sources.raw — measured 2026-08-23:
-- ~40 Shopify-style sources carry options[]/variants[] on ~44k of 61k raw rows
-- (option names: Size 22,022 / Color 13,724 / Größe 1,588 / Farbe 428 /
-- Taglia+Colore Italian / "Title" = Shopify's single-variant placeholder).
-- Feed-style sources (demask, puppyplayexpert) carry listing-level colour/
-- condition/dimensions only and get NO variant rows — their attributes live on
-- marketplace_listings.attributes and still filter via the sizes/colors arrays.
--
-- RLS: plain public SELECT, deliberately NOT parent-gated on content_rating —
-- the 18+ gate is a client-side age opt-in (not auth), so a rating-gated
-- policy would break adult PDPs for opted-in anon users. This matches the
-- existing exposure of marketplace_listing_sources.raw.
--
-- No search trigger: variants are not search documents; they roll up into
-- marketplace_listings.attributes, whose columns feed search facets in PR 5.

CREATE TABLE public.marketplace_listing_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  source_slug text NOT NULL,
  source_variant_id text,          -- Shopify variant.id etc.; NULL = synthetic row
  sku text,
  title text,                      -- merchant variant title, e.g. "M / Black"
  option_size text,                -- canonical slug (s, m, 2xl, eu-38, w32, one-size)
  option_size_raw text,            -- merchant literal, for provenance/debugging
  option_color text,               -- canonical slug (black, rainbow, …)
  option_color_raw text,
  option_material text,            -- canonical slug (cotton, latex, …)
  options jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full {name: value} map incl. unmapped axes
  price numeric,
  currency text,
  price_usd numeric,
  available boolean,
  inventory_quantity integer,
  position integer,
  image_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marketplace_listing_variants IS
  'Per-variant size/colour/price/stock rows extracted from marketplace_listing_sources.raw '
  'by marketplace-variant-backfill. Canonical option slugs come from '
  '_shared/marketplace-attributes.ts; the listing-level roll-up lives in '
  'marketplace_listings.attributes (+ GENERATED sizes/colors arrays).';

-- Upsert arbiters: real source variant ids when present, options-shape hash
-- for synthetic rows (feed sources that describe variants without ids).
CREATE UNIQUE INDEX marketplace_listing_variants_src_uniq
  ON public.marketplace_listing_variants (listing_id, source_slug, source_variant_id)
  WHERE source_variant_id IS NOT NULL;
CREATE UNIQUE INDEX marketplace_listing_variants_opts_uniq
  ON public.marketplace_listing_variants (listing_id, source_slug, md5(options::text))
  WHERE source_variant_id IS NULL;

CREATE INDEX marketplace_listing_variants_listing_idx
  ON public.marketplace_listing_variants (listing_id);
CREATE INDEX marketplace_listing_variants_size_idx
  ON public.marketplace_listing_variants (option_size) WHERE option_size IS NOT NULL;
CREATE INDEX marketplace_listing_variants_color_idx
  ON public.marketplace_listing_variants (option_color) WHERE option_color IS NOT NULL;

ALTER TABLE public.marketplace_listing_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Variants are publicly readable"
  ON public.marketplace_listing_variants FOR SELECT USING (true);
CREATE POLICY "Service role manages variants"
  ON public.marketplace_listing_variants FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- Project rule: new tables need explicit grants — RLS alone gates nothing
-- without table-level privileges.
GRANT SELECT ON public.marketplace_listing_variants TO anon, authenticated;
GRANT ALL ON public.marketplace_listing_variants TO service_role;
