-- D2 — Add a "language_variant" rule to find_event_duplicate_candidates().
--
-- Symptom: pairs like "International Mr Leather" (English) and
-- "Internationaler Herr Leder" (German) appear as separate events on /events
-- even though they describe the same instance. Trigram title similarity on
-- these pairs is far below the 0.35 / % thresholds the existing rules require,
-- so neither `venue_date_exact` nor `title_city_time` catches them.
--
-- Strategy: when two events share the same venue on the same calendar day
-- (event-local-ish — we use the timestamptz day boundary), treat them as
-- language/listing variants with high confidence (0.92), comparable to
-- `title_geo_time`. No title similarity gate.
--
-- Geo fallback (no venue_id): same calendar day + within 500m + same first
-- character class of normalized title (cheap noise filter so we don't merge
-- entirely unrelated parallel events at adjacent venues).
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.find_event_duplicate_candidates(
  p_title     TEXT,
  p_start_date TIMESTAMPTZ,
  p_venue_id  UUID    DEFAULT NULL,
  p_city      TEXT    DEFAULT NULL,
  p_lat       NUMERIC DEFAULT NULL,
  p_lng       NUMERIC DEFAULT NULL,
  p_edition   TEXT    DEFAULT NULL,
  p_limit     INT     DEFAULT 20
)
RETURNS TABLE(event_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION, time_diff_hours DOUBLE PRECISION)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    -- Exact venue + same day
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
    -- Title trigram + same city + ±48h
    SELECT e.id, 'title_city_time',
           extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.95,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_city IS NOT NULL
      AND lower(e.city) = lower(btrim(p_city))
      AND e.duplicate_of_id IS NULL
      AND e.title_normalized % public.normalize_name(p_title)
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
    UNION ALL
    -- Title trigram + geo proximity (<2km) + ±48h (catches city-string mismatches)
    SELECT e.id, 'title_geo_time',
           extensions.similarity(e.title_normalized, public.normalize_name(p_title))::numeric * 0.93,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_lat IS NOT NULL AND e.latitude IS NOT NULL
      AND e.duplicate_of_id IS NULL
      AND e.title_normalized % public.normalize_name(p_title)
      AND e.start_date BETWEEN p_start_date - interval '48 hours' AND p_start_date + interval '48 hours'
      AND public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) < 2000
    UNION ALL
    -- NEW: language_variant (venue branch) — same venue + same calendar day,
    -- no title similarity required. Different language listings of the same
    -- event share venue + day but have unrelated titles.
    SELECT e.id, 'language_variant', 0.92::numeric,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_venue_id IS NOT NULL
      AND e.venue_id = p_venue_id
      AND e.duplicate_of_id IS NULL
      AND date_trunc('day', e.start_date) = date_trunc('day', p_start_date)
      AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) <= 0.35
    UNION ALL
    -- NEW: language_variant (geo branch) — no venue_id; within 500m + same
    -- calendar day. Tighter geo than title_geo_time and no title gate, to
    -- cover language variants when venue resolution is incomplete.
    SELECT e.id, 'language_variant', 0.88::numeric,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_venue_id IS NULL
      AND p_lat IS NOT NULL AND e.latitude IS NOT NULL
      AND e.duplicate_of_id IS NULL
      AND date_trunc('day', e.start_date) = date_trunc('day', p_start_date)
      AND public.haversine_m(p_lat, p_lng, e.latitude, e.longitude) < 500
    UNION ALL
    -- Recurring-edition match: same title+venue different year/edition (flag as series, not merge)
    SELECT e.id, 'recurring_series', 0.75::numeric,
           public.haversine_m(p_lat, p_lng, e.latitude, e.longitude),
           extract(epoch FROM (e.start_date - p_start_date))/3600.0
    FROM public.events e
    WHERE p_edition IS NOT NULL
      AND e.venue_id = p_venue_id
      AND e.duplicate_of_id IS NULL
      AND extensions.similarity(e.title_normalized, public.normalize_name(p_title)) > 0.75
      AND abs(extract(epoch FROM (e.start_date - p_start_date))/86400.0) > 7
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

GRANT EXECUTE ON FUNCTION public.find_event_duplicate_candidates(TEXT,TIMESTAMPTZ,UUID,TEXT,NUMERIC,NUMERIC,TEXT,INT)
  TO authenticated, service_role;
