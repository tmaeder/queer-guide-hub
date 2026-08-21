-- Security fix: IDOR on footprint_stats/footprint_return_nudge/guides_recommend.
--
-- All three are SECURITY DEFINER, granted to anon/authenticated, and take a
-- caller-supplied p_user_id with no check that it matches the caller's own
-- auth.uid(). Given any user's UUID:
--   - footprint_stats / footprint_return_nudge leak that user's most-visited
--     city, visit count and last-visit date, bypassing the opt-in privacy
--     flags (user_footprint_share_prefs) the SAME migration built specifically
--     to gate this — footprint_public_stats is the intended consent-gated
--     wrapper, but the unmasked function it wraps was independently reachable.
--   - guides_recommend leaks home-city match, interest overlap, and whether a
--     specific guide is in-progress/completed for that user.

-- ---------------------------------------------------------------------------
-- 1. footprint_stats / footprint_return_nudge: make them self-or-admin-only
--    for CLIENT calls, while footprint_public_stats keeps working.
--
-- footprint_public_stats legitimately calls footprint_stats(<some other
-- user's id>) internally to view someone else's OPTED-IN public footprint —
-- so an ownership check inside footprint_stats itself would break that
-- feature (auth.uid() is the real viewer regardless of which function called
-- it). Instead: revoke direct client EXECUTE on the raw functions (a
-- SECURITY DEFINER caller — footprint_public_stats — still reaches them via
-- owner-privilege elevation, unaffected by this revoke, same pattern as this
-- schema's merge-core functions) and add zero-arg "_self" wrappers for the
-- one legitimate direct use: a user's own dashboard.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.footprint_stats(UUID) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.footprint_stats(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.footprint_return_nudge(UUID) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.footprint_return_nudge(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.footprint_stats_self()
RETURNS TABLE (
  countries_visited      BIGINT,
  total_countries        BIGINT,
  cities_visited         BIGINT,
  venues_visited         BIGINT,
  events_visited         BIGINT,
  villages_visited       BIGINT,
  continents_touched     BIGINT,
  pride_events           BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.footprint_stats(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.footprint_stats_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.footprint_return_nudge_self()
RETURNS TABLE (
  city_id          UUID,
  city_name        TEXT,
  city_slug        TEXT,
  visited_count    BIGINT,
  last_visited_at  TIMESTAMPTZ,
  new_venues       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.footprint_return_nudge(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.footprint_return_nudge_self() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. guides_recommend: unlike footprint, there is no legitimate "view someone
--    else's recommendations" case — the frontend only ever passes the
--    caller's own id (or null when signed out). So the fix is simpler: ignore
--    whatever the client passed and derive it server-side from the session.
--    No signature change, no frontend change needed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guides_recommend(
  p_user_id  UUID,
  p_limit    INT DEFAULT 10,
  p_format   TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, format TEXT, slug TEXT, title TEXT, dek TEXT, hero_image_path TEXT,
  category TEXT, primary_entity_type TEXT, city_id UUID, audience_tags TEXT[],
  reading_time_min INT, pick_count INT, published_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  score NUMERIC, boost_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_home_city_id UUID; v_interests TEXT[];
BEGIN
  -- IDOR fix: p_user_id is caller-supplied and previously trusted as-is,
  -- letting anyone pass any other user's UUID to read their personalization
  -- signals. There is no legitimate cross-user use of this parameter, so it
  -- is overridden with the verified session identity (NULL when signed out,
  -- matching the anon path's existing behavior).
  p_user_id := auth.uid();

  IF p_user_id IS NOT NULL THEN
    SELECT utp.home_city_id INTO v_home_city_id
      FROM public.user_travel_preferences utp WHERE utp.user_id = p_user_id LIMIT 1;
    SELECT COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(p.interests) FROM public.profiles p
                    WHERE p.user_id = p_user_id AND jsonb_typeof(p.interests) = 'array'),
             '{}'::text[])
      INTO v_interests;
  ELSE
    v_interests := '{}'::text[];
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      g.id, g.format, g.slug, g.title, g.dek, g.hero_image_path, g.category,
      g.primary_entity_type, g.city_id, g.audience_tags, g.reading_time_min,
      g.pick_count, g.published_at, g.starts_at, g.ends_at,
      CASE WHEN v_home_city_id IS NOT NULL AND g.city_id = v_home_city_id
           THEN 1.0::numeric ELSE 0.0::numeric END AS s_city,
      CASE
        WHEN array_length(v_interests,1) IS NULL OR array_length(g.audience_tags,1) IS NULL THEN 0.0::numeric
        ELSE 0.8::numeric * (
          cardinality(ARRAY(SELECT unnest(v_interests) INTERSECT SELECT unnest(g.audience_tags)))::numeric
          / NULLIF(cardinality(ARRAY(SELECT unnest(v_interests) UNION SELECT unnest(g.audience_tags))), 0))
      END AS s_interest,
      CASE
        WHEN p_user_id IS NULL OR g.category IS NULL THEN 0.0::numeric
        WHEN g.primary_entity_type = 'marketplace' THEN 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN l.category = g.category THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.marketplace_favorites f
            JOIN public.marketplace_listings l ON l.id = f.listing_id
           WHERE f.user_id = p_user_id), 0.0::numeric)
        WHEN g.primary_entity_type = 'venue' THEN 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN v.category = g.category THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.venue_favorites f
            JOIN public.venues v ON v.id = f.venue_id
           WHERE f.user_id = p_user_id), 0.0::numeric)
        ELSE 0.0::numeric
      END AS s_category,
      0.4::numeric * exp(
        -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(g.published_at, g.created_at))) / 86400.0, 0) / 60.0)::numeric AS s_fresh,
      CASE WHEN g.is_featured THEN 0.3::numeric ELSE 0.0::numeric END AS s_featured,
      CASE WHEN g.format = 'quest' AND g.starts_at IS NOT NULL AND g.ends_at IS NOT NULL
                AND now() BETWEEN g.starts_at AND g.ends_at
           THEN 0.6::numeric ELSE 0.0::numeric END AS s_quest_active,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NOT NULL)
        THEN -1.0::numeric ELSE 0.0::numeric END AS s_completed,
      CASE WHEN g.review_due_at IS NOT NULL AND g.review_due_at < now()
           THEN -2.0::numeric ELSE 0.0::numeric END AS s_stale,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NULL)
        THEN 0.5::numeric ELSE 0.0::numeric END AS s_continue
    FROM public.guides g
    WHERE g.status = 'published'
      AND (p_format IS NULL OR g.format = p_format)
      AND (p_category IS NULL OR g.category = p_category)
      AND (p_user_id IS NOT NULL OR NOT g.safety_gated)
      AND NOT (g.format = 'quest' AND g.ends_at IS NOT NULL AND g.ends_at < now())
  )
  SELECT
    s.id, s.format, s.slug, s.title, s.dek, s.hero_image_path, s.category,
    s.primary_entity_type, s.city_id, s.audience_tags, s.reading_time_min,
    s.pick_count, s.published_at, s.starts_at, s.ends_at,
    (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
     + s.s_quest_active + s.s_completed + s.s_stale + s.s_continue) AS score,
    CASE
      WHEN s.s_continue > 0 THEN 'continue_reading'
      WHEN s.s_quest_active > 0 THEN 'active_quest'
      WHEN s.s_city >= s.s_interest AND s.s_city >= s.s_category AND s.s_city > 0 THEN 'home_city'
      WHEN s.s_interest >= s.s_category AND s.s_interest > 0 THEN 'interest'
      WHEN s.s_category > 0 THEN 'category_affinity'
      WHEN s.s_featured > 0 THEN 'featured'
      ELSE NULL
    END::text AS boost_reason
  FROM scored s
  ORDER BY (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured
            + s.s_quest_active + s.s_completed + s.s_stale + s.s_continue) DESC,
           s.published_at DESC NULLS LAST
  LIMIT p_limit;
END $$;
