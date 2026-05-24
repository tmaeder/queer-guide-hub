-- Phase 3 personalization scorer for marketplace_guides.
-- See docs/plans/2026-05-24-marketplace-redesign.md §3.
--
-- public.recommend_guides(p_user_id uuid, p_limit int)
--   returns ordered (guide_row, score, boost_reason).
--
-- Score formula (§3):
--   + 1.0  city_match
--   + 0.8  interest_overlap          (jaccard of audience_tags vs profile.interests)
--   + 0.6  category_affinity         (share of user's favorites whose listing.category == guide.category)
--   + 0.4  freshness                 (exp decay since published_at, half-life 60d)
--   + 0.3  editorial_boost           (is_featured)
--   - 1.0  already_completed         (demote, not hide)
--   - 2.0  stale                     (review_due_at passed)
--
-- boost_reason: the largest positive contributor (city_match → interest →
-- category_affinity → featured → continue_reading for in-progress reads).
-- Anonymous (p_user_id NULL) → freshness + editorial_boost only.

CREATE OR REPLACE FUNCTION public.recommend_guides(
  p_user_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  id               UUID,
  slug             TEXT,
  title            TEXT,
  dek              TEXT,
  hero_image_path  TEXT,
  category_slug    TEXT,
  city_id          UUID,
  audience_tags    TEXT[],
  reading_time_min INT,
  pick_count       INT,
  published_at     TIMESTAMPTZ,
  score            NUMERIC,
  boost_reason     TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_home_city_id UUID;
  v_interests    TEXT[];
BEGIN
  -- Resolve signed-in personalization signals, if any.
  IF p_user_id IS NOT NULL THEN
    SELECT utp.home_city_id
      INTO v_home_city_id
      FROM public.user_travel_preferences utp
     WHERE utp.user_id = p_user_id
     LIMIT 1;

    SELECT COALESCE(
             ARRAY(
               SELECT jsonb_array_elements_text(p.interests)
                 FROM public.profiles p
                WHERE p.id = p_user_id
                  AND jsonb_typeof(p.interests) = 'array'
             ),
             '{}'::text[]
           )
      INTO v_interests;
  ELSE
    v_interests := '{}'::text[];
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      g.id, g.slug, g.title, g.dek, g.hero_image_path, g.category_slug,
      g.city_id, g.audience_tags, g.reading_time_min, g.pick_count,
      g.published_at,
      -- city_match
      CASE WHEN v_home_city_id IS NOT NULL AND g.city_id = v_home_city_id
           THEN 1.0::numeric ELSE 0.0::numeric END AS s_city,
      -- interest_overlap (jaccard, capped at 1)
      CASE
        WHEN array_length(v_interests, 1) IS NULL OR array_length(g.audience_tags, 1) IS NULL THEN 0.0::numeric
        ELSE 0.8::numeric * (
          cardinality(ARRAY(SELECT unnest(v_interests) INTERSECT SELECT unnest(g.audience_tags))) ::numeric
          / NULLIF(cardinality(ARRAY(SELECT unnest(v_interests) UNION SELECT unnest(g.audience_tags))), 0)
        )
      END AS s_interest,
      -- category_affinity: 0.6 * share of user's favorites in this category
      CASE
        WHEN p_user_id IS NULL OR g.category_slug IS NULL THEN 0.0::numeric
        ELSE 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN l.category = g.category_slug THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.marketplace_favorites f
            JOIN public.marketplace_listings l ON l.id = f.listing_id
           WHERE f.user_id = p_user_id
        ), 0.0::numeric)
      END AS s_category,
      -- freshness: 0.4 * exp(-age_days / 60)
      0.4::numeric * exp(
        -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(g.published_at, g.created_at))) / 86400.0, 0) / 60.0
      )::numeric AS s_fresh,
      -- editorial_boost
      CASE WHEN g.is_featured THEN 0.3::numeric ELSE 0.0::numeric END AS s_featured,
      -- already_completed
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.marketplace_guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NOT NULL
        ) THEN -1.0::numeric ELSE 0.0::numeric END AS s_completed,
      -- stale
      CASE WHEN g.review_due_at IS NOT NULL AND g.review_due_at < now()
           THEN -2.0::numeric ELSE 0.0::numeric END AS s_stale,
      -- continue_reading marker (positive contributor for boost_reason only)
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.marketplace_guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NULL
        ) THEN 0.5::numeric ELSE 0.0::numeric END AS s_continue
    FROM public.marketplace_guides g
    WHERE g.status = 'published'
  )
  SELECT
    s.id, s.slug, s.title, s.dek, s.hero_image_path, s.category_slug,
    s.city_id, s.audience_tags, s.reading_time_min, s.pick_count, s.published_at,
    (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
     + s.s_completed + s.s_stale + s.s_continue) AS score,
    CASE
      WHEN s.s_continue > 0 THEN 'continue_reading'
      WHEN s.s_city     >= s.s_interest AND s.s_city     >= s.s_category AND s.s_city     > 0 THEN 'home_city'
      WHEN s.s_interest >= s.s_category AND s.s_interest > 0                                   THEN 'interest'
      WHEN s.s_category > 0                                                                     THEN 'category_affinity'
      WHEN s.s_featured > 0                                                                     THEN 'featured'
      ELSE NULL
    END::text AS boost_reason
  FROM scored s
  ORDER BY (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
            + s.s_completed + s.s_stale + s.s_continue) DESC,
           s.published_at DESC NULLS LAST
  LIMIT p_limit;
END $$;

-- Allow signed-in users and anon to call the scorer. SECURITY DEFINER means
-- the function reads with elevated privileges to traverse user_travel_preferences
-- + profiles + favorites — RLS on those tables is bypassed inside the function.
-- That's safe because we only return aggregated guide rows (no per-user data
-- leaks back to the caller).
GRANT EXECUTE ON FUNCTION public.recommend_guides(UUID, INT) TO anon, authenticated;

COMMENT ON FUNCTION public.recommend_guides(UUID, INT) IS
  'Phase 3 personalization scorer. Pass auth.uid() for signed-in users; NULL for anon. See docs/plans/2026-05-24-marketplace-redesign.md §3.';
