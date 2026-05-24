-- /venues v2: personalization + gamification foundation.
--
-- 1. profiles.discovery_profile JSONB (interest signals for ranking)
-- 2. user_gamification (points / level / streak / totals per user)
-- 3. achievements + user_achievements (badge catalog and unlocks)
-- 4. Trigger on venue_checkins → award points, evolve streak, unlock badges
-- 5. Materialized views venue_leaderboard_city / _global
-- 6. RPC rpc_venues_ranked(user_id, lat, lng, filters, sort, limit, offset)
--    returning a personalized + filterable venues list with a relevance score
--
-- All RLS aligned with existing patterns (auth.uid() ownership; public read for
-- achievements catalog; public read for user_gamification public fields).

-- ---------------------------------------------------------------------------
-- 1. profiles.discovery_profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discovery_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS profiles_discovery_categories_idx
  ON public.profiles USING gin ((discovery_profile -> 'categories'));
CREATE INDEX IF NOT EXISTS profiles_discovery_tags_idx
  ON public.profiles USING gin ((discovery_profile -> 'tags'));
CREATE INDEX IF NOT EXISTS profiles_discovery_groups_idx
  ON public.profiles USING gin ((discovery_profile -> 'target_groups'));

-- ---------------------------------------------------------------------------
-- 2. Gamification tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_gamification (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points             integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  level              integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  current_streak     integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak     integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_checkin_date  date,
  total_checkins     integer NOT NULL DEFAULT 0 CHECK (total_checkins >= 0),
  total_venues       integer NOT NULL DEFAULT 0 CHECK (total_venues >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gamification_self_select ON public.user_gamification;
CREATE POLICY gamification_self_select ON public.user_gamification
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS gamification_public_select ON public.user_gamification;
CREATE POLICY gamification_public_select ON public.user_gamification
  FOR SELECT TO anon, authenticated
  USING (true); -- leaderboards need cross-user reads; rows contain no PII

CREATE TABLE IF NOT EXISTS public.achievements (
  slug           text PRIMARY KEY,
  name           text NOT NULL,
  description    text NOT NULL,
  icon           text NOT NULL,
  points_reward  integer NOT NULL DEFAULT 0,
  tier           text NOT NULL CHECK (tier IN ('bronze','silver','gold','platinum')),
  criteria       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order     integer NOT NULL DEFAULT 100
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS achievements_public_select ON public.achievements;
CREATE POLICY achievements_public_select ON public.achievements
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_slug text REFERENCES public.achievements(slug) ON DELETE CASCADE,
  earned_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_slug)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_achievements_self_select ON public.user_achievements;
CREATE POLICY user_achievements_self_select ON public.user_achievements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_achievements_public_select ON public.user_achievements;
CREATE POLICY user_achievements_public_select ON public.user_achievements
  FOR SELECT TO anon, authenticated
  USING (true); -- needed for passport / leaderboard views

-- Seed catalog. Slugs are stable contracts — change carefully.
INSERT INTO public.achievements (slug, name, description, icon, points_reward, tier, criteria, sort_order) VALUES
  ('first_checkin',       'First steps',           'Check in at your first venue.',                          'Footprints',    20,  'bronze',   '{"checkin_count": 1}'::jsonb,                    10),
  ('ten_venues',          'Ten and counting',      'Visit ten distinct venues.',                             'MapPin',        50,  'silver',   '{"distinct_venues": 10}'::jsonb,                 20),
  ('fifty_venues',        'Local hero',            'Visit fifty distinct venues.',                           'Map',           150, 'gold',     '{"distinct_venues": 50}'::jsonb,                 30),
  ('hundred_venues',      'Centurion',             'Visit one hundred distinct venues.',                     'Crown',         300, 'platinum', '{"distinct_venues": 100}'::jsonb,                40),
  ('three_day_streak',    'On a roll',             'Check in three days in a row.',                          'Flame',         30,  'bronze',   '{"streak_days": 3}'::jsonb,                      50),
  ('seven_day_streak',    'Week-long warrior',     'Check in seven days in a row.',                          'Flame',         70,  'silver',   '{"streak_days": 7}'::jsonb,                      60),
  ('thirty_day_streak',   'Monthly devotee',       'Check in thirty days in a row.',                         'Flame',         200, 'gold',     '{"streak_days": 30}'::jsonb,                     70),
  ('night_owl',           'Night owl',             'Check in after midnight.',                               'Moon',          15,  'bronze',   '{"after_hour": 0, "before_hour": 5}'::jsonb,     80),
  ('weekend_warrior',     'Weekend warrior',       'Check in on Saturday and Sunday of the same week.',      'CalendarDays',  25,  'bronze',   '{"weekend_pair": true}'::jsonb,                  90),
  ('category_curator',    'Curator',               'Check in at five different venue categories.',           'LayoutGrid',    40,  'silver',   '{"distinct_categories": 5}'::jsonb,             100),
  ('three_cities',        'Roamer',                'Visit venues in three different cities.',                'Globe',         40,  'silver',   '{"distinct_cities": 3}'::jsonb,                 110),
  ('ten_cities',          'Globetrotter',          'Visit venues in ten different cities.',                  'Globe2',        120, 'gold',     '{"distinct_cities": 10}'::jsonb,                120),
  ('three_countries',     'Continental',           'Visit venues in three different countries.',             'Flag',          80,  'gold',     '{"distinct_countries": 3}'::jsonb,              130),
  ('pride_pilgrim',       'Pride pilgrim',         'Check in at a venue during a local pride event.',        'Heart',         60,  'silver',   '{"pride_checkin": true}'::jsonb,                140),
  ('all_around',          'All around',            'Check in at venues of every core category.',             'Sparkles',      200, 'platinum', '{"every_core_category": true}'::jsonb,          150)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  points_reward = EXCLUDED.points_reward,
  tier = EXCLUDED.tier,
  criteria = EXCLUDED.criteria,
  sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 3. Helpers — level calc, achievement evaluation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_level(p_points integer)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT LEAST(10, GREATEST(1, FLOOR(SQRT(GREATEST(0, p_points) / 50.0))::int + 1));
$$;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_distinct_venues    integer;
  v_distinct_cities    integer;
  v_distinct_countries integer;
  v_distinct_cats      integer;
  v_streak             integer;
  v_total              integer;
  v_has_night          boolean;
  v_weekend            boolean;
  v_has_every_core     boolean;
  v_unlocked           text;
BEGIN
  SELECT total_checkins, current_streak INTO v_total, v_streak
    FROM public.user_gamification WHERE user_id = p_user_id;
  IF v_total IS NULL THEN RETURN; END IF;

  SELECT COUNT(DISTINCT venue_id) INTO v_distinct_venues
    FROM public.venue_checkins WHERE user_id = p_user_id;

  SELECT COUNT(DISTINCT v.city_id) INTO v_distinct_cities
    FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
    WHERE c.user_id = p_user_id AND v.city_id IS NOT NULL;

  SELECT COUNT(DISTINCT v.country_id) INTO v_distinct_countries
    FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
    WHERE c.user_id = p_user_id AND v.country_id IS NOT NULL;

  SELECT COUNT(DISTINCT v.category) INTO v_distinct_cats
    FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
    WHERE c.user_id = p_user_id AND v.category IS NOT NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.venue_checkins
     WHERE user_id = p_user_id
       AND EXTRACT(HOUR FROM checked_in_at AT TIME ZONE 'UTC') < 5
  ) INTO v_has_night;

  SELECT EXISTS (
    SELECT 1 FROM public.venue_checkins c1
     WHERE c1.user_id = p_user_id
       AND EXTRACT(ISODOW FROM c1.checked_in_at) = 6
       AND EXISTS (
         SELECT 1 FROM public.venue_checkins c2
          WHERE c2.user_id = p_user_id
            AND EXTRACT(ISODOW FROM c2.checked_in_at) = 7
            AND date_trunc('week', c2.checked_in_at) = date_trunc('week', c1.checked_in_at)
       )
  ) INTO v_weekend;

  SELECT (
    SELECT COUNT(DISTINCT v.category)
      FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
     WHERE c.user_id = p_user_id
       AND v.category IN ('bar','restaurant','club','hotel','community_center')
  ) >= 5 INTO v_has_every_core;

  FOR v_unlocked IN
    SELECT slug FROM public.achievements
     WHERE
       (criteria ? 'checkin_count'        AND v_total              >= (criteria->>'checkin_count')::int)
    OR (criteria ? 'distinct_venues'      AND v_distinct_venues    >= (criteria->>'distinct_venues')::int)
    OR (criteria ? 'distinct_cities'      AND v_distinct_cities    >= (criteria->>'distinct_cities')::int)
    OR (criteria ? 'distinct_countries'   AND v_distinct_countries >= (criteria->>'distinct_countries')::int)
    OR (criteria ? 'distinct_categories'  AND v_distinct_cats      >= (criteria->>'distinct_categories')::int)
    OR (criteria ? 'streak_days'          AND v_streak             >= (criteria->>'streak_days')::int)
    OR (criteria ? 'after_hour'           AND v_has_night)
    OR (criteria ? 'weekend_pair'         AND v_weekend)
    OR (criteria ? 'every_core_category'  AND v_has_every_core)
  LOOP
    INSERT INTO public.user_achievements (user_id, achievement_slug)
    VALUES (p_user_id, v_unlocked)
    ON CONFLICT DO NOTHING;
    -- Award points if newly inserted (FOUND is true for inserted row).
    IF FOUND THEN
      UPDATE public.user_gamification
         SET points = points + COALESCE(
                (SELECT points_reward FROM public.achievements WHERE slug = v_unlocked), 0),
             level  = public.compute_level(points + COALESCE(
                (SELECT points_reward FROM public.achievements WHERE slug = v_unlocked), 0)),
             updated_at = now()
       WHERE user_id = p_user_id;
    END IF;
  END LOOP;
END
$$;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trigger on venue_checkins
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_venue_checkin_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_new_venue  boolean;
  v_last_date     date;
  v_today         date := (NEW.checked_in_at AT TIME ZONE 'UTC')::date;
  v_points        integer := 10;
  v_new_streak    integer;
BEGIN
  -- Bootstrap row if missing.
  INSERT INTO public.user_gamification (user_id) VALUES (NEW.user_id)
  ON CONFLICT DO NOTHING;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.venue_checkins
     WHERE user_id = NEW.user_id AND venue_id = NEW.venue_id AND id <> NEW.id
  ) INTO v_is_new_venue;

  IF v_is_new_venue THEN v_points := v_points + 5; END IF;

  SELECT last_checkin_date INTO v_last_date
    FROM public.user_gamification WHERE user_id = NEW.user_id FOR UPDATE;

  IF v_last_date IS NULL OR v_last_date < v_today - INTERVAL '1 day' THEN
    v_new_streak := 1;
  ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := (SELECT current_streak FROM public.user_gamification WHERE user_id = NEW.user_id) + 1;
  ELSE -- same day
    v_new_streak := (SELECT current_streak FROM public.user_gamification WHERE user_id = NEW.user_id);
  END IF;

  UPDATE public.user_gamification
     SET points           = points + v_points,
         level            = public.compute_level(points + v_points),
         current_streak   = v_new_streak,
         longest_streak   = GREATEST(longest_streak, v_new_streak),
         last_checkin_date = v_today,
         total_checkins   = total_checkins + 1,
         total_venues     = total_venues + CASE WHEN v_is_new_venue THEN 1 ELSE 0 END,
         updated_at       = now()
   WHERE user_id = NEW.user_id;

  PERFORM public.evaluate_achievements(NEW.user_id);

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS venue_checkins_gamify ON public.venue_checkins;
CREATE TRIGGER venue_checkins_gamify
  AFTER INSERT ON public.venue_checkins
  FOR EACH ROW EXECUTE FUNCTION public.on_venue_checkin_inserted();

