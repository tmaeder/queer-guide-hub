-- ============================================================
-- Trip Planning V2: Geo backfill + admin review queue
--
-- Heuristics (in order):
--   1. Trip has trip_places with city_id/country_id → use first match
--   2. Trip title fuzzy-matches a city name in public.cities → use that
--   3. Rest → enqueued in trip_geo_review_queue for admin triage
--
-- After the queue is cleared, an operator should run the
-- finalize step at the end of this migration (gated behind a
-- DO block) to promote NOT NULL.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trip_geo_review_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE UNIQUE,
  suggested_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','resolved','dismissed')),
  resolved_city_id    UUID REFERENCES public.cities(id),
  resolved_country_id UUID REFERENCES public.countries(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_geo_review_queue_status
  ON public.trip_geo_review_queue(status) WHERE status = 'pending';

ALTER TABLE public.trip_geo_review_queue ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write (admins identified by profiles.role = 'admin')
CREATE POLICY trip_geo_review_queue_admin_all ON public.trip_geo_review_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- ── Heuristic 1: use first trip_place city/country ─────────────
WITH place_geo AS (
  SELECT DISTINCT ON (tp.trip_id)
         tp.trip_id,
         tp.city_id,
         COALESCE(tp.country_id, c.country_id) AS country_id
  FROM public.trip_places tp
  LEFT JOIN public.cities c ON c.id = tp.city_id
  WHERE tp.city_id IS NOT NULL OR tp.country_id IS NOT NULL
  ORDER BY tp.trip_id, tp.sort_order ASC, tp.created_at ASC
)
UPDATE public.trips t
SET primary_city_id    = pg.city_id,
    primary_country_id = COALESCE(t.primary_country_id, pg.country_id)
FROM place_geo pg
WHERE t.id = pg.trip_id
  AND t.primary_city_id IS NULL;

-- ── Heuristic 2: fuzzy match title → cities.name ───────────────
-- Only match if exactly one city name appears in the title
WITH title_matches AS (
  SELECT t.id AS trip_id,
         c.id AS city_id,
         c.country_id,
         ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY LENGTH(c.name) DESC) AS rn,
         COUNT(*) OVER (PARTITION BY t.id) AS match_count
  FROM public.trips t
  JOIN public.cities c
    ON t.title ILIKE '%' || c.name || '%'
   AND LENGTH(c.name) >= 4  -- avoid matching 3-letter names like "Rio" inside other words
  WHERE t.primary_city_id IS NULL
)
UPDATE public.trips t
SET primary_city_id    = tm.city_id,
    primary_country_id = tm.country_id
FROM title_matches tm
WHERE t.id = tm.trip_id
  AND tm.rn = 1
  AND tm.match_count = 1;

-- ── Heuristic 3: everything else → review queue ────────────────
INSERT INTO public.trip_geo_review_queue (trip_id, suggested_matches)
SELECT t.id,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object(
           'city_id', c.id,
           'city_name', c.name,
           'country_code', co.code
         )) FILTER (WHERE c.id IS NOT NULL),
         '[]'::jsonb
       )
FROM public.trips t
LEFT JOIN public.cities c
  ON t.title ILIKE '%' || c.name || '%'
 AND LENGTH(c.name) >= 4
LEFT JOIN public.countries co ON co.id = c.country_id
WHERE t.primary_city_id IS NULL
GROUP BY t.id
ON CONFLICT (trip_id) DO NOTHING;

-- ── RPC: resolve a queue entry ─────────────────────────────────
-- Admin UI calls this to assign a city/country to a queued trip
CREATE OR REPLACE FUNCTION public.resolve_trip_geo_review(
  p_queue_id   UUID,
  p_city_id    UUID,
  p_country_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
  v_country UUID;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT trip_id INTO v_trip_id
  FROM public.trip_geo_review_queue
  WHERE id = p_queue_id AND status = 'pending';

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'queue entry not found or already resolved';
  END IF;

  -- Derive country from city if not explicitly provided
  IF p_country_id IS NULL AND p_city_id IS NOT NULL THEN
    SELECT country_id INTO v_country FROM public.cities WHERE id = p_city_id;
  ELSE
    v_country := p_country_id;
  END IF;

  UPDATE public.trips
  SET primary_city_id = p_city_id,
      primary_country_id = v_country
  WHERE id = v_trip_id;

  UPDATE public.trip_geo_review_queue
  SET status = 'resolved',
      resolved_city_id = p_city_id,
      resolved_country_id = v_country,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_queue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_trip_geo_review(UUID, UUID, UUID) TO authenticated;

-- ── Report: show backfill outcome ──────────────────────────────
DO $$
DECLARE
  v_matched INT;
  v_queued  INT;
BEGIN
  SELECT COUNT(*) INTO v_matched FROM public.trips WHERE primary_city_id IS NOT NULL;
  SELECT COUNT(*) INTO v_queued  FROM public.trip_geo_review_queue WHERE status = 'pending';
  RAISE NOTICE 'trips geo backfill: % matched, % queued for admin review', v_matched, v_queued;
END $$;

-- NOTE: NOT NULL + CHECK constraint is intentionally *not* added here.
-- After the review queue is cleared, run:
--   ALTER TABLE public.trips ALTER COLUMN primary_city_id SET NOT NULL;
--   ALTER TABLE public.trips ALTER COLUMN primary_country_id SET NOT NULL;
-- from a follow-up migration.
