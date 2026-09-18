-- A merchant's purchase-order numbers were published as 20 separate makers.
--
-- `marketplace_listings.brand` is taken VERBATIM from a Shopify feed's `vendor`
-- field, and `brand_key` is a GENERATED column over it
-- (`marketplace_normalize_brand(brand)`). That key is the identity every brand
-- row, maker page and directory tile hangs off — so a merchant who uses the
-- vendor field for something other than a brand does not merely mislabel a
-- product, they MINT A BRAND.
--
-- Garçon Model put PO numbers there. Measured on prod 2026-09-16:
--
--   * 21 brand_keys for ONE merchant (garconmodel.com), all one domain.
--   * 189 of their 198 listings sat on 20 artifacts — `12807-204144345`,
--     `19868-001638740`, `‭1280-7204244927‬` (that one carries bidi control
--     characters) — against 9 on the real `GARÇON` row, which holds the logo.
--   * Every one of those 20 published a maker page at
--     /marketplace/brands/12807-203758186 naming a PO number as a maker.
--   * Queer Lit had one book, THE DARK TIDE, carrying its ISBN-13 where that
--     feed puts the author.
--
-- THE LISTINGS ARE REAL AND ARE NOT TOUCHED. They are Cairo Brief, Jeddah
-- Jockstrap, Mykonos Trunk — active, priced $23-32, 3-7 images each, live URLs
-- on garconmodel.com. This is wrong ATTRIBUTION, so the fix is to re-key them
-- onto the brand they always belonged to. Deleting them would destroy 190
-- sellable products to tidy up a name.
--
-- ── the predicate is "has no letter", not "looks like an ID" ──
-- The failure is not that these strings contain digits; plenty of real brands
-- do, and this table holds `2(X)IST`, `b-Vibe`, `gc2b`, `RUFSKIN®` and
-- `1979 SAS (Teil der Marc Dorcel Group)`. It is that they contain no word at
-- all. Across all 70,585 listings `brand !~ '[[:alpha:]]'` matches 190 rows on
-- 2 merchants and nothing else. Verified on this server that the class is
-- UNICODE-aware and so agrees with the `\p{L}` test in the producer guard:
-- '東京', 'Åberg' and 'Привет' are all alpha; '12807-204144345' and
-- '9781728209982' are not.
--
-- `1979 SAS (Teil der Marc Dorcel Group)` is the one brand in the directory
-- that starts with a digit and is REAL — a Marc Dorcel legal entity. It has
-- letters, so nothing here can reach it. The postconditions assert that.
--
-- ── why the producer is fixed in the same change ──
-- `marketplace_register_brands()` re-derives brands from listings weekly. A
-- data-only repair is undone by the next sync. `brandFromVendor()` in
-- `_shared/marketplace-pipeline-utils.ts` now rejects a letterless vendor in
-- both Shopify adapters and falls back to the merchant — never back onto
-- `vendor`, which is the value just rejected.
--
-- ── reversibility ──
-- `marketplace_brands` has ZERO inbound foreign keys (checked in pg_constraint,
-- not assumed), so nothing dangles. Disposition is `status='rejected'` plus a
-- `reviewer_note` carrying the prior slug, status and count verbatim, so any
-- row can be restored by hand. Nothing is deleted.
--
-- The slug is NULLed as well as the status changed, and that is load-bearing
-- rather than tidy: `get_marketplace_brand(p_slug)` has NO status filter — it
-- is `WHERE b.slug = p_slug` and deliberately serves unapproved rows so admins
-- can preview pending brands. Rejecting alone would leave all 20 maker pages
-- live at their old URLs showing a PO number over an empty grid. With a NULL
-- slug the lookup cannot match and the page takes its existing dead-end branch.
-- Fixing this by adding a status filter to that RPC was rejected: it would
-- change a shared function's contract for every caller to solve 20 rows.
--
-- Brands appear in NO sitemap and are absent from `search_documents` entirely
-- (its entity vocabulary has no brand type), so those two surfaces need
-- nothing. Checked rather than assumed.

-- ── 1. give the producer guard a name to fall back to ─────────────────────────
-- Without this the guard would emit the shop domain. `GARÇON` and not
-- `Garçon Model` on purpose: it must normalize to the EXISTING `garçon`
-- brand_key, or the next sync forks a second row and re-splits the brand the
-- rest of this migration is joining back together.
UPDATE public.marketplace_merchants
SET config = coalesce(config, '{}'::jsonb) || '{"brand_name":"GARÇON"}'::jsonb,
    updated_at = now()
WHERE slug = 'garconmodel';

