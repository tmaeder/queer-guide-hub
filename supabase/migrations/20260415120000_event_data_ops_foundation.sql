-- Event Data Ops Foundation
-- Schema deltas for bulletproof import/enrich/dedupe/validate workflows on events.
-- Mirrors venue_data_ops_foundation (20260414250000) for the events table.
-- Idempotent; safe to re-apply.

-- ===== 1. event_sources junction =====
CREATE TABLE IF NOT EXISTS public.event_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_url TEXT,
  payload JSONB,
  payload_hash TEXT,
  confidence NUMERIC(4,3) DEFAULT 1.000,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_sources_slug_entity_uk UNIQUE (source_slug, source_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_event_sources_event ON public.event_sources(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sources_slug  ON public.event_sources(source_slug);

-- ===== 2. events: normalized columns + dedup hooks =====
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_id        TEXT,
  ADD COLUMN IF NOT EXISTS title_normalized   TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of_id    UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refreshed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

-- ===== 3. Sync trigger on events =====
CREATE OR REPLACE FUNCTION public.events_maintain_normalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.title_normalized := public.normalize_name(NEW.title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_normalized ON public.events;
CREATE TRIGGER trg_events_normalized
  BEFORE INSERT OR UPDATE OF title
  ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_maintain_normalized();

-- ===== 4. Backfill =====
UPDATE public.events
SET title_normalized = public.normalize_name(title)
WHERE title_normalized IS NULL;

-- ===== 5. Dedup-supporting indexes =====
CREATE INDEX IF NOT EXISTS idx_events_title_trgm      ON public.events USING gin (title_normalized extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_start_date      ON public.events(start_date)        WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_venue_start     ON public.events(venue_id, start_date) WHERE venue_id IS NOT NULL AND duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_city_start      ON public.events(city, start_date)  WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_latlng          ON public.events(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_duplicate_of    ON public.events(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_data_source_ext ON public.events(data_source, external_id) WHERE external_id IS NOT NULL;

-- ===== 6. RLS for event_sources =====
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_sources' AND policyname='event_sources_read') THEN
    CREATE POLICY "event_sources_read" ON public.event_sources
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_sources' AND policyname='event_sources_admin_write') THEN
    CREATE POLICY "event_sources_admin_write" ON public.event_sources
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ===== 7. Backfill event_sources from data_source/external_id =====
INSERT INTO public.event_sources (event_id, source_slug, source_entity_id, is_primary, first_seen_at, last_seen_at)
SELECT id, coalesce(data_source,'unknown'), external_id, true, created_at, coalesce(last_synced_at, created_at)
FROM public.events
WHERE external_id IS NOT NULL AND data_source IS NOT NULL
ON CONFLICT (source_slug, source_entity_id) DO NOTHING;

-- ===== 8. Event dedup candidates RPC (multi-signal: title+date+city/geo/venue) =====
-- Matches within ±48h time window, same city or within 2km geo, with trigram title similarity.
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

-- ===== 9. Event ingest stats view =====
CREATE OR REPLACE VIEW public.event_ingest_stats AS
SELECT
  date_trunc('day', created_at)        AS day,
  source_type                          AS source,
  count(*)                             AS staged,
  count(*) FILTER (WHERE ai_validation_status = 'approved')  AS validated,
  count(*) FILTER (WHERE dedup_status = 'unique')            AS unique_items,
  count(*) FILTER (WHERE dedup_status = 'duplicate')         AS duplicates,
  count(*) FILTER (WHERE dedup_status = 'merge_candidate')   AS merge_candidates,
  count(*) FILTER (WHERE disposition  = 'inserted')          AS inserted,
  count(*) FILTER (WHERE disposition  = 'updated')           AS updated,
  count(*) FILTER (WHERE disposition  = 'rejected')          AS rejected,
  count(*) FILTER (WHERE review_status = 'pending_review')   AS pending_review
FROM public.ingestion_staging
WHERE target_table = 'events'
GROUP BY 1, 2;

GRANT SELECT ON public.event_ingest_stats TO authenticated;
