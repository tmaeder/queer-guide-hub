-- ============================================================
-- Boutique ranking: default marketplace sort that surfaces the good stuff
--
-- The default "for_you" sort was fake (views-count fallback) and views are
-- dominated by the aggregator bulk. boutique_score blends on-row quality
-- signals so queer-owned, high-relevance, branded items lead by default.
--
-- STORED GENERATED columns (house pattern, cf. department/content_rating):
-- the ADD COLUMN table rewrite does NOT fire row triggers, so
-- trg_search_documents_marketplace stays quiet — zero new write traffic on
-- the disk-constrained DB. Recomputes only on rows already being UPDATEd.
--
-- Weights (verified against prod source mix 2026-07-02; aggregators =
-- ohmyfantasy 6.2k rows + misterb 2.7k rows, both multi-brand resellers):
--   0.40  lgbti_relevance_score (default 0.3 when unscored)
--   0.25  quality_score / 100   (default 40 when unscored)
--   0.20  queer/trans-owned     (0.10 for any other ownership tag)
--   0.10  non-aggregator source
--   0.05  brand present
-- Changing weights = drop + re-add the column (seconds at ~22k rows).
-- ============================================================

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS boutique_score numeric GENERATED ALWAYS AS (
    0.40 * coalesce(lgbti_relevance_score, 0.3)
    + 0.25 * (coalesce(quality_score, 40)::numeric / 100.0)
    + CASE
        WHEN community_owned_tags && ARRAY['queer_owned','trans_owned'] THEN 0.20
        WHEN coalesce(array_length(community_owned_tags, 1), 0) > 0 THEN 0.10
        ELSE 0.0
      END
    + CASE WHEN source_type IN ('ohmyfantasy','misterb') THEN 0.0 ELSE 0.10 END
    + CASE WHEN brand IS NOT NULL AND btrim(brand) <> '' THEN 0.05 ELSE 0.0 END
  ) STORED;

-- brand_key: PostgREST-filterable normalized brand (the functional index on
-- marketplace_normalize_brand(brand) can't be hit from .eq() clauses).
-- Feeds the brand pages in the next phase.
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS brand_key text GENERATED ALWAYS AS (
    public.marketplace_normalize_brand(brand)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_boutique
  ON public.marketplace_listings (featured DESC, boutique_score DESC NULLS LAST)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_brand_key_col
  ON public.marketplace_listings (brand_key)
  WHERE brand_key IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE 'boutique_score + brand_key generated columns ready';
END $$;