-- ---------------------------------------------------------------------------
-- 5. Leaderboard materialized views
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.venue_leaderboard_city;
CREATE MATERIALIZED VIEW public.venue_leaderboard_city AS
  SELECT v.city_id,
         c.user_id,
         COUNT(DISTINCT c.venue_id)::int AS venues_visited,
         COUNT(*)::int                    AS total_checkins,
         COALESCE(MAX(g.points), 0)::int  AS points,
         RANK() OVER (
           PARTITION BY v.city_id
           ORDER BY COUNT(DISTINCT c.venue_id) DESC, COUNT(*) DESC
         )::int AS rank
    FROM public.venue_checkins c
    JOIN public.venues v ON v.id = c.venue_id
    LEFT JOIN public.user_gamification g ON g.user_id = c.user_id
   WHERE v.city_id IS NOT NULL
   GROUP BY v.city_id, c.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS venue_leaderboard_city_pk
  ON public.venue_leaderboard_city (city_id, user_id);
GRANT SELECT ON public.venue_leaderboard_city TO anon, authenticated;

DROP MATERIALIZED VIEW IF EXISTS public.venue_leaderboard_global;
CREATE MATERIALIZED VIEW public.venue_leaderboard_global AS
  SELECT c.user_id,
         COUNT(DISTINCT c.venue_id)::int AS venues_visited,
         COUNT(*)::int                    AS total_checkins,
         COALESCE(MAX(g.points), 0)::int  AS points,
         RANK() OVER (
           ORDER BY COUNT(DISTINCT c.venue_id) DESC, COUNT(*) DESC
         )::int AS rank
    FROM public.venue_checkins c
    LEFT JOIN public.user_gamification g ON g.user_id = c.user_id
   GROUP BY c.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS venue_leaderboard_global_pk
  ON public.venue_leaderboard_global (user_id);
