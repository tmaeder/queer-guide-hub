-- Surface per-venue check-in count on the ranked RPC output so list cards can
-- show "N check-ins" microcopy without a second roundtrip. Adds a LEFT JOIN to
-- the existing venue_checkin_stats view in the base CTE and drops the
-- "checkin_count" key onto each venue jsonb blob (it's already returned for
-- free by to_jsonb(r) once the column is part of the row).

CREATE OR REPLACE FUNCTION public.rpc_venues_ranked(
  p_user_id   uuid    DEFAULT NULL,
  p_lat       numeric DEFAULT NULL,
  p_lng       numeric DEFAULT NULL,
  p_filters   jsonb   DEFAULT '{}'::jsonb,
  p_sort      text    DEFAULT 'relevance',
  p_limit     int     DEFAULT 24,
  p_offset    int     DEFAULT 0
)
RETURNS TABLE (
  venue        jsonb,
  score        numeric,
  distance_m   numeric,
  total_count  bigint
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_prefs_categories  text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'categories'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_tags        text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'tags'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_groups      text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'target_groups'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_behavior_cats     text[] := CASE WHEN p_user_id IS NULL THEN ARRAY[]::text[] ELSE COALESCE(
    (SELECT ARRAY_AGG(category)
       FROM (
         SELECT v.category, COUNT(*) AS n
           FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
          WHERE c.user_id = p_user_id AND v.category IS NOT NULL
          GROUP BY v.category HAVING COUNT(*) >= 3
       ) t),
    ARRAY[]::text[]) END;

  v_q                 text := NULLIF(p_filters->>'search', '');
  v_category          text := NULLIF(p_filters->>'category', '');
  v_city              text := NULLIF(p_filters->>'city', '');
  v_radius_km         numeric := NULLIF(p_filters->>'radiusKm', '')::numeric;
  v_price             int     := NULLIF(p_filters->>'priceLevel', '')::int;
  v_tags              text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'tags')), ARRAY[]::text[]);
  v_amenities         text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'amenities')), ARRAY[]::text[]);
  v_services          text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'services')), ARRAY[]::text[]);
  v_access            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'accessibility')), ARRAY[]::text[]);
  v_groups            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'groups')), ARRAY[]::text[]);

  v_w_distance        numeric := CASE WHEN p_user_id IS NULL THEN 0.55 ELSE 0.35 END;
  v_w_interest        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.25 END;
  v_w_behavior        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.15 END;
  v_w_quality         numeric := CASE WHEN p_user_id IS NULL THEN 0.30 ELSE 0.15 END;
  v_w_recency         numeric := 0.10;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT v.*,
           (CASE
             WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
              AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
               6371000 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((v.latitude - p_lat) / 2)), 2) +
                 COS(RADIANS(p_lat)) * COS(RADIANS(v.latitude)) *
                 POWER(SIN(RADIANS((v.longitude - p_lng) / 2)), 2)
               ))
             ELSE NULL
           END)::numeric AS dist_m,
           COALESCE(s.total_checkins, 0)::int AS checkin_count
      FROM public.venues v
      LEFT JOIN public.venue_checkin_stats s ON s.venue_id = v.id
     WHERE v.data_source IS DISTINCT FROM 'refuge-restrooms'
       AND v.duplicate_of_id IS NULL
       AND (v_q IS NULL OR
            v.name ILIKE '%' || v_q || '%' OR
            COALESCE(v.description, '') ILIKE '%' || v_q || '%' OR
            COALESCE(v.address, '') ILIKE '%' || v_q || '%')
       AND (v_category IS NULL OR v.category = v_category)
       AND (v_city IS NULL OR v.city ILIKE '%' || v_city || '%')
       AND (array_length(v_tags, 1) IS NULL OR v.tags && v_tags)
       AND (array_length(v_amenities, 1) IS NULL OR v.amenities && v_amenities)
       AND (array_length(v_services, 1) IS NULL OR v.services && v_services)
       AND (array_length(v_access, 1) IS NULL OR v.accessibility_attributes && v_access)
       AND (array_length(v_groups, 1) IS NULL OR v.target_groups && v_groups)
       AND (v_price IS NULL OR v.price_range = v_price)
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (v_radius_km IS NULL OR b.dist_m IS NULL OR b.dist_m <= v_radius_km * 1000)
  ),
  scored AS (
    SELECT
      f.*,
      (CASE WHEN f.dist_m IS NULL THEN 0.3 ELSE EXP(- POWER(f.dist_m / 30000.0, 2)) END)::numeric AS s_distance,
      LEAST(1.0::numeric,
        (CASE WHEN array_length(v_prefs_categories, 1) > 0 AND f.category = ANY(v_prefs_categories) THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_tags, 1) > 0 AND f.tags && v_prefs_tags THEN 0.3 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_groups, 1) > 0 AND f.target_groups && v_prefs_groups THEN 0.2 ELSE 0 END)::numeric
      ) AS s_interest,
      (CASE WHEN array_length(v_behavior_cats, 1) > 0 AND f.category = ANY(v_behavior_cats) THEN 1.0 ELSE 0.0 END)::numeric AS s_behavior,
      LEAST(1.0::numeric,
        (CASE WHEN f.is_featured THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN f.verified THEN 0.3 ELSE 0 END)::numeric
      + 0.2::numeric
      ) AS s_quality,
      GREATEST(0.0::numeric, 1.0::numeric - (LN(GREATEST(1, EXTRACT(DAY FROM (now() - f.created_at))::int)) / LN(365))::numeric) AS s_recency
      FROM filtered f
  ),
  ranked AS (
    SELECT
      s.*,
      ( v_w_distance * s.s_distance
      + v_w_interest * s.s_interest
      + v_w_behavior * s.s_behavior
      + v_w_quality  * s.s_quality
      + v_w_recency  * s.s_recency )::numeric AS relevance,
      (COUNT(*) OVER ())::bigint AS total
      FROM scored s
  )
  SELECT
    to_jsonb(r) - 's_distance' - 's_interest' - 's_behavior'
                - 's_quality' - 's_recency' - 'relevance' - 'total' - 'dist_m' AS venue,
    r.relevance,
    r.dist_m,
    r.total
    FROM ranked r
   ORDER BY
     CASE WHEN p_sort = 'name'       THEN r.name      END ASC NULLS LAST,
     CASE WHEN p_sort = 'category'   THEN r.category  END ASC NULLS LAST,
     CASE WHEN p_sort = 'city'       THEN r.city      END ASC NULLS LAST,
     CASE WHEN p_sort = 'created_at' THEN r.created_at END DESC NULLS LAST,
     CASE WHEN p_sort = 'featured'   THEN r.is_featured::int END DESC,
     CASE WHEN p_sort = 'nearest'    THEN r.dist_m    END ASC NULLS LAST,
     CASE WHEN p_sort = 'relevance'  THEN r.relevance END DESC NULLS LAST,
     r.relevance DESC NULLS LAST,
     r.id ASC
   LIMIT p_limit OFFSET p_offset;
END
$$;

GRANT EXECUTE ON FUNCTION public.rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, int, int)
  TO anon, authenticated;
