-- Marketplace quality_score rubric overhaul.
--
-- Problem: marketplace_listings.quality_score was a near-constant ~98 (avg 98.2,
-- min 40) because the old completeness rubric had too few, too-easy criteria and
-- rewarded link_health <> 'broken' (so the 76% 'unchecked' rows still scored +10).
-- quality_score is the PRIMARY sort key for the marketplace browse page
-- (Editor's Choice, Best Value) and a tiebreaker for the default "For You" sort
-- (src/hooks/useMarketplace.tsx) plus a boost in get_personalized_marketplace_listings,
-- so a constant score meant those rankings did not actually rank by quality.
--
-- Fix: a graduated 0-100 rubric that discriminates (description length tiers,
-- image count, price, brand, in_stock, link verification state, LGBTQ+ relevance).
-- Dry-run over the live active catalog produced 43 distinct scores (min 41 /
-- avg 83 / max 96) instead of a flat 98. It also rewards verified links + in-stock
-- + high relevance, so scores improve as the link-checker and stock signals run.

-- New signature (was 6 args) — drop the old one first.
DROP FUNCTION IF EXISTS public.marketplace_completeness_score(text, text[], numeric, numeric, text, text);

CREATE OR REPLACE FUNCTION public.marketplace_completeness_score(
  p_description text,
  p_images text[],
  p_price numeric,
  p_price_usd numeric,
  p_brand text,
  p_link_health text,
  p_in_stock boolean,
  p_relevance numeric,
  p_last_seen timestamptz DEFAULT NULL  -- reserved for future freshness weighting
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    -- Description (graduated): rich 25 / decent 18 / minimal 10 / none 0
    (CASE WHEN length(coalesce(p_description,'')) >= 200 THEN 25
          WHEN length(coalesce(p_description,'')) >= 80  THEN 18
          WHEN length(coalesce(p_description,'')) >= 30  THEN 10
          ELSE 0 END)
    -- Images: gallery 20 / single 13 / none 0
  + (CASE WHEN p_images IS NOT NULL AND array_length(p_images,1) >= 2 THEN 20
          WHEN p_images IS NOT NULL AND array_length(p_images,1) = 1 THEN 13
          ELSE 0 END)
    -- Price present
  + (CASE WHEN coalesce(p_price_usd, p_price) IS NOT NULL
            AND coalesce(p_price_usd, p_price) > 0 THEN 15 ELSE 0 END)
    -- Brand attributed
  + (CASE WHEN length(trim(coalesce(p_brand,''))) > 0 THEN 7 ELSE 0 END)
    -- Stock signal: in stock 8 / unknown 4 / out 0
  + (CASE WHEN p_in_stock IS TRUE THEN 8
          WHEN p_in_stock IS NULL THEN 4
          ELSE 0 END)
    -- Link verification state: verified-good 13 / unchecked 6 / blocked 3 / broken 0
  + (CASE WHEN p_link_health IN ('ok','redirect') THEN 13
          WHEN p_link_health = 'unchecked' THEN 6
          WHEN p_link_health = 'blocked' THEN 3
          ELSE 0 END)
    -- LGBTQ+ relevance: strong 12 / passing 6 / weak 0
  + (CASE WHEN p_relevance >= 0.7 THEN 12
          WHEN p_relevance >= 0.5 THEN 6
          ELSE 0 END)
$function$;

-- Recompute now passes the richer field set, and is scoped to active listings:
-- inactive rows are hidden from browse, so recomputing them every night only
-- risks a search_documents re-index storm for no UX benefit.
CREATE OR REPLACE FUNCTION public.run_marketplace_quality_recompute()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE marketplace_listings m
  SET quality_score = marketplace_completeness_score(
        m.description, m.images, m.price, m.price_usd, m.brand,
        m.link_health, m.in_stock, m.lgbti_relevance_score, m.last_seen_at)
  WHERE m.status = 'active'
    AND m.quality_score IS DISTINCT FROM marketplace_completeness_score(
        m.description, m.images, m.price, m.price_usd, m.brand,
        m.link_health, m.in_stock, m.lgbti_relevance_score, m.last_seen_at);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;