-- ── 2. re-key the listings onto the brand they belong to ──────────────────────
-- `brand_key` is GENERATED, so writing `brand` is sufficient and writing
-- `brand_key` directly is an error.
-- Deliberately NOT filtered on status: an inactive listing still points at a
-- brand row, and leaving it behind would keep a retired key alive.
UPDATE public.marketplace_listings
SET brand = 'GARÇON'
WHERE merchant_domain = 'garconmodel.com'
  AND brand IS NOT NULL
  AND brand !~ '[[:alpha:]]';

-- The bookshop's own `business_name` is already correct ("Queer Lit"), which is
-- exactly what the producer guard would now emit, so this uses it rather than a
-- literal — and refuses to write a fallback that is itself letterless.
UPDATE public.marketplace_listings
SET brand = business_name
WHERE merchant_domain = 'queerlit.co.uk'
  AND brand IS NOT NULL
  AND brand !~ '[[:alpha:]]'
  AND business_name IS NOT NULL
  AND business_name ~ '[[:alpha:]]';

-- ── 3. retire the artifact brand rows ─────────────────────────────────────────
-- The right-hand side of an UPDATE sees the OLD row, so `slug`/`status`/
-- `product_count` below are the pre-change values even though this statement
-- also overwrites them.
UPDATE public.marketplace_brands
SET status = 'rejected',
    product_count = 0,
    slug = NULL,
    reviewed_at = now(),
    updated_at = now(),
    reviewer_note = 'auto-retire 99100101143000: feed-ID artifact (no letter in the name); '
                 || 'listings re-keyed to the merchant brand. prior slug=' || coalesce(slug, '(null)')
                 || ' status=' || status
                 || ' product_count=' || product_count
WHERE display_name !~ '[[:alpha:]]';

-- ── 4. restate the receiving brands' counts ───────────────────────────────────
-- `marketplace_register_brands()` only ever aggregates brands that still have
-- active listings, so it can RAISE a count but never lower one to zero — which
-- is why step 3 had to zero the artifacts explicitly rather than wait for the
-- weekly cron to notice.
UPDATE public.marketplace_brands b
SET product_count = agg.n, updated_at = now()
FROM (
  SELECT public.marketplace_normalize_brand(brand) AS k, count(*)::int AS n
  FROM public.marketplace_listings
  WHERE status = 'active' AND brand IS NOT NULL
  GROUP BY 1
) agg
WHERE agg.k = b.brand_key
  AND b.brand_key IN ('garçon', 'queer lit');

DO $verify$
DECLARE
  v_letterless_listings int;
  v_letterless_visible  int;
  v_garcon              int;
  v_dorcel              int;
BEGIN
  -- The invariant this migration exists to reach, asserted as a PROPERTY rather
  -- than as the row counts measured while writing it — a churning catalogue
  -- would rot a literal between authoring and the CI that applies it.
  SELECT count(*) INTO v_letterless_listings
  FROM public.marketplace_listings
  WHERE status = 'active' AND brand IS NOT NULL AND brand !~ '[[:alpha:]]';
  IF v_letterless_listings <> 0 THEN
    RAISE EXCEPTION 'still % active listings whose brand has no letter', v_letterless_listings;
  END IF;

  -- Reachability, not just status: a row with a slug is still served by
  -- get_marketplace_brand regardless of status, so both halves are checked.
  SELECT count(*) INTO v_letterless_visible
  FROM public.marketplace_brands
  WHERE display_name !~ '[[:alpha:]]'
    AND (status = 'approved' OR slug IS NOT NULL);
  IF v_letterless_visible <> 0 THEN
    RAISE EXCEPTION '% feed-ID brand rows are still reachable', v_letterless_visible;
  END IF;

  -- The listings were MOVED, not dropped. If the re-key silently matched
  -- nothing, GARÇON would still be sitting on its original 9.
  SELECT product_count INTO v_garcon
  FROM public.marketplace_brands WHERE brand_key = 'garçon';
  IF coalesce(v_garcon, 0) < 100 THEN
    RAISE EXCEPTION 'GARÇON holds % listings; the re-key did not land', coalesce(v_garcon, -1);
  END IF;

  -- The mirror assertion: the one real brand whose name starts with a digit
  -- must be untouched. Without this, a predicate that ate every non-alpha
  -- START rather than every letterless NAME would pass everything above.
  SELECT count(*) INTO v_dorcel
  FROM public.marketplace_brands
  WHERE display_name LIKE '1979 SAS%' AND status = 'approved' AND slug IS NOT NULL;
  IF v_dorcel <> 1 THEN
    RAISE EXCEPTION 'the real "1979 SAS" brand was caught by the sweep';
  END IF;

  RAISE NOTICE 'feed-ID brands retired; GARÇON now holds % listings', v_garcon;
END
$verify$;
