-- Venue centroid repair.
--
-- 7,740 venues sit on coordinates EXACTLY equal to their own city's centroid
-- (venues.latitude = cities.latitude AND venues.longitude = cities.longitude).
-- That is not a location, it is a placeholder wearing six decimal places. It
-- puts a pin on a map at a spot the venue is not, and it makes the distance
-- between two such venues 0 m — which is how it surfaced, via the village
-- stop list printing "~0 m" between consecutive stops.
--
-- There are two sources:
--
--   1. venue_coord_guard() itself, which on a coordinate >25 km from its city
--      with no usable address SNAPS the row to the city centroid (4,140 rows,
--      audited in venue_coord_fixes, original offsets 8 km to 19,040 km). The
--      intent was right — reject an absurd coordinate — but the remedy invents
--      a confident answer instead of admitting the coordinate is unknown.
--   2. An importer that defaulted to city coordinates (~3,600 rows).
--
-- This migration fixes the CAUSE first, then drains the backlog. Fixing only
-- the backlog would leave the guard re-manufacturing centroids forever.

-- ---------------------------------------------------------------------------
-- 1. The guard stops manufacturing a location it does not have.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venue_coord_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_guard_km constant double precision := 25.0;
  v_clat numeric; v_clng numeric;
  v_km   double precision;
  v_name_only boolean;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL OR NEW.city_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT latitude, longitude INTO v_clat, v_clng FROM public.cities WHERE id = NEW.city_id;
  IF v_clat IS NULL OR v_clng IS NULL THEN RETURN NEW; END IF;

  v_km := ST_DistanceSphere(ST_MakePoint(NEW.longitude::float, NEW.latitude::float),
                            ST_MakePoint(v_clng::float, v_clat::float)) / 1000.0;
  IF v_km <= v_guard_km THEN RETURN NEW; END IF;

  v_name_only := (NEW.address IS NULL
                  OR length(btrim(NEW.address)) < 6
                  OR lower(btrim(NEW.address)) = lower(btrim(coalesce(NEW.name,''))));

  IF v_name_only THEN
    -- WAS: snap to the city centroid. A centroid is a plausible-looking lie —
    -- it renders as a precise pin, it is indistinguishable from a real
    -- coordinate downstream, and every consumer (map, distance, "near me")
    -- treats it as fact. NULL is the honest representation of "the supplied
    -- coordinate is wrong and we do not know the right one", and it is also
    -- the state the forward geocoder looks for, so the row stays recoverable.
    INSERT INTO public.venue_coord_fixes
      (venue_id, mode, old_lat, old_lng, new_lat, new_lng, city_id, km_before, source)
    VALUES (NEW.id, 'null_unknown', NEW.latitude, NEW.longitude, NULL, NULL,
            NEW.city_id, round(v_km::numeric,2), 'guardrail');
    NEW.latitude  := NULL;
    NEW.longitude := NULL;
    NEW.needs_attention := true;
  ELSE
    NEW.needs_attention := true;
  END IF;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION public.venue_coord_guard() IS
  'Rejects a venue coordinate >25km from its city. With no usable address the '
  'coordinate is NULLed (not snapped to the city centroid — see migration '
  '20260827100000); with an address the row is flagged for review instead.';

