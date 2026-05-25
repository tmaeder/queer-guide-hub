-- Trip Suggest Foundation (Phase 1 of editorial + travel redesign)
-- Lays the data substrate the four auto-suggest mechanics need:
--   A. Destination suggestions (recommendation-engine signal extensions live in code)
--   B. Itinerary auto-generation (itinerary-drafter edge function — needs cache + rate limit + day-part tags)
--   C. Smart trip completion (detect_trip_gaps RPC — needs day-part tags)
--   D. Cross-trip inspiration (get_similar_trip_suggestions RPC — needs materialized view)
--
-- Additive only. No destructive changes.

-- ============================================================
-- 1. Venues: day_part + vibe_tags for gap detection and itinerary slot-filling
-- ============================================================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS day_part  TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibe_tags TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_venues_day_part_gin  ON public.venues USING GIN (day_part);
CREATE INDEX IF NOT EXISTS idx_venues_vibe_tags_gin ON public.venues USING GIN (vibe_tags);

COMMENT ON COLUMN public.venues.day_part  IS 'When the venue is typically best visited. Subset of {morning, afternoon, evening, night}. Used by detect_trip_gaps and itinerary-drafter.';
COMMENT ON COLUMN public.venues.vibe_tags IS 'Soft preference tags (e.g. sober-friendly, family-friendly, queer-women-led, dancefloor, quiet, leather). Filterable from user prefs.';

-- Default backfill from category. Conservative; pipeline-enrich-venue will refine.
UPDATE public.venues SET day_part = '{morning,afternoon}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}') AND category IN ('cafe','coffee','breakfast','brunch','bakery');
UPDATE public.venues SET day_part = '{afternoon,evening}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}') AND category IN ('restaurant','dining','lunch','dinner','food');
UPDATE public.venues SET day_part = '{evening,night}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}') AND category IN ('bar','pub','wine_bar','cocktail','lounge');
UPDATE public.venues SET day_part = '{night}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}') AND category IN ('club','nightclub','dance','late_night','cruising','sex_club');
UPDATE public.venues SET day_part = '{morning,afternoon,evening,night}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}') AND category IN ('accommodation','hotel','hostel');
UPDATE public.venues SET day_part = '{morning,afternoon}'::TEXT[]
  WHERE (day_part IS NULL OR day_part = '{}');

-- ============================================================
-- 2. city_climate_monthly — seasonality signal source
-- ============================================================
CREATE TABLE IF NOT EXISTS public.city_climate_monthly (
  city_id      UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  avg_high_c   NUMERIC(4,1),
  avg_low_c    NUMERIC(4,1),
  precip_mm    NUMERIC(6,1),
  source       TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (city_id, month)
);

ALTER TABLE public.city_climate_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY city_climate_monthly_select ON public.city_climate_monthly FOR SELECT USING (true);

GRANT SELECT ON public.city_climate_monthly TO anon, authenticated;

COMMENT ON TABLE public.city_climate_monthly IS 'Per-city monthly climate normals. Source from pipeline-enrich-city. Feeds the seasonality_match signal in recommendation-engine.';

-- ============================================================
-- 3. llm_call_log — shared LLM rate-limiter substrate
-- ============================================================
CREATE TABLE IF NOT EXISTS public.llm_call_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  function    TEXT NOT NULL,
  context_key TEXT,
  called_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cost_usd    NUMERIC(8,5),
  model       TEXT,
  tokens_in   INT,
  tokens_out  INT
);

