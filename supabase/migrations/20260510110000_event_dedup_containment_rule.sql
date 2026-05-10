-- Add containment-based dedup rule for events.
-- Fixes: "HRDR" vs "HRDR Event", "Berghain" vs "Berghain Party" etc.
-- When one normalized title fully contains the other (≥3 chars), score 0.92.
-- Also adds normalize_event_title() that strips noise words before comparison.

-- Strip event noise words for better trigram + containment matching
CREATE OR REPLACE FUNCTION public.normalize_event_title(t text)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(extensions.unaccent(coalesce(t, ''))),
      '\m(the|a|an|der|die|das|le|la|les|el|los|las|de|du|des|von|van|event|party|night|edition|show|gala|meetup|gathering|soiree|bash|nite|nacht|abend|fiesta|festa|fete)\M',
      '',
      'gi'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- Recreate find_event_duplicate_candidates with containment rule
CREATE OR REPLACE FUNCTION public.find_event_duplicate_candidates(
  p_title text,
  p_start_date timestamptz,
  p_venue_id uuid DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_edition text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(event_id uuid, match_type text, score numeric, distance_m float8, time_diff_hours float8)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
  WITH
    norm_input AS (
      SELECT public.normalize_event_title(p_title) AS t
    ),
    candidates AS (
      -- Rule 1: same venue + close date (existing)
      SELECT e.id AS eid, 'venue_date_exact'::text AS mt, 0.98::numeric AS sc,
             public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) AS dm,
             extract(epoch FROM (e.start_date - p_start_date))/3600.0 AS th
      FROM public.events e
      WHERE p_venue_id IS NOT NULL
        AND e.venue_id = p_venue_id
        AND e.duplicate_of_id IS NULL
        AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
        AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.35

      UNION ALL

      -- Rule 2: title + city + time (existing)
      SELECT e.id, 'title_city_time',
             extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.95,
             public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
             extract(epoch FROM (e.start_date - p_start_date))/3600.0
      FROM public.events e
      WHERE p_city IS NOT NULL
        AND lower(e.city) = lower(btrim(p_city))
        AND e.duplicate_of_id IS NULL
        AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.3
        AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'

      UNION ALL

      -- Rule 3: title + geo + time (existing)
      SELECT e.id, 'title_geo_time',
             extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.93,
             public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
             extract(epoch FROM (e.start_date - p_start_date))/3600.0
      FROM public.events e
      WHERE p_lat IS NOT NULL AND e.latitude IS NOT NULL
        AND e.duplicate_of_id IS NULL
        AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.3
        AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
        AND public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) < 2000

      UNION ALL

      -- Rule 4: recurring series (existing)
      SELECT e.id, 'recurring_series', 0.75::numeric,
             public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
             extract(epoch FROM (e.start_date - p_start_date))/3600.0
      FROM public.events e
      WHERE p_edition IS NOT NULL
        AND e.venue_id = p_venue_id
        AND e.duplicate_of_id IS NULL
        AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.75
        AND abs(extract(epoch FROM (e.start_date - p_start_date))/86400.0) > 7

      UNION ALL

      -- Rule 5 (NEW): title containment — one title fully inside the other.
      -- Catches "HRDR" vs "HRDR Event", "Folsom" vs "Folsom Europe".
      -- Uses noise-stripped titles. Requires same city or venue + close date.
      SELECT e.id, 'title_containment', 0.92::numeric,
             public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
             extract(epoch FROM (e.start_date - p_start_date))/3600.0
      FROM public.events e, norm_input ni
      WHERE e.duplicate_of_id IS NULL
        AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
        AND length(ni.t) >= 3
        AND length(public.normalize_event_title(e.title)) >= 3
        AND (
          -- one title fully contains the other (after noise stripping)
          position(ni.t IN public.normalize_event_title(e.title)) > 0
          OR position(public.normalize_event_title(e.title) IN ni.t) > 0
        )
        AND (
          -- must share venue or city
          (p_venue_id IS NOT NULL AND e.venue_id = p_venue_id)
          OR (p_city IS NOT NULL AND lower(e.city) = lower(btrim(p_city)))
          OR (p_lat IS NOT NULL AND e.latitude IS NOT NULL
              AND public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) < 2000)
        )
    ),
    best AS (
      SELECT DISTINCT ON (eid) eid, mt, sc, dm, th
      FROM candidates
      ORDER BY eid, sc DESC, abs(th) ASC, dm ASC NULLS LAST
    )
  SELECT eid, mt, sc, dm, th FROM best
  ORDER BY sc DESC, abs(th) ASC, dm ASC NULLS LAST
  LIMIT p_limit;
$$;