GRANT SELECT ON public.venue_leaderboard_global TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_venue_leaderboards()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.venue_leaderboard_city;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.venue_leaderboard_global;
$$;

-- ---------------------------------------------------------------------------
-- 6. Ranking RPC
--
-- Returns a personalized venues list. Filters mirror the existing useVenues
-- contract (search/category/city/tags/amenities/services/accessibility/groups).
-- Sort: 'relevance' (default), 'nearest', 'name', 'category', 'city', 'created_at', 'featured'.
-- ---------------------------------------------------------------------------
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
  v_open_now          boolean := COALESCE((p_filters->>'openNow')::boolean, false);
  v_price             int     := NULLIF(p_filters->>'priceLevel', '')::int;
  v_tags              text[]  := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'tags')),
    ARRAY[]::text[]);
  v_amenities         text[]  := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'amenities')),
    ARRAY[]::text[]);
  v_services          text[]  := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'services')),
    ARRAY[]::text[]);
  v_access            text[]  := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'accessibility')),
    ARRAY[]::text[]);
  v_groups            text[]  := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'groups')),
    ARRAY[]::text[]);

  v_w_distance        numeric := CASE WHEN p_user_id IS NULL THEN 0.55 ELSE 0.35 END;
  v_w_interest        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.25 END;
  v_w_behavior        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.15 END;
  v_w_quality         numeric := CASE WHEN p_user_id IS NULL THEN 0.30 ELSE 0.15 END;
  v_w_recency         numeric := 0.10;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT v.*,
           CASE
             WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
              AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
               6371000 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((v.latitude - p_lat) / 2)), 2) +
                 COS(RADIANS(p_lat)) * COS(RADIANS(v.latitude)) *
                 POWER(SIN(RADIANS((v.longitude - p_lng) / 2)), 2)
               ))
             ELSE NULL
           END AS dist_m
      FROM public.venues v
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
    SELECT b.*
      FROM base b
     WHERE (v_radius_km IS NULL OR b.dist_m IS NULL OR b.dist_m <= v_radius_km * 1000)
  ),
  scored AS (
    SELECT
      f.*,
      -- distance: gaussian decay, 0..1; null distance scores 0.3 (neutral)
      CASE
        WHEN f.dist_m IS NULL THEN 0.3
        ELSE EXP(- POWER(f.dist_m / 30000.0, 2))
      END AS s_distance,
      -- interest: jaccard-ish overlap with user prefs
      LEAST(1.0,
        (CASE WHEN array_length(v_prefs_categories, 1) > 0 AND f.category = ANY(v_prefs_categories) THEN 0.5 ELSE 0 END)
      + (CASE WHEN array_length(v_prefs_tags, 1) > 0 AND f.tags && v_prefs_tags THEN 0.3 ELSE 0 END)
      + (CASE WHEN array_length(v_prefs_groups, 1) > 0 AND f.target_groups && v_prefs_groups THEN 0.2 ELSE 0 END)
      ) AS s_interest,
      -- behavior: boost categories user repeatedly visits
      CASE WHEN array_length(v_behavior_cats, 1) > 0 AND f.category = ANY(v_behavior_cats) THEN 1.0 ELSE 0.0 END AS s_behavior,
      -- quality: featured + verification
      LEAST(1.0,
        (CASE WHEN f.is_featured THEN 0.5 ELSE 0 END)
      + (CASE WHEN f.verified THEN 0.3 ELSE 0 END)
      + 0.2
      ) AS s_quality,
      -- recency: log decay over days since created
      GREATEST(0.0, 1.0 - LN(GREATEST(1, EXTRACT(DAY FROM (now() - f.created_at))::int)) / LN(365)) AS s_recency
      FROM filtered f
  ),
  ranked AS (
    SELECT
      s.*,
      ( v_w_distance * s.s_distance
      + v_w_interest * s.s_interest
      + v_w_behavior * s.s_behavior
      + v_w_quality  * s.s_quality
      + v_w_recency  * s.s_recency ) AS relevance,
      COUNT(*) OVER ()::bigint AS total
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

-- The RPC inspects the venues table structure; if the schema diverges, fall
-- back gracefully by failing fast at deploy rather than at runtime. The
-- frontend's useVenues hook detects PGRST/PostgREST RPC errors and reverts to
-- the legacy PostgREST query path.
GRANT EXECUTE ON FUNCTION public.rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, int, int)
  TO anon, authenticated;

COMMENT ON FUNCTION public.rpc_venues_ranked IS
  'Personalized venue ranking + filtering. Pass NULL user_id for anon scoring.';