-- Mirrors isUsableAddress() in supabase/functions/backfill-venue-cities.
-- Duplicated deliberately: the SQL runner must agree with the geocoder about
-- which rows are recoverable, and a cross-language import is not available.
CREATE OR REPLACE FUNCTION public.venue_address_is_usable(p_address text, p_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_address IS NULL THEN false
    WHEN lower(btrim(p_address)) = lower(btrim(coalesce(p_name,''))) THEN false
    WHEN length(btrim(p_address)) < 5 THEN false
    WHEN position(',' in p_address) = 0
         AND p_address !~ '[0-9]'
         AND array_length(regexp_split_to_array(btrim(p_address), '\s+'), 1) < 3 THEN false
    ELSE true
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Batched backlog drain.
-- ---------------------------------------------------------------------------
-- The batch cap is load-bearing. trg_search_documents_venue fires per row and
-- dominates the cost of a bulk venue UPDATE (a 300-row events UPDATE measured
-- 14.6s, 13.8s of it the equivalent search trigger). 200 is deliberately below
-- that; raising it risks a statement timeout, and a timeout is a full rollback.
CREATE OR REPLACE FUNCTION public.run_venue_centroid_repair(p_batch integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_nulled int := 0;
  v_requeued int := 0;
  v_batch int := least(greatest(coalesce(p_batch, 200), 1), 300);
BEGIN
  WITH target AS (
    SELECT v.id, v.latitude, v.longitude, v.city_id, v.address, v.name
    FROM public.venues v
    JOIN public.cities c ON c.id = v.city_id
    WHERE v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND v.latitude  = c.latitude
      AND v.longitude = c.longitude
      AND v.duplicate_of_id IS NULL
      -- one attempt per row, ever
      AND coalesce(v.enrichment_status->'centroid_repair'->>'state','') = ''
    ORDER BY v.id
    LIMIT v_batch
  ),
  audited AS (
    INSERT INTO public.venue_coord_fixes
      (venue_id, mode, old_lat, old_lng, new_lat, new_lng, city_id, km_before, source)
    SELECT t.id, 'null_unknown', t.latitude, t.longitude, NULL, NULL, t.city_id, 0, 'centroid_repair'
    FROM target t
    RETURNING venue_id
  ),
  updated AS (
    UPDATE public.venues v
    SET latitude  = NULL,
        longitude = NULL,
        needs_attention = true,
        -- Clearing geocode_attempted is what makes the row eligible for the
        -- forward geocoder again. Without it a row with a perfectly good
        -- address would sit at NULL forever, which is a worse state than the
        -- centroid it replaced.
        geocode_attempted = false,
        enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
          || jsonb_build_object('centroid_repair', jsonb_build_object(
               'state', 'nulled',
               'had_usable_address', public.venue_address_is_usable(t.address, t.name),
               'old_lat', t.latitude,
               'old_lng', t.longitude,
               'at', now()
             ))
    FROM target t
    WHERE v.id = t.id
    RETURNING v.id, public.venue_address_is_usable(t.address, t.name) AS usable
  )
  SELECT count(*) FILTER (WHERE NOT usable), count(*) FILTER (WHERE usable)
  INTO v_nulled, v_requeued
  FROM updated;

  RETURN jsonb_build_object(
    'nulled_no_address', v_nulled,
    'nulled_awaiting_geocode', v_requeued,
    'batch', v_batch
  );
END $function$;

REVOKE ALL ON FUNCTION public.run_venue_centroid_repair(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_venue_centroid_repair(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Registry row FIRST, then the cron — admin_automations is the registry of
--    record and sync_automations_to_cron() reconciles against it.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
VALUES (
  'venue_centroid_repair',
  'venue_centroid_repair',
  'Nulls venue coordinates that exactly equal their city centroid. Rows with a usable address become eligible for the forward geocoder; the rest are honestly empty instead of falsely precise.',
  'system',
  true,
  jsonb_build_object('type','schedule'),
  '20 * * * *',
  jsonb_build_object(
    'type','cron',
    'command','SELECT public.run_venue_centroid_repair(200)',
    'jobname','venue_centroid_repair'
  )
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = true;

-- Hourly, not nightly: 7,335 rows at 200/run drains in ~37 hours instead of
-- ~37 nights. The per-run cap is what protects the search-sync trigger; the
-- frequency does not, so there is no reason to also be slow.
SELECT cron.schedule('venue_centroid_repair', '20 * * * *',
                     'SELECT public.run_venue_centroid_repair(200)')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_centroid_repair');
