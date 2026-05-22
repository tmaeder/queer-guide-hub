-- D2 — Attempted "language_variant" rule REVERTED.
--
-- Tried: extend find_event_duplicate_candidates() with a venue+same-day
-- (no title gate) rule and a 500m geo fallback, score 0.92 / 0.88, to
-- catch pairs like "International Mr Leather" (English) and
-- "Internationaler Herr Leder" (German) that share venue + day but have
-- zero trigram similarity.
--
-- Why reverted (verified against prod data, 2026-05-22):
--   * venue-branch (same venue + same calendar day) catches legitimate
--     parallel events at large venues, e.g. "Berliner Fetischfestival"
--     vs "Berliner Bootsfahrt – Oster-Fetisch-Edition" — different
--     events same day same venue.
--   * geo-branch (no venue + same day + 500m) catches different parties
--     in dense scenes (Madrid, Tel Aviv, Toronto). Preview ran 740 pairs
--     across 262 events — too noisy to land safely.
--   * The actual IML repro case has no venue_id and null lat/lng on one
--     side, so no SQL similarity rule can distinguish it from unrelated
--     events without a translation-alias table or LLM mapping.
--
-- Path forward (not implemented here):
--   1. Build `public.event_title_aliases` (event_id, alias_text, lang)
--      seeded from a translation pass; new rule joins on it.
--   2. Or pipe new ingestion items through an LLM that emits a
--      canonical_title_en for cross-language matching.
--
-- This migration is intentionally a no-op (just re-asserts the existing
-- function definition) so the migration file stays in lockstep with
-- production. Client-side dedup (src/utils/eventDedup.ts) remains the
-- safety net for displayed lists.

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
