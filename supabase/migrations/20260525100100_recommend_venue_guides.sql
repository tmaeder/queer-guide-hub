-- Venue guides personalization scorer + reading-streak helper.
-- Mirrors public.recommend_guides for marketplace; signals adapted to venues.

CREATE OR REPLACE FUNCTION public.recommend_venue_guides(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID, slug TEXT, title TEXT, dek TEXT, hero_image_path TEXT,
  category TEXT, city_id UUID, audience_tags TEXT[],
  reading_time_min INT, pick_count INT, published_at TIMESTAMPTZ,
  score NUMERIC, boost_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_home_city_id UUID; v_interests TEXT[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT utp.home_city_id INTO v_home_city_id
      FROM public.user_travel_preferences utp WHERE utp.user_id = p_user_id LIMIT 1;
    SELECT COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(p.interests) FROM public.profiles p
                    WHERE p.id = p_user_id AND jsonb_typeof(p.interests) = 'array'),
             '{}'::text[])
      INTO v_interests;
  ELSE
    v_interests := '{}'::text[];
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      g.id, g.slug, g.title, g.dek, g.hero_image_path, g.category, g.city_id,
      g.audience_tags, g.reading_time_min, g.pick_count, g.published_at,
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
        ELSE 0.6::numeric * COALESCE((
          SELECT (SUM(CASE WHEN v.category = g.category THEN 1.0 ELSE 0.0 END)
                  / NULLIF(COUNT(*), 0))::numeric
            FROM public.venue_favorites f
            JOIN public.venues v ON v.id = f.venue_id
           WHERE f.user_id = p_user_id), 0.0::numeric)
      END AS s_category,
      0.4::numeric * exp(
        -GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(g.published_at, g.created_at))) / 86400.0, 0) / 60.0)::numeric AS s_fresh,
      CASE WHEN g.is_featured THEN 0.3::numeric ELSE 0.0::numeric END AS s_featured,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.venue_guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NOT NULL)
        THEN -1.0::numeric ELSE 0.0::numeric END AS s_completed,
      CASE WHEN g.review_due_at IS NOT NULL AND g.review_due_at < now()
           THEN -2.0::numeric ELSE 0.0::numeric END AS s_stale,
      CASE
        WHEN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.venue_guide_reads r
           WHERE r.user_id = p_user_id AND r.guide_id = g.id AND r.completed_at IS NULL)
        THEN 0.5::numeric ELSE 0.0::numeric END AS s_continue
    FROM public.venue_guides g
    WHERE g.status='published'
  )
  SELECT
    s.id, s.slug, s.title, s.dek, s.hero_image_path, s.category, s.city_id,
    s.audience_tags, s.reading_time_min, s.pick_count, s.published_at,
    (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured + s.s_completed + s.s_stale + s.s_continue) AS score,
    CASE
      WHEN s.s_continue > 0 THEN 'continue_reading'
      WHEN s.s_city >= s.s_interest AND s.s_city >= s.s_category AND s.s_city > 0 THEN 'home_city'
      WHEN s.s_interest >= s.s_category AND s.s_interest > 0 THEN 'interest'
      WHEN s.s_category > 0 THEN 'category_affinity'
      WHEN s.s_featured > 0 THEN 'featured'
      ELSE NULL
    END::text AS boost_reason
  FROM scored s
  ORDER BY (s.s_city + s.s_interest + s.s_category + s.s_fresh + s.s_featured + s.s_completed + s.s_stale + s.s_continue) DESC,
           s.published_at DESC NULLS LAST
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.recommend_venue_guides(UUID, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.venue_guide_reading_streak(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_streak INT := 0; v_week DATE; v_prev DATE;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  v_week := date_trunc('week', now())::date;
  FOR v_prev IN
    SELECT DISTINCT date_trunc('week', completed_at)::date AS wk
      FROM public.venue_guide_reads
     WHERE user_id = p_user_id AND completed_at IS NOT NULL
     ORDER BY wk DESC
  LOOP
    IF v_streak = 0 THEN
      IF v_prev = v_week OR v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := 1; v_week := v_prev;
      ELSE RETURN 0; END IF;
    ELSE
      IF v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := v_streak + 1; v_week := v_prev;
      ELSE EXIT; END IF;
    END IF;
  END LOOP;
  RETURN v_streak;
END $$;
GRANT EXECUTE ON FUNCTION public.venue_guide_reading_streak(UUID) TO authenticated;
