-- Venue ↔ city coordinate consistency
-- ====================================
-- Problem: a venue's map pin (venues.latitude/longitude) and its city label
-- (city_id -> cities.name) are independent. When coords are wrong (geocoded
-- from a name-only address, or a bad source coord) the pin lands in a different
-- town than the linked city. Example: Kosmos-Kultur AG labelled Zürich, pin ~15km
-- away (nearest Baden). ~2.7k venues sit >30km from their linked city.
--
-- Principle: city_id is the TRUSTED signal; coordinates are untrusted.
-- We fix coordinates, never relink city_id (that would move Kosmos to Baden).
--
-- This migration provides:
--   1. venue_coord_fixes        — append-only audit of every coord change
--   2. venues_misplaced(limit)  — pure-SQL detection (nearest-city rule)
--   3. run_venue_coord_snap()   — snaps name-only misplaced venues to city center
--                                 (nightly automation + one-off cleanup driver)
--   4. dispatch + cron registration (active, idempotent, self-healing)
-- Re-geocoding of venues that DO have a real street address is handled out of
-- band by scripts/data-cleanup/fix-venue-misplaced-coords.mjs.

-- ===== thresholds (edit to retune) =====
--   MIN_KM (8)  : a venue must be at least this far from its linked city to be
--                 suspect — protects venues legitimately spread across a metro.
--   HARD_KM (50): beyond this the pin is wrong regardless of nearby cities
--                 (live data has venues 7000–18000 km from their linked city).
-- A venue is "misplaced" when it is >MIN_KM from its linked city AND EITHER
--   (a) it is >HARD_KM out, OR
--   (b) some *other* city is strictly closer to the pin than the linked city.
-- Kosmos: 15.1km to Zürich, 13.9km to Baden -> Baden closer -> flagged.

-- ===== 1. audit table =====
CREATE TABLE IF NOT EXISTS public.venue_coord_fixes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id    uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  mode        text NOT NULL,                 -- 'snap_to_city' | 'regeocode' | 'manual'
  old_lat     numeric, old_lng numeric,
  new_lat     numeric, new_lng numeric,
  city_id     uuid,
  km_before   numeric,                       -- distance to linked city before fix
  source      text NOT NULL DEFAULT 'snap',  -- 'snap' (this fn) | 'script' | 'guardrail'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_coord_fixes_venue_idx ON public.venue_coord_fixes(venue_id);
ALTER TABLE public.venue_coord_fixes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venue_coord_fixes_admin_read ON public.venue_coord_fixes;
CREATE POLICY venue_coord_fixes_admin_read ON public.venue_coord_fixes
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));

