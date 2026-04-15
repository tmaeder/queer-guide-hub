-- Hotel/B&B Data Ops Foundation
-- Hotel-aware columns on venues + DLQ + dedup feedback + source coverage.
-- Idempotent. Builds on 20260414250000 (venue data ops) + 20260414260000 (commit RPC).

-- ===== 1. venues: accommodation-specific columns =====
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS booking_url         TEXT,
  ADD COLUMN IF NOT EXISTS star_rating         NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS platform_ids        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS amenities_verified  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accommodation_type  TEXT;

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_star_rating_check;
ALTER TABLE public.venues
  ADD CONSTRAINT venues_star_rating_check CHECK (star_rating IS NULL OR (star_rating >= 0 AND star_rating <= 5));

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_accommodation_type_check;
ALTER TABLE public.venues
  ADD CONSTRAINT venues_accommodation_type_check
  CHECK (accommodation_type IS NULL OR accommodation_type IN ('hotel','bnb','hostel','resort','guesthouse','apartment','villa','campground'));

CREATE INDEX IF NOT EXISTS idx_venues_accommodation_type
  ON public.venues(accommodation_type)
  WHERE accommodation_type IS NOT NULL AND duplicate_of_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_venues_platform_ids_gin
  ON public.venues USING gin (platform_ids jsonb_path_ops)
  WHERE platform_ids <> '{}'::jsonb;

