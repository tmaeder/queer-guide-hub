-- Phase 5+ — Local Supporter score per (user, city).
-- See docs/plans/2026-05-24-marketplace-redesign.md §5.
--
-- A user earns points by supporting queer-owned biz in a specific city:
--   +5  per favorited queer-owned listing whose venue is in city
--   +2  per completed guide pick (marketplace_guide_reads.completed_at)
--       for a guide pick whose listing.venue.city = city
--   +10 per marketplace_review whose listing.venue.city = city
--   -1  per week since the user's most-recent activity in that city
--   capped to [0, 100]
--
-- A listing's "queer-owned" status comes from community_owned_tags @>
-- ARRAY['queer_owned'] (Phase 1 column). A listing's city comes from its
-- venue join — online-only products have no venue and don't contribute,
-- which is correct: "support queer-owned LOCAL biz" is the framing.

CREATE OR REPLACE FUNCTION public.local_supporter_score(
  p_user_id UUID,
  p_city_id UUID
)
RETURNS TABLE (
  score          INT,
  tier           TEXT,
  favorites      INT,
  guide_reads    INT,
  reviews        INT,
  weeks_decay    INT,
  last_active_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fav     INT := 0;
  v_reads   INT := 0;
  v_reviews INT := 0;
  v_last    TIMESTAMPTZ;
  v_weeks   INT := 0;
  v_raw     INT;
  v_final   INT;
  v_tier    TEXT;
BEGIN
  IF p_user_id IS NULL OR p_city_id IS NULL THEN
    score := 0; tier := 'Visitor'; favorites := 0; guide_reads := 0;
    reviews := 0; weeks_decay := 0; last_active_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_fav
    FROM marketplace_favorites f
    JOIN marketplace_listings l ON l.id = f.listing_id
    JOIN venues v ON v.id = l.venue_id
   WHERE f.user_id = p_user_id
     AND v.city_id = p_city_id
     AND l.community_owned_tags @> ARRAY['queer_owned']::text[];

  SELECT COUNT(*) INTO v_reads
    FROM marketplace_guide_reads r
    JOIN marketplace_guide_picks p ON p.guide_id = r.guide_id
    JOIN marketplace_listings    l ON l.id      = p.listing_id
    JOIN venues                  v ON v.id      = l.venue_id
   WHERE r.user_id = p_user_id
     AND r.completed_at IS NOT NULL
     AND v.city_id = p_city_id;

  SELECT COUNT(*) INTO v_reviews
    FROM marketplace_reviews rv
    JOIN marketplace_listings l ON l.id = rv.listing_id
    JOIN venues               v ON v.id = l.venue_id
   WHERE rv.user_id = p_user_id
     AND v.city_id  = p_city_id;

  -- Most-recent activity timestamp in this city, across all 3 sources.
  SELECT GREATEST(
           COALESCE((SELECT MAX(f.created_at) FROM marketplace_favorites f
                       JOIN marketplace_listings l ON l.id = f.listing_id
                       JOIN venues v ON v.id = l.venue_id
                      WHERE f.user_id = p_user_id
                        AND v.city_id = p_city_id), 'epoch'::timestamptz),
           COALESCE((SELECT MAX(r.completed_at) FROM marketplace_guide_reads r
                       JOIN marketplace_guide_picks p ON p.guide_id = r.guide_id
                       JOIN marketplace_listings l ON l.id = p.listing_id
                       JOIN venues v ON v.id = l.venue_id
                      WHERE r.user_id = p_user_id
                        AND r.completed_at IS NOT NULL
                        AND v.city_id = p_city_id), 'epoch'::timestamptz),
           COALESCE((SELECT MAX(rv.created_at) FROM marketplace_reviews rv
                       JOIN marketplace_listings l ON l.id = rv.listing_id
                       JOIN venues v ON v.id = l.venue_id
                      WHERE rv.user_id = p_user_id
                        AND v.city_id = p_city_id), 'epoch'::timestamptz)
         )
    INTO v_last;
  IF v_last = 'epoch'::timestamptz THEN v_last := NULL; END IF;

  IF v_last IS NOT NULL THEN
    v_weeks := GREATEST(0,
      FLOOR(EXTRACT(EPOCH FROM (now() - v_last)) / 604800.0)::INT
    );
  END IF;

  v_raw := (v_fav * 5) + (v_reads * 2) + (v_reviews * 10) - v_weeks;
  v_final := GREATEST(0, LEAST(100, v_raw));

  v_tier := CASE
              WHEN v_final >= 75 THEN 'Champion'
              WHEN v_final >= 40 THEN 'Local Supporter'
              WHEN v_final >= 15 THEN 'Local'
              ELSE 'Visitor'
            END;

  score := v_final;
  tier := v_tier;
  favorites := v_fav;
  guide_reads := v_reads;
  reviews := v_reviews;
  weeks_decay := v_weeks;
  last_active_at := v_last;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.local_supporter_score(UUID, UUID) TO authenticated;
COMMENT ON FUNCTION public.local_supporter_score(UUID, UUID) IS
  'Phase 5 Local Supporter score for a user × city. See docs/plans/2026-05-24-marketplace-redesign.md §5.';

-- Companion: every city in which the user has any positive activity,
-- used to populate /marketplace/missions without a city pre-selection.
CREATE OR REPLACE FUNCTION public.user_local_supporter_cities(p_user_id UUID)
RETURNS TABLE (
  city_id   UUID,
  city_name TEXT,
  score     INT,
  tier      TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- Distinct cities where the user has any qualifying activity.
  FOR r IN
    SELECT DISTINCT v.city_id AS c, c.name AS n
      FROM venues v
      JOIN cities c ON c.id = v.city_id
     WHERE v.city_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM marketplace_favorites f
           JOIN marketplace_listings l ON l.id = f.listing_id
          WHERE f.user_id = p_user_id AND l.venue_id = v.id
            AND l.community_owned_tags @> ARRAY['queer_owned']::text[]
         UNION
         SELECT 1 FROM marketplace_reviews rv
           JOIN marketplace_listings l ON l.id = rv.listing_id
          WHERE rv.user_id = p_user_id AND l.venue_id = v.id
         UNION
         SELECT 1 FROM marketplace_guide_reads gr
           JOIN marketplace_guide_picks gp ON gp.guide_id = gr.guide_id
           JOIN marketplace_listings   gl ON gl.id      = gp.listing_id
          WHERE gr.user_id = p_user_id
            AND gr.completed_at IS NOT NULL
            AND gl.venue_id = v.id
       )
  LOOP
    city_id := r.c;
    city_name := r.n;
    SELECT s.score, s.tier
      INTO score, tier
      FROM public.local_supporter_score(p_user_id, r.c) s;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.user_local_supporter_cities(UUID) TO authenticated;
COMMENT ON FUNCTION public.user_local_supporter_cities(UUID) IS
  'All cities in which a user has a Local Supporter score > 0. Phase 5.';