-- ===== 2. detection: venues whose pin is in a different city =====
-- Returns misplaced live venues. is_geocodable = has a usable street address
-- (so the cleanup script can re-geocode it instead of snapping).
CREATE OR REPLACE FUNCTION public.venues_misplaced(p_limit int DEFAULT NULL)
RETURNS TABLE (
  venue_id uuid, name text, address text, is_geocodable boolean,
  city_id uuid, city_name text, country_id uuid,
  km_to_linked numeric, nearest_other_city text, km_to_nearest numeric,
  cur_lat numeric, cur_lng numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH base AS (
    SELECT v.id, v.name, v.address,
           (v.address IS NOT NULL
            AND length(btrim(v.address)) >= 6
            AND lower(btrim(v.address)) <> lower(btrim(v.name))) AS is_geocodable,
           v.city_id, c.name AS city_name,
           coalesce(v.country_id, c.country_id) AS eff_country_id,
           v.latitude::float AS vlat, v.longitude::float AS vlng,
           ST_DistanceSphere(ST_MakePoint(v.longitude::float, v.latitude::float),
                             ST_MakePoint(c.longitude::float, c.latitude::float))/1000.0 AS km_linked
    FROM public.venues v
    JOIN public.cities c ON c.id = v.city_id
    WHERE v.duplicate_of_id IS NULL
      AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
      AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  ),
  near AS (
    SELECT b.*, n.name AS other_name, n.km AS other_km
    FROM base b
    LEFT JOIN LATERAL (
      SELECT c2.name,
             ST_DistanceSphere(ST_MakePoint(b.vlng, b.vlat),
                               ST_MakePoint(c2.longitude::float, c2.latitude::float))/1000.0 AS km
      FROM public.cities c2
      WHERE c2.id <> b.city_id
        AND c2.latitude IS NOT NULL AND c2.longitude IS NOT NULL
        AND (b.eff_country_id IS NULL OR c2.country_id = b.eff_country_id)
      ORDER BY ST_MakePoint(c2.longitude::float, c2.latitude::float) <-> ST_MakePoint(b.vlng, b.vlat)
      LIMIT 1
    ) n ON true
    WHERE b.km_linked > 8.0                                    -- MIN_KM
      AND ( b.km_linked > 50.0                                 -- HARD_KM: far outright
            OR (n.km IS NOT NULL AND n.km < b.km_linked)       -- another city is closer
          )
  )
  SELECT id, name, address, is_geocodable, city_id, city_name, eff_country_id,
         round(km_linked::numeric,2), other_name, round(other_km::numeric,2),
         vlat::numeric, vlng::numeric
  FROM near
  ORDER BY km_linked DESC
  LIMIT p_limit;
$$;
ALTER FUNCTION public.venues_misplaced(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.venues_misplaced(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venues_misplaced(int) TO service_role, authenticated;

-- ===== 3. snap name-only misplaced venues to their linked city center =====
-- Only touches venues that are NOT geocodable (just a name, no street). Venues
-- with a real address are left for re-geocoding by the cleanup script.
CREATE OR REPLACE FUNCTION public.run_venue_coord_snap()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'venue_coord_snap';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'venue_coord_snap', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH targets AS (
    SELECT m.venue_id, m.city_id, m.km_to_linked, m.cur_lat, m.cur_lng,
           c.latitude AS clat, c.longitude AS clng
    FROM public.venues_misplaced(NULL) m
    JOIN public.cities c ON c.id = m.city_id
    WHERE m.is_geocodable = false
      AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  ),
  logged AS (
    INSERT INTO public.venue_coord_fixes
      (venue_id, mode, old_lat, old_lng, new_lat, new_lng, city_id, km_before, source)
    SELECT venue_id, 'snap_to_city', cur_lat, cur_lng, clat, clng, city_id, km_to_linked, 'snap'
    FROM targets
    RETURNING venue_id
  ),
  upd AS (
    UPDATE public.venues v
      SET latitude = t.clat, longitude = t.clng, last_refreshed_at = now()
    FROM targets t
    WHERE v.id = t.venue_id
    RETURNING v.id
  )
  SELECT count(*) INTO v_changed FROM upd;

  SELECT count(*) INTO v_examined FROM public.venues_misplaced(NULL);

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('snapped',v_changed,'still_misplaced',v_examined) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('snapped',v_changed,'still_misplaced',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_venue_coord_snap() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_venue_coord_snap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_venue_coord_snap() TO service_role, authenticated;

-- ===== 4. register automation (ACTIVE — snap is safe + idempotent) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('venue_coord_snap','Snap misplaced venue pins to city center',
   'Nightly: venues whose pin falls in a different city than their linked city AND have no usable street address are snapped to the linked city center. Audited in venue_coord_fixes.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_venue_coord_snap"}'::jsonb, '30 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 5. extend dispatch RPCs =====
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
  ELSIF p_slug = 'venue_coord_snap' THEN v_result := public.run_venue_coord_snap();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE status='active' AND end_date IS NOT NULL AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending' AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSIF p_slug = 'enrichment_log_purge' THEN
    SELECT count(*) INTO v_examined FROM public.enrichment_log
    WHERE status IN ('skipped','done') AND created_at < now() - interval '30 days';
  ELSIF p_slug = 'event_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  ELSIF p_slug = 'event_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE is_major_city = true;
  ELSIF p_slug = 'venue_coord_snap' THEN
    SELECT count(*) INTO v_examined FROM public.venues_misplaced(NULL) WHERE is_geocodable = false;
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 6. cron =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='venue_coord_snap') THEN PERFORM cron.unschedule('venue_coord_snap'); END IF;
END $$;
SELECT cron.schedule('venue_coord_snap', '30 3 * * *', 'SELECT public.run_venue_coord_snap();');