-- ===== 2. Dead-letter queue =====
CREATE TABLE IF NOT EXISTS public.ingestion_dlq (
  id BIGSERIAL PRIMARY KEY,
  staging_id      UUID REFERENCES public.ingestion_staging(id) ON DELETE CASCADE,
  pipeline_run_id UUID,
  source_slug     TEXT,
  stage           TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  payload         JSONB,
  attempts        INT  NOT NULL DEFAULT 0,
  max_attempts    INT  NOT NULL DEFAULT 5,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','retrying','permanent_failed','resolved')),
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until    TIMESTAMPTZ,
  locked_by       TEXT,
  last_attempt_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_pending_retry
  ON public.ingestion_dlq(next_retry_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dlq_status_stage ON public.ingestion_dlq(status, stage);
CREATE INDEX IF NOT EXISTS idx_dlq_staging      ON public.ingestion_dlq(staging_id);

CREATE OR REPLACE FUNCTION public.ingestion_dlq_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_ingestion_dlq_touch ON public.ingestion_dlq;
CREATE TRIGGER trg_ingestion_dlq_touch
  BEFORE UPDATE ON public.ingestion_dlq
  FOR EACH ROW EXECUTE FUNCTION public.ingestion_dlq_touch();

-- ===== 3. Dedup feedback (closes the loop on manual overrides) =====
CREATE TABLE IF NOT EXISTS public.dedup_decisions_feedback (
  id BIGSERIAL PRIMARY KEY,
  staging_id      UUID REFERENCES public.ingestion_staging(id) ON DELETE SET NULL,
  candidate_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  rpc_score       NUMERIC(4,3),
  rpc_match_type  TEXT,
  human_decision  TEXT NOT NULL CHECK (human_decision IN ('confirmed_duplicate','not_duplicate','merge','create_new')),
  reason          TEXT,
  decided_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dedup_feedback_decision ON public.dedup_decisions_feedback(human_decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dedup_feedback_staging  ON public.dedup_decisions_feedback(staging_id);

-- ===== 4. Source coverage targets =====
CREATE TABLE IF NOT EXISTS public.source_coverage_targets (
  id BIGSERIAL PRIMARY KEY,
  source_slug         TEXT NOT NULL,
  city_id             UUID REFERENCES public.cities(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL DEFAULT 'venue',
  accommodation_type  TEXT,
  expected_count      INT,
  actual_count        INT NOT NULL DEFAULT 0,
  last_run_at         TIMESTAMPTZ,
  last_success_at     TIMESTAMPTZ,
  success_ratio       NUMERIC(4,3),
  is_enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_coverage_uk UNIQUE (source_slug, city_id, entity_type, accommodation_type)
);
CREATE INDEX IF NOT EXISTS idx_coverage_source ON public.source_coverage_targets(source_slug, is_enabled);
CREATE INDEX IF NOT EXISTS idx_coverage_stale  ON public.source_coverage_targets(last_run_at NULLS FIRST) WHERE is_enabled;

-- ===== 5. Hotel-specific dedup RPC (extends venue RPC with platform_ids exact match) =====
CREATE OR REPLACE FUNCTION public.find_hotel_duplicate_candidates(
  p_name              TEXT,
  p_phone_e164        TEXT    DEFAULT NULL,
  p_email             TEXT    DEFAULT NULL,
  p_website_domain    TEXT    DEFAULT NULL,
  p_lat               NUMERIC DEFAULT NULL,
  p_lng               NUMERIC DEFAULT NULL,
  p_city_id           UUID    DEFAULT NULL,
  p_platform_ids      JSONB   DEFAULT '{}'::jsonb,
  p_booking_url       TEXT    DEFAULT NULL,
  p_limit             INT     DEFAULT 20
)
RETURNS TABLE(venue_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE AS $$
  WITH platform_keys AS (
    SELECT key, value::text AS pid
    FROM jsonb_each_text(coalesce(p_platform_ids, '{}'::jsonb))
    WHERE value IS NOT NULL AND value::text <> ''
  ),
  candidates AS (
    -- Platform-ID exact match (Airbnb/Booking/Expedia ID is canonical)
    SELECT v.id, ('platform_' || pk.key)::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v
    JOIN platform_keys pk ON v.platform_ids ->> pk.key = pk.pid
    WHERE v.duplicate_of_id IS NULL
    UNION ALL
    -- Booking URL exact match
    SELECT v.id, 'booking_url_exact', 0.99,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_booking_url IS NOT NULL
      AND lower(btrim(v.booking_url)) = lower(btrim(p_booking_url))
      AND v.duplicate_of_id IS NULL
    UNION ALL
    -- Inherit base signals via the venue RPC
    SELECT c.venue_id, c.match_type, c.score, c.distance_m
    FROM public.find_venue_duplicate_candidates(
      p_name, p_phone_e164, p_email, p_website_domain,
      p_lat, p_lng, p_city_id, p_limit
    ) c
  )
  SELECT DISTINCT ON (id) id, mt, sc, dm
  FROM candidates
  ORDER BY id, sc DESC, dm ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.find_hotel_duplicate_candidates(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,UUID,JSONB,TEXT,INT)
  TO authenticated, service_role;

-- ===== 6. DLQ enqueue/retry helpers =====
CREATE OR REPLACE FUNCTION public.dlq_enqueue(
  p_staging_id UUID,
  p_stage      TEXT,
  p_error_code TEXT,
  p_error      TEXT,
  p_payload    JSONB DEFAULT NULL,
  p_source     TEXT  DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO public.ingestion_dlq(staging_id, stage, error_code, error_message, payload, source_slug)
  VALUES (p_staging_id, p_stage, p_error_code, p_error, p_payload, p_source)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dlq_claim_batch(p_limit INT DEFAULT 25, p_worker TEXT DEFAULT 'dlq-consumer')
RETURNS SETOF public.ingestion_dlq LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ingestion_dlq d
  SET status='retrying', locked_until=now() + interval '5 minutes', locked_by=p_worker,
      attempts=attempts+1, last_attempt_at=now()
  WHERE d.id IN (
    SELECT id FROM public.ingestion_dlq
    WHERE status='pending'
      AND next_retry_at <= now()
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY next_retry_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.dlq_resolve(p_id BIGINT) RETURNS VOID LANGUAGE sql AS $$
  UPDATE public.ingestion_dlq SET status='resolved', resolved_at=now(), locked_until=NULL WHERE id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.dlq_fail(p_id BIGINT, p_err TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  SELECT attempts, max_attempts INTO r FROM public.ingestion_dlq WHERE id=p_id;
  IF r.attempts >= r.max_attempts THEN
    UPDATE public.ingestion_dlq
      SET status='permanent_failed', error_message=p_err, locked_until=NULL
      WHERE id=p_id;
  ELSE
    -- Backoff: 1m, 5m, 30m, 2h, 12h
    UPDATE public.ingestion_dlq
      SET status='pending', error_message=p_err, locked_until=NULL,
          next_retry_at = now() + (CASE attempts
            WHEN 1 THEN interval '1 minute'
            WHEN 2 THEN interval '5 minutes'
            WHEN 3 THEN interval '30 minutes'
            WHEN 4 THEN interval '2 hours'
            ELSE interval '12 hours'
          END)
      WHERE id=p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dlq_enqueue(UUID,TEXT,TEXT,TEXT,JSONB,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dlq_claim_batch(INT,TEXT)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.dlq_resolve(BIGINT)                           TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.dlq_fail(BIGINT,TEXT)                         TO service_role;

-- ===== 7. Coverage refresh helper =====
CREATE OR REPLACE FUNCTION public.refresh_source_coverage()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.source_coverage_targets t
  SET actual_count = sub.cnt,
      success_ratio = CASE WHEN t.expected_count IS NULL OR t.expected_count = 0
                           THEN NULL
                           ELSE LEAST(1.0, sub.cnt::numeric / t.expected_count) END,
      updated_at = now()
  FROM (
    SELECT vs.source_slug, v.city_id, v.accommodation_type, count(*)::int AS cnt
    FROM public.venues v
    JOIN public.venue_sources vs ON vs.venue_id = v.id
    WHERE v.duplicate_of_id IS NULL
    GROUP BY vs.source_slug, v.city_id, v.accommodation_type
  ) sub
  WHERE t.source_slug = sub.source_slug
    AND t.city_id = sub.city_id
    AND coalesce(t.accommodation_type,'') = coalesce(sub.accommodation_type,'');
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_source_coverage() TO service_role, authenticated;

-- ===== 8. RLS =====
ALTER TABLE public.ingestion_dlq            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dedup_decisions_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_coverage_targets  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ingestion_dlq' AND policyname='dlq_admin_all') THEN
    CREATE POLICY "dlq_admin_all" ON public.ingestion_dlq
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dedup_decisions_feedback' AND policyname='dedup_fb_admin_all') THEN
    CREATE POLICY "dedup_fb_admin_all" ON public.dedup_decisions_feedback
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_coverage_targets' AND policyname='coverage_admin_all') THEN
    CREATE POLICY "coverage_admin_all" ON public.source_coverage_targets
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_coverage_targets' AND policyname='coverage_authenticated_read') THEN
    CREATE POLICY "coverage_authenticated_read" ON public.source_coverage_targets
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ===== 9. Hotel ingest stats view =====
CREATE OR REPLACE VIEW public.hotel_ingest_stats AS
SELECT
  date_trunc('day', s.created_at)         AS day,
  s.source_type                           AS source,
  coalesce(s.normalized_data->>'accommodation_type','unknown') AS accommodation_type,
  count(*)                                AS staged,
  count(*) FILTER (WHERE s.ai_validation_status = 'approved')  AS validated,
  count(*) FILTER (WHERE s.dedup_status = 'unique')            AS unique_items,
  count(*) FILTER (WHERE s.dedup_status = 'duplicate')         AS duplicates,
  count(*) FILTER (WHERE s.disposition  IN ('inserted','committed')) AS committed,
  count(*) FILTER (WHERE s.disposition  = 'rejected')          AS rejected,
  count(*) FILTER (WHERE s.review_status = 'pending_review')   AS pending_review
FROM public.ingestion_staging s
WHERE s.target_table = 'venues'
  AND coalesce(s.normalized_data->>'accommodation_type','') <> ''
GROUP BY 1, 2, 3;

GRANT SELECT ON public.hotel_ingest_stats TO authenticated;

-- ===== 10. DLQ summary view =====
CREATE OR REPLACE VIEW public.dlq_summary AS
SELECT
  source_slug,
  stage,
  status,
  count(*)::int AS items,
  min(next_retry_at) AS next_retry,
  max(last_attempt_at) AS last_attempt
FROM public.ingestion_dlq
GROUP BY 1,2,3;

GRANT SELECT ON public.dlq_summary TO authenticated;

-- ===== 11. Advisor compliance: invoker views + locked search_paths =====
ALTER VIEW public.hotel_ingest_stats SET (security_invoker=true);
ALTER VIEW public.dlq_summary        SET (security_invoker=true);

ALTER FUNCTION public.find_hotel_duplicate_candidates(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,UUID,JSONB,TEXT,INT) SET search_path = public, extensions;
ALTER FUNCTION public.dlq_enqueue(UUID,TEXT,TEXT,TEXT,JSONB,TEXT) SET search_path = public;
ALTER FUNCTION public.dlq_claim_batch(INT,TEXT)                   SET search_path = public;
ALTER FUNCTION public.dlq_resolve(BIGINT)                         SET search_path = public;
ALTER FUNCTION public.dlq_fail(BIGINT,TEXT)                       SET search_path = public;
ALTER FUNCTION public.refresh_source_coverage()                   SET search_path = public;
ALTER FUNCTION public.ingestion_dlq_touch()                       SET search_path = public;
