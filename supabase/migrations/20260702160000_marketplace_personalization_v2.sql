-- ============================================================
-- For You v2: real personalization seeds + SFW gate + reason labels
--
-- v1 (20260524320000) only seeded from wishlists/favorites — empty for
-- most users (cold start), so the rail fell back to views. v2 widens the
-- seeds: saved-listing tags ∪ followed tags (tag_follows) ∪ profile
-- interests (profiles.interests is JSONB — jsonb_array_elements_text,
-- never = ANY; and profiles joins by user_id, NOT id).
--
-- SFW gate: adult departments/ratings excluded unless p_include_adult
-- (the rail renders on mixed-audience surfaces).
--
-- Signature changes (new param) → DROP first so PostgREST named-arg calls
-- don't hit an ambiguous overload (42P13 lesson).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_personalized_marketplace_listings(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_personalized_marketplace_listings(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 12,
  p_include_adult BOOLEAN DEFAULT false
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
    SELECT wi.listing_id
      FROM wishlist_items wi
      JOIN wishlists w ON w.id = wi.wishlist_id
     WHERE w.user_id = p_user_id
    UNION
    SELECT mf.listing_id
      FROM marketplace_favorites mf
     WHERE mf.user_id = p_user_id
  ),
  saved_tags AS (
    SELECT DISTINCT uta.tag_id
      FROM unified_tag_assignments uta
     WHERE uta.entity_type = 'marketplace_listing'
       AND uta.entity_id IN (SELECT listing_id FROM seed_listings)
  ),
  followed_tags AS (
    SELECT tf.tag_id FROM tag_follows tf WHERE tf.user_id = p_user_id
  ),
  interest_tags AS (
    -- profiles.interests is a JSONB array of free-ish strings; match them
    -- against the tag vocabulary by slug or name.
    SELECT ut.id AS tag_id
      FROM profiles p
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p.interests) = 'array' THEN p.interests ELSE '[]'::jsonb END
      ) AS i(term)
      JOIN unified_tags ut
        ON ut.slug = lower(i.term) OR lower(ut.name) = lower(i.term)
     WHERE p.user_id = p_user_id
  ),
  seed_tags AS (
    SELECT tag_id, 'tag_overlap'::text AS src FROM saved_tags
    UNION ALL
    SELECT tag_id, 'follows' FROM followed_tags
    UNION ALL
    SELECT tag_id, 'interests' FROM interest_tags
  ),
  seed_tags_dedup AS (
    -- One row per tag; strongest provenance wins (saved > followed > interests).
    SELECT DISTINCT ON (tag_id) tag_id, src
    FROM seed_tags
    ORDER BY tag_id,
             CASE src WHEN 'tag_overlap' THEN 0 WHEN 'follows' THEN 1 ELSE 2 END
  ),
  candidates AS (
    SELECT
      l.id AS listing_id,
      COUNT(DISTINCT st.tag_id)::NUMERIC AS overlap,
      -- dominant provenance for the rail label
      (array_agg(st.src ORDER BY CASE st.src WHEN 'tag_overlap' THEN 0 WHEN 'follows' THEN 1 ELSE 2 END))[1] AS reason,
      COALESCE(l.boutique_score, 0)::NUMERIC AS boutique
    FROM marketplace_listings l
    JOIN unified_tag_assignments uta
      ON uta.entity_id = l.id AND uta.entity_type = 'marketplace_listing'
    JOIN seed_tags_dedup st ON st.tag_id = uta.tag_id
    WHERE l.status = 'active'
      AND l.id NOT IN (SELECT listing_id FROM seed_listings)
      AND (
        p_include_adult
        OR (
          l.content_rating IN ('sfw', 'suggestive')
          AND coalesce(l.department, '') NOT IN ('intimacy', 'bdsm_fetish')
        )
      )
    GROUP BY l.id, l.boutique_score
  )
  SELECT
    c.listing_id,
    (c.overlap * 1.0 + c.boutique * 2.0)::NUMERIC AS score,
    c.reason
  FROM candidates c
  ORDER BY score DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 12), 48));
$$;

GRANT EXECUTE ON FUNCTION
  public.get_personalized_marketplace_listings(UUID, INTEGER, BOOLEAN)
  TO authenticated;

DO $$ BEGIN
  RAISE NOTICE 'get_personalized_marketplace_listings v2: saved+follows+interests seeds, SFW gate, reasons';
END $$;