CREATE INDEX IF NOT EXISTS idx_llm_call_log_user_fn_time ON public.llm_call_log(user_id, function, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_ctx_time     ON public.llm_call_log(context_key, called_at DESC) WHERE context_key IS NOT NULL;

ALTER TABLE public.llm_call_log ENABLE ROW LEVEL SECURITY;
-- service role only; no user-facing policy.

COMMENT ON TABLE public.llm_call_log IS 'Per-call audit of LLM-using edge functions. Used to enforce per-user / per-context rate limits (itinerary-drafter: 5/day, 1/trip/10min; trip-gap-suggest, etc.).';

-- ============================================================
-- 4. itinerary_draft_cache — itinerary-drafter snapshot cache
-- ============================================================
CREATE TABLE IF NOT EXISTS public.itinerary_draft_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash TEXT NOT NULL UNIQUE,
  trip_id       UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  destination_ids UUID[] NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  preferences   JSONB NOT NULL DEFAULT '{}'::JSONB,
  draft         JSONB NOT NULL,
  model         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_itinerary_draft_cache_hash    ON public.itinerary_draft_cache(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_itinerary_draft_cache_trip    ON public.itinerary_draft_cache(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itinerary_draft_cache_expires ON public.itinerary_draft_cache(expires_at);

ALTER TABLE public.itinerary_draft_cache ENABLE ROW LEVEL SECURITY;
-- service role only.

COMMENT ON TABLE public.itinerary_draft_cache IS 'Caches itinerary-drafter LLM output keyed by sha256(destination_ids + dates + preferences + content_freshness_bucket). 24h TTL. Pattern mirrors packing_suggestion_cache.';

-- ============================================================
-- 5. mv_trip_similarity_inputs — substrate for cross-trip inspiration (mechanic D)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_trip_similarity_inputs AS
SELECT
  t.id AS trip_id,
  t.owner_id,
  t.primary_country_id,
  t.primary_country_code,
  COALESCE(
    (SELECT array_agg(DISTINCT d.city_id) FILTER (WHERE d.city_id IS NOT NULL)
       FROM public.trip_destinations d WHERE d.trip_id = t.id),
    ARRAY[t.primary_city_id]
  ) AS city_ids,
  CASE
    WHEN t.start_date IS NULL THEN NULL
    WHEN extract(month FROM t.start_date) BETWEEN 1 AND 3  THEN 'Q1'
    WHEN extract(month FROM t.start_date) BETWEEN 4 AND 6  THEN 'Q2'
    WHEN extract(month FROM t.start_date) BETWEEN 7 AND 9  THEN 'Q3'
    ELSE 'Q4'
  END AS season,
  CASE
    WHEN t.start_date IS NULL OR t.end_date IS NULL THEN NULL
    ELSE (t.end_date - t.start_date + 1)
  END AS duration_days,
  t.start_date,
  t.end_date
FROM public.trips t
WHERE t.status IN ('planning','active','completed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trip_similarity_trip
  ON public.mv_trip_similarity_inputs(trip_id);
CREATE INDEX IF NOT EXISTS idx_mv_trip_similarity_bucket
  ON public.mv_trip_similarity_inputs(primary_country_code, season, duration_days);
CREATE INDEX IF NOT EXISTS idx_mv_trip_similarity_cities_gin
  ON public.mv_trip_similarity_inputs USING GIN (city_ids);

COMMENT ON MATERIALIZED VIEW public.mv_trip_similarity_inputs IS 'Trip-shape fingerprint for cross-trip collab filtering. Refreshed nightly. Joined with trip_places by get_similar_trip_suggestions().';

-- ============================================================
-- 6. detect_trip_gaps — rule-based gap detection (no LLM)
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_trip_gaps(p_trip_id UUID)
RETURNS TABLE (
  trip_day_id UUID,
  date        DATE,
  day_part    TEXT,
  reason      TEXT
) AS $$
  WITH parts(part) AS (
    VALUES ('morning'),('afternoon'),('evening'),('night')
  ),
  filled AS (
    SELECT td.id AS trip_day_id, td.date,
           CASE
             WHEN tp.start_time IS NULL THEN NULL
             WHEN tp.start_time <  TIME '11:00' THEN 'morning'
             WHEN tp.start_time <  TIME '17:00' THEN 'afternoon'
             WHEN tp.start_time <  TIME '21:00' THEN 'evening'
             ELSE 'night'
           END AS slot
      FROM public.trip_days td
      LEFT JOIN public.trip_places tp ON tp.day_id = td.id
     WHERE td.trip_id = p_trip_id
  ),
  occupancy AS (
    SELECT trip_day_id, date, slot
      FROM filled
     WHERE slot IS NOT NULL
     GROUP BY trip_day_id, date, slot
  )
  SELECT td.id            AS trip_day_id,
         td.date,
         p.part           AS day_part,
         CASE p.part
           WHEN 'morning'   THEN 'No morning plan'
           WHEN 'afternoon' THEN 'Afternoon is open'
           WHEN 'evening'   THEN 'Evening is open'
           ELSE 'Nothing scheduled for the night'
         END AS reason
    FROM public.trip_days td
    CROSS JOIN parts p
   WHERE td.trip_id = p_trip_id
     AND NOT EXISTS (
       SELECT 1 FROM occupancy o
        WHERE o.trip_day_id = td.id AND o.slot = p.part
     )
   ORDER BY td.date, array_position(ARRAY['morning','afternoon','evening','night'], p.part);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.detect_trip_gaps(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_trip_gaps(UUID) TO authenticated;

COMMENT ON FUNCTION public.detect_trip_gaps(UUID) IS 'Returns one row per (day, day_part) without a scheduled trip_place. Pure-SQL rule layer; LLM-ranked fills come from trip-gap-suggest edge function.';

-- ============================================================
-- 7. get_similar_trip_suggestions — cross-trip inspiration RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_similar_trip_suggestions(p_trip_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  entity_type TEXT,
  entity_id   UUID,
  weight      BIGINT,
  trips_count BIGINT
) AS $$
  WITH me AS (
    SELECT trip_id, primary_country_code, season, duration_days, city_ids
      FROM public.mv_trip_similarity_inputs
     WHERE trip_id = p_trip_id
  ),
  peers AS (
    SELECT s.trip_id
      FROM public.mv_trip_similarity_inputs s, me
     WHERE s.trip_id <> me.trip_id
       AND (
         -- same country + season bucket + similar length
         (s.primary_country_code = me.primary_country_code
          AND s.season = me.season
          AND abs(COALESCE(s.duration_days, 0) - COALESCE(me.duration_days, 0)) <= 2)
         OR
         -- meaningful city overlap (Jaccard proxy: ≥ 1 shared city in trips of similar size)
         (s.city_ids && me.city_ids
          AND cardinality(s.city_ids) BETWEEN GREATEST(1, cardinality(me.city_ids) - 2)
                                          AND cardinality(me.city_ids) + 2)
       )
  ),
  my_places AS (
    SELECT venue_id, event_id, hotel_id FROM public.trip_places WHERE trip_id = p_trip_id
  ),
  agg AS (
    SELECT 'venue'::TEXT AS entity_type, tp.venue_id AS entity_id,
           count(*)::BIGINT AS weight, count(DISTINCT tp.trip_id)::BIGINT AS trips_count
      FROM public.trip_places tp
      JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.venue_id IS NOT NULL
       AND tp.venue_id NOT IN (SELECT venue_id FROM my_places WHERE venue_id IS NOT NULL)
     GROUP BY tp.venue_id
    UNION ALL
    SELECT 'event'::TEXT, tp.event_id,
           count(*)::BIGINT, count(DISTINCT tp.trip_id)::BIGINT
      FROM public.trip_places tp
      JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.event_id IS NOT NULL
       AND tp.event_id NOT IN (SELECT event_id FROM my_places WHERE event_id IS NOT NULL)
     GROUP BY tp.event_id
    UNION ALL
    SELECT 'hotel'::TEXT, tp.hotel_id,
           count(*)::BIGINT, count(DISTINCT tp.trip_id)::BIGINT
      FROM public.trip_places tp
      JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.hotel_id IS NOT NULL
       AND tp.hotel_id NOT IN (SELECT hotel_id FROM my_places WHERE hotel_id IS NOT NULL)
     GROUP BY tp.hotel_id
  )
  SELECT entity_type, entity_id, weight, trips_count
    FROM agg
   ORDER BY weight DESC, trips_count DESC
   LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_similar_trip_suggestions(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_trip_suggestions(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_similar_trip_suggestions(UUID, INT) IS 'Cross-trip collab filtering. Finds peer trips by country+season+duration OR by city overlap, aggregates their venues/events/hotels, excludes anything already on the requesting trip. Cold-start (no peers) handled in calling edge function.';
