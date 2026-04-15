-- Venue Data Ops Foundation
-- Schema deltas for bulletproof import/enrich/dedupe/validate workflows.
-- Idempotent; safe to re-apply.

-- ===== 1. venue_sources junction =====
CREATE TABLE IF NOT EXISTS public.venue_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_url TEXT,
  payload JSONB,
  payload_hash TEXT,
  confidence NUMERIC(4,3) DEFAULT 1.000,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_sources_slug_entity_uk UNIQUE (source_slug, source_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_venue_sources_venue ON public.venue_sources(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_sources_slug  ON public.venue_sources(source_slug);

-- ===== 2. venues: normalized columns + verification =====
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS phone_e164          TEXT,
  ADD COLUMN IF NOT EXISTS website_domain      TEXT,
  ADD COLUMN IF NOT EXISTS email_lower         TEXT,
  ADD COLUMN IF NOT EXISTS name_normalized     TEXT,
  ADD COLUMN IF NOT EXISTS last_refreshed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

-- ===== 3. Normalization helpers =====
CREATE OR REPLACE FUNCTION public.extract_website_domain(url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN url IS NULL OR btrim(url) = '' THEN NULL
    ELSE lower(regexp_replace(
           regexp_replace(btrim(url), '^https?://(www\.)?', ''),
           '[/?#].*$', ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  -- Best-effort digits + leading +; full E.164 resolution happens in app layer.
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    ELSE regexp_replace(btrim(p), '[^0-9+]', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_name(n TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    lower(extensions.unaccent(coalesce(n,''))),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ===== 4. Sync trigger on venues =====
CREATE OR REPLACE FUNCTION public.venues_maintain_normalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone_e164      := public.normalize_phone(NEW.phone);
  NEW.website_domain  := public.extract_website_domain(NEW.website);
  NEW.email_lower     := lower(nullif(btrim(NEW.email), ''));
  NEW.name_normalized := public.normalize_name(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venues_normalized ON public.venues;
CREATE TRIGGER trg_venues_normalized
  BEFORE INSERT OR UPDATE OF name, phone, website, email
  ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_maintain_normalized();

-- ===== 5. Backfill normalized fields =====
UPDATE public.venues SET
  phone_e164      = public.normalize_phone(phone),
  website_domain  = public.extract_website_domain(website),
  email_lower     = lower(nullif(btrim(email), '')),
  name_normalized = public.normalize_name(name)
WHERE name_normalized IS NULL;

-- ===== 6. Dedup-supporting indexes =====
CREATE INDEX IF NOT EXISTS idx_venues_phone_e164      ON public.venues(phone_e164)     WHERE phone_e164 IS NOT NULL AND duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_website_domain  ON public.venues(website_domain) WHERE website_domain IS NOT NULL AND duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_email_lower     ON public.venues(email_lower)    WHERE email_lower IS NOT NULL AND duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm       ON public.venues USING gin (name_normalized extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_latlng          ON public.venues(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_city_category   ON public.venues(city_id, category);
CREATE INDEX IF NOT EXISTS idx_venues_duplicate_of    ON public.venues(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

-- ===== 7. ingestion_staging idempotency =====
ALTER TABLE public.ingestion_staging
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS payload_hash     TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key  TEXT;

UPDATE public.ingestion_staging
SET payload_hash = encode(extensions.digest(coalesce(raw_data::text,''), 'sha256'), 'hex')
WHERE payload_hash IS NULL AND raw_data IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_ingestion_staging_idem
  ON public.ingestion_staging(source_type, source_entity_id, payload_hash)
  WHERE source_entity_id IS NOT NULL AND payload_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingestion_staging_disposition
  ON public.ingestion_staging(disposition, target_table)
  WHERE disposition IN ('pending','approved','needs_review','needs_enrichment');

CREATE INDEX IF NOT EXISTS idx_ingestion_staging_review
  ON public.ingestion_staging(review_status, created_at DESC)
  WHERE review_status IN ('pending_review','in_review');

-- ===== 8. Audit log =====
CREATE TABLE IF NOT EXISTS public.ingestion_events (
  id BIGSERIAL PRIMARY KEY,
  staging_id  UUID REFERENCES public.ingestion_staging(id) ON DELETE CASCADE,
  venue_id    UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  stage       TEXT NOT NULL,
  old_status  TEXT,
  new_status  TEXT,
  actor       TEXT NOT NULL DEFAULT 'system',
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_staging ON public.ingestion_events(staging_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_venue   ON public.ingestion_events(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_stage   ON public.ingestion_events(stage, created_at DESC);

-- ===== 9. Extend dedupe decisions =====
ALTER TABLE public.scraper_dedupe_decisions
  ADD COLUMN IF NOT EXISTS rules_fired JSONB,
  ADD COLUMN IF NOT EXISTS action      TEXT,
  ADD COLUMN IF NOT EXISTS decided_by  TEXT NOT NULL DEFAULT 'system';

-- ===== 10. RLS =====
ALTER TABLE public.venue_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_sources' AND policyname='venue_sources_read') THEN
    CREATE POLICY "venue_sources_read" ON public.venue_sources
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_sources' AND policyname='venue_sources_admin_write') THEN
    CREATE POLICY "venue_sources_admin_write" ON public.venue_sources
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ingestion_events' AND policyname='ingestion_events_admin_all') THEN
    CREATE POLICY "ingestion_events_admin_all" ON public.ingestion_events
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ===== 11. Backfill venue_sources from existing per-source columns =====
INSERT INTO public.venue_sources (venue_id, source_slug, source_entity_id, is_primary, first_seen_at, last_seen_at)
SELECT id, coalesce(data_source,'unknown'), external_id, true, created_at, coalesce(last_synced_at, created_at)
FROM public.venues
WHERE external_id IS NOT NULL AND data_source IS NOT NULL
ON CONFLICT (source_slug, source_entity_id) DO NOTHING;

INSERT INTO public.venue_sources (venue_id, source_slug, source_entity_id, is_primary, first_seen_at, last_seen_at)
SELECT id, 'foursquare', foursquare_id, false, created_at, coalesce(last_synced_at, created_at)
FROM public.venues WHERE foursquare_id IS NOT NULL
ON CONFLICT (source_slug, source_entity_id) DO NOTHING;

INSERT INTO public.venue_sources (venue_id, source_slug, source_entity_id, is_primary, first_seen_at, last_seen_at)
SELECT id, 'tripadvisor', tripadvisor_id, false, created_at, coalesce(last_synced_at, created_at)
FROM public.venues WHERE tripadvisor_id IS NOT NULL
ON CONFLICT (source_slug, source_entity_id) DO NOTHING;

INSERT INTO public.venue_sources (venue_id, source_slug, source_entity_id, is_primary, first_seen_at, last_seen_at)
SELECT id, 'tomtom', tomtom_id, false, created_at, coalesce(last_synced_at, created_at)
FROM public.venues WHERE tomtom_id IS NOT NULL
ON CONFLICT (source_slug, source_entity_id) DO NOTHING;

-- ===== 12. Haversine distance helper (no PostGIS required) =====
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lat2 IS NULL OR lng1 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 2 * 6371000 * asin(sqrt(
      power(sin(radians((lat2 - lat1)::double precision / 2)), 2) +
      cos(radians(lat1::double precision)) * cos(radians(lat2::double precision)) *
      power(sin(radians((lng2 - lng1)::double precision / 2)), 2)
    ))
  END;
$$;

-- ===== 13. Venue dedup candidates RPC (multi-signal) =====
CREATE OR REPLACE FUNCTION public.find_venue_duplicate_candidates(
  p_name           TEXT,
  p_phone_e164     TEXT    DEFAULT NULL,
  p_email          TEXT    DEFAULT NULL,
  p_website_domain TEXT    DEFAULT NULL,
  p_lat            NUMERIC DEFAULT NULL,
  p_lng            NUMERIC DEFAULT NULL,
  p_city_id        UUID    DEFAULT NULL,
  p_limit          INT     DEFAULT 20
)
RETURNS TABLE(venue_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT v.id, 'phone_exact'::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v
    WHERE p_phone_e164 IS NOT NULL
      AND v.phone_e164 = p_phone_e164
      AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'email_exact', 0.98, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_email IS NOT NULL
      AND v.email_lower = lower(btrim(p_email))
      AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'domain_proximity', 0.95, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_website_domain IS NOT NULL
      AND v.website_domain = p_website_domain
      AND v.duplicate_of_id IS NULL
      AND (p_lat IS NULL OR v.latitude IS NULL
           OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 500)
    UNION ALL
    SELECT v.id, 'name_proximity',
           extensions.similarity(v.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE v.name_normalized % public.normalize_name(p_name)
      AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (p_lat IS NULL OR v.latitude IS NULL
           OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 1500)
  )
  SELECT DISTINCT ON (id) id, mt, sc, dm
  FROM candidates
  ORDER BY id, sc DESC, dm ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.find_venue_duplicate_candidates(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,UUID,INT)
  TO authenticated, service_role;

-- ===== 14. Ingest stats view =====
CREATE OR REPLACE VIEW public.venue_ingest_stats AS
SELECT
  date_trunc('day', created_at)        AS day,
  source_type                          AS source,
  count(*)                             AS staged,
  count(*) FILTER (WHERE ai_validation_status = 'approved')  AS validated,
  count(*) FILTER (WHERE dedup_status = 'unique')            AS unique_items,
  count(*) FILTER (WHERE dedup_status = 'duplicate')         AS duplicates,
  count(*) FILTER (WHERE disposition  = 'inserted')          AS inserted,
  count(*) FILTER (WHERE disposition  = 'updated')           AS updated,
  count(*) FILTER (WHERE disposition  = 'rejected')          AS rejected,
  count(*) FILTER (WHERE review_status = 'pending_review')   AS pending_review
FROM public.ingestion_staging
WHERE target_table = 'venues'
GROUP BY 1, 2;

GRANT SELECT ON public.venue_ingest_stats TO authenticated;
