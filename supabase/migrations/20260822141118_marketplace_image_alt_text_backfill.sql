-- Alt text was empty on ALL 73,826 marketplace image assets. Deterministic
-- derivation from the owning listing (title — brand). Fill-if-empty only.
-- See repo migration 20260916120300.
SET statement_timeout = '900s';

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
