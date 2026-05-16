-- Phase 6: Gamified /profile/footprint
-- Adds footprint_stats(p_user_id), footprint_return_nudge(p_user_id),
-- user_footprint_share_prefs table + RLS, public read RPC.

-- ---------------------------------------------------------------------------
-- 1. footprint_stats RPC
-- Returns a single row of aggregated stats for the dashboard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.footprint_stats(p_user_id UUID)
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
  WITH visited AS (
    SELECT pm.*
    FROM user_place_marks pm
    WHERE pm.user_id = p_user_id AND pm.mark_type = 'visited'
  ),
  visited_cities AS (
    SELECT DISTINCT city_id FROM visited WHERE city_id IS NOT NULL
  ),
  visited_countries AS (
    SELECT DISTINCT c.country_id
    FROM visited_cities vc
    JOIN cities c ON c.id = vc.city_id
    WHERE c.country_id IS NOT NULL
  ),
  visited_continents AS (
    SELECT DISTINCT co.continent_id
    FROM visited_countries vco
    JOIN countries co ON co.id = vco.country_id
    WHERE co.continent_id IS NOT NULL
  ),
  pride AS (
    SELECT COUNT(*)::BIGINT AS n
    FROM visited v
    JOIN events e ON e.id = v.entity_id
    WHERE v.entity_type = 'event' AND e.event_type ILIKE '%pride%'
  )
  SELECT
    (SELECT COUNT(*)::BIGINT FROM visited_countries),
    (SELECT COUNT(*)::BIGINT FROM countries),
    (SELECT COUNT(*)::BIGINT FROM visited_cities),
    (SELECT COUNT(*)::BIGINT FROM visited WHERE entity_type = 'venue'),
    (SELECT COUNT(*)::BIGINT FROM visited WHERE entity_type = 'event'),
    (SELECT COUNT(*)::BIGINT FROM visited WHERE entity_type = 'village'),
    (SELECT COUNT(*)::BIGINT FROM visited_continents),
    (SELECT n FROM pride);
$$;

GRANT EXECUTE ON FUNCTION public.footprint_stats(UUID) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. footprint_return_nudge RPC
-- Picks the user's most-visited city and reports how many new LGBTQ+ venues
-- have been added since their last visit there.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.footprint_return_nudge(p_user_id UUID)
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
  WITH city_visits AS (
    SELECT
      pm.city_id,
      COUNT(*)         AS visited_count,
      MAX(pm.marked_at) AS last_visited_at
    FROM user_place_marks pm
    WHERE pm.user_id = p_user_id
      AND pm.mark_type = 'visited'
      AND pm.city_id IS NOT NULL
    GROUP BY pm.city_id
    ORDER BY visited_count DESC, last_visited_at DESC
    LIMIT 1
  )
  SELECT
    cv.city_id,
    c.name,
    c.slug,
    cv.visited_count::BIGINT,
    cv.last_visited_at,
    (SELECT COUNT(*)::BIGINT
       FROM venues v
       WHERE v.city_id = cv.city_id
         AND v.created_at > cv.last_visited_at) AS new_venues
  FROM city_visits cv
  JOIN cities c ON c.id = cv.city_id;
$$;

GRANT EXECUTE ON FUNCTION public.footprint_return_nudge(UUID) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. user_footprint_share_prefs
-- Per-user opt-in flags controlling which tiles render on the public footprint.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_footprint_share_prefs (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_countries  BOOLEAN NOT NULL DEFAULT FALSE,
  share_cities     BOOLEAN NOT NULL DEFAULT FALSE,
  share_venues     BOOLEAN NOT NULL DEFAULT FALSE,
  share_events     BOOLEAN NOT NULL DEFAULT FALSE,
  share_villages   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_footprint_share_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share_prefs_select_any"
  ON user_footprint_share_prefs FOR SELECT
  USING (TRUE);

CREATE POLICY "share_prefs_insert_own"
  ON user_footprint_share_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "share_prefs_update_own"
  ON user_footprint_share_prefs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "share_prefs_delete_own"
  ON user_footprint_share_prefs FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT ON user_footprint_share_prefs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON user_footprint_share_prefs TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. footprint_public_stats RPC
-- Same as footprint_stats but masks tiles the user hasn't opted into.
-- Public; returns zeroes for opted-out kinds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.footprint_public_stats(p_user_id UUID)
RETURNS TABLE (
  countries_visited   BIGINT,
  total_countries     BIGINT,
  cities_visited      BIGINT,
  venues_visited      BIGINT,
  events_visited      BIGINT,
  villages_visited    BIGINT,
  continents_touched  BIGINT,
  pride_events        BIGINT,
  share_countries     BOOLEAN,
  share_cities        BOOLEAN,
  share_venues        BOOLEAN,
  share_events        BOOLEAN,
  share_villages      BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN COALESCE(p.share_countries, FALSE) THEN s.countries_visited ELSE 0 END,
    s.total_countries,
    CASE WHEN COALESCE(p.share_cities,    FALSE) THEN s.cities_visited    ELSE 0 END,
    CASE WHEN COALESCE(p.share_venues,    FALSE) THEN s.venues_visited    ELSE 0 END,
    CASE WHEN COALESCE(p.share_events,    FALSE) THEN s.events_visited    ELSE 0 END,
    CASE WHEN COALESCE(p.share_villages,  FALSE) THEN s.villages_visited  ELSE 0 END,
    CASE WHEN COALESCE(p.share_countries, FALSE) THEN s.continents_touched ELSE 0 END,
    CASE WHEN COALESCE(p.share_events,    FALSE) THEN s.pride_events      ELSE 0 END,
    COALESCE(p.share_countries, FALSE),
    COALESCE(p.share_cities,    FALSE),
    COALESCE(p.share_venues,    FALSE),
    COALESCE(p.share_events,    FALSE),
    COALESCE(p.share_villages,  FALSE)
  FROM footprint_stats(p_user_id) s
  LEFT JOIN user_footprint_share_prefs p ON p.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.footprint_public_stats(UUID) TO authenticated, anon;
