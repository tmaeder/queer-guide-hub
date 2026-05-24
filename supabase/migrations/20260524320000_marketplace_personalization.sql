-- Marketplace personalization: tag-overlap ranking RPC.
--
-- A full embedding-based ranker (mean-of-favorited-tag-vectors + cosine
-- against listing tag vectors) belongs in a dedicated edge function and
-- lands in a later iteration. For the first cut we do the same shape of
-- thing in pure SQL: gather the user's recent favorited listings, count
-- how many tags they share with each candidate listing, weight by
-- quality + LGBTQ+ relevance, exclude already-favorited items. This is
-- cheap, transparent, and surfaces meaningful "more like what you save"
-- recommendations from day one.
--
-- Cold start: callers should fall back to the existing most_loved sort
-- when this function returns 0 rows.

CREATE OR REPLACE FUNCTION public.get_personalized_marketplace_listings(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  listing_id UUID,
  score NUMERIC,
  reason TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH seed_listings AS (
    -- User's saved listings, from wishlists or legacy favorites.
    SELECT wi.listing_id
      FROM wishlist_items wi
      JOIN wishlists w ON w.id = wi.wishlist_id
     WHERE w.user_id = p_user_id
    UNION
    SELECT mf.listing_id
      FROM marketplace_favorites mf
     WHERE mf.user_id = p_user_id
  ),
  seed_tags AS (
    -- Tag ids attached to those seed listings (via the unified taxonomy).
    SELECT DISTINCT uta.tag_id
      FROM unified_tag_assignments uta
     WHERE uta.entity_type = 'marketplace_listing'
       AND uta.entity_id IN (SELECT listing_id FROM seed_listings)
  ),
  candidates AS (
    -- Active listings that share at least one tag with a seed listing,
    -- excluding seed items themselves. Score = tag overlap count, lightly
    -- boosted by listing quality + LGBTQ+ relevance + recency.
    SELECT
      l.id AS listing_id,
      COUNT(DISTINCT uta.tag_id)::NUMERIC AS overlap,
      COALESCE(l.quality_score, 0)::NUMERIC AS quality,
      COALESCE(l.lgbti_relevance_score, 0)::NUMERIC AS relevance,
      EXTRACT(EPOCH FROM (now() - l.updated_at)) / 86400.0 AS days_old
    FROM marketplace_listings l
    JOIN unified_tag_assignments uta
      ON uta.entity_id = l.id AND uta.entity_type = 'marketplace_listing'
    WHERE l.status = 'active'
      AND uta.tag_id IN (SELECT tag_id FROM seed_tags)
      AND l.id NOT IN (SELECT listing_id FROM seed_listings)
    GROUP BY l.id, l.quality_score, l.lgbti_relevance_score, l.updated_at
  )
  SELECT
    c.listing_id,
    (c.overlap * 1.0
      + c.quality * 0.5
      + c.relevance * 1.5
      - LEAST(c.days_old, 365.0) * 0.005
    )::NUMERIC AS score,
    'tag_overlap'::TEXT AS reason
  FROM candidates c
  ORDER BY score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION
  public.get_personalized_marketplace_listings(UUID, INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.get_personalized_marketplace_listings(UUID, INTEGER) IS
  'Tag-overlap-based marketplace recommendations. Returns 0 rows when the user has no saved items so callers can fall back to popularity-based curation.';
