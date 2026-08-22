-- Alt text was empty on ALL 73,826 marketplace image assets (measured
-- 2026-08-22) — every product image rendered with no accessible name.
-- Deterministic derivation from the owning listing: title, plus brand when
-- the title doesn't already contain it. No LLM, no fabrication — the alt of
-- a product photo is the product.
--
-- image_assets carries no search trigger (only updated_at + a BEFORE INSERT
-- optimizer hook), so a bulk UPDATE here causes zero reindex churn.
-- Fill-if-empty only: a curated alt is never overwritten.
UPDATE public.image_assets ia
SET alt_text = src.alt,
    alt_provenance = 'derived:listing_title'
FROM (
  SELECT DISTINCT ON (ial.asset_id)
    ial.asset_id,
    left(
      btrim(ml.title)
      || CASE
           WHEN ml.brand IS NOT NULL AND btrim(ml.brand) <> ''
                AND position(lower(btrim(ml.brand)) IN lower(ml.title)) = 0
           THEN ' — ' || btrim(ml.brand)
           ELSE ''
         END,
      300
    ) AS alt
  FROM public.image_asset_links ial
  JOIN public.marketplace_listings ml ON ml.id = ial.entity_id
  WHERE ial.entity_type = 'marketplace_listing'
    AND ml.title IS NOT NULL AND btrim(ml.title) <> ''
  ORDER BY ial.asset_id, (ial.role = 'cover') DESC, ial.sort_order
) src
WHERE ia.id = src.asset_id
  AND (ia.alt_text IS NULL OR ia.alt_text = '');
