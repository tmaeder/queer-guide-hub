-- Repair a city's country_id, and repropagate the consequences.
--
-- 100 live cities sit >2,500 km from their assigned country while being
-- <600 km from a different one; 343 are suspect on a looser bar. The cause was
-- match_personality_city() filing a birthplace under the person's NATIONALITY
-- (fixed in 20260811100100). The coordinates are trustworthy — they came later
-- from Wikipedia via city-factual-backfill and are recorded in
-- field_provenance.coords — so a reverse geocode of the stored point is the
-- evidence, and country_id is what has to move.
--
-- WHY THIS IS NOT A PLAIN UPDATE. `cities.country_id` feeds
-- location_is_high_risk() -> safety_gated on venues, events, organizations,
-- hotels and guides. There is NO trigger on `cities` that repropagates a
-- country change: pg_trigger on cities carries only cities_maintain_normalized,
-- auto_slug_from_name, erq_cascade_delete and sync_geo_spine_city. So
-- `UPDATE cities SET country_id = ...` leaves every attached row pointing at
-- the old country with a stale gate — which can leave content in a
-- criminalizing country publicly visible, the exact failure 20260807100200
-- documented for venues.
--
-- The children are re-derived by naming `city_id` in the SET list. That is
-- deliberate and load-bearing: trg_*_safety_gated is scoped
-- BEFORE UPDATE OF country_id, city_id, and a column-scoped trigger fires on
-- the columns named in the UPDATE STATEMENT, not on what a BEFORE trigger
-- mutated. Assigning city_id to itself is the cheapest way to name it.

CREATE OR REPLACE FUNCTION public.city_geo_conflicts(p_limit int DEFAULT 500)
RETURNS TABLE (
  city_id          uuid,
  name             text,
  assigned_country text,
  assigned_code    text,
  km_to_assigned   int,
  km_to_nearest    int,
  nearest_country  text,
  nearest_code     text,
  latitude         numeric,
  longitude        numeric,
  n_venues         int,
  n_events         int,
  n_hotels         int,
  n_orgs           int,
  n_people         int,
  severity         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH live AS (
    SELECT c.id, c.name, c.country_id, c.latitude, c.longitude
      FROM public.cities c
     WHERE c.duplicate_of_id IS NULL
       AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  ),
  d AS (
    SELECT l.*,
           ca.name AS assigned_country, ca.code AS assigned_code,
           (public.haversine_m(l.latitude, l.longitude, ca.latitude, ca.longitude) / 1000)::int AS km_a,
           n.name AS nearest_country, n.code AS nearest_code,
           (public.haversine_m(l.latitude, l.longitude, n.latitude, n.longitude) / 1000)::int AS km_n
      FROM live l
      JOIN public.countries ca ON ca.id = l.country_id AND ca.latitude IS NOT NULL
      -- Nearest country by centroid. Crude for large countries, which is why
      -- this only SELECTS candidates: the verdict comes from a reverse geocode.
      CROSS JOIN LATERAL (
        SELECT c2.name, c2.code, c2.latitude, c2.longitude
          FROM public.countries c2
         WHERE c2.latitude IS NOT NULL AND c2.duplicate_of_id IS NULL
         ORDER BY public.haversine_m(l.latitude, l.longitude, c2.latitude, c2.longitude)
         LIMIT 1
      ) n
  )
  SELECT d.id, d.name, d.assigned_country, d.assigned_code, d.km_a, d.km_n,
         d.nearest_country, d.nearest_code, d.latitude, d.longitude,
         (SELECT count(*)::int FROM public.venues v WHERE v.city_id = d.id),
         (SELECT count(*)::int FROM public.events e WHERE e.city_id = d.id),
         (SELECT count(*)::int FROM public.hotels h WHERE h.city_id = d.id),
         (SELECT count(*)::int FROM public.organizations o WHERE o.city_id = d.id),
         (SELECT count(*)::int FROM public.personalities p WHERE p.city_id = d.id),
         CASE WHEN d.km_a > 2500 AND d.km_n < 600 THEN 'hard' ELSE 'suspect' END
    FROM d
   WHERE (d.km_a > 2500 AND d.km_n < 600)
      OR (d.km_a > 1200 AND d.km_a - d.km_n > 1000)
   ORDER BY d.km_a DESC
   LIMIT greatest(p_limit, 0);
$$;

COMMENT ON FUNCTION public.city_geo_conflicts(int) IS
  'Cities whose stored coordinates disagree with their assigned country. '
  'Candidate list only -- centroid distance cannot adjudicate a large country, '
  'so a reverse geocode decides. Powers repair-city-countries.mjs and the '
  '/admin/cities geography card.';

REVOKE ALL ON FUNCTION public.city_geo_conflicts(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.city_geo_conflicts(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_city_country_repair(
  p_city_id    uuid,
  p_country_id uuid,
  p_evidence   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_country uuid;
  v_city_name   text;
  v_counts      jsonb := '{}'::jsonb;
  n             int;
BEGIN
  -- auth.uid() IS NULL means service_role / a cron, which is trusted here.
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.country_id, c.name INTO v_old_country, v_city_name
    FROM public.cities c WHERE c.id = p_city_id;

  IF v_city_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'city_not_found', 'id', p_city_id);
  END IF;
  IF p_country_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'country_required', 'id', p_city_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries co
                  WHERE co.id = p_country_id AND co.duplicate_of_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_country', 'id', p_city_id);
  END IF;
  IF v_old_country = p_country_id THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'id', p_city_id);
  END IF;

  UPDATE public.cities c
     SET country_id = p_country_id,
         needs_attention = false,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
           || jsonb_build_object('country_id', jsonb_build_object(
                'value', p_country_id,
                'source', coalesce(p_evidence->>'source', 'derived:country_repair'),
                'previous', v_old_country,
                'evidence', p_evidence,
                'at', now())),
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('country_repair', jsonb_build_object(
                'state', 'resolved', 'at', now())),
         updated_at = now()
   WHERE c.id = p_city_id;

  -- Repropagate by writing country_id EXPLICITLY.
  --
  -- `SET city_id = city_id` was tried first and silently does nothing useful:
  -- derive_entity_geo_address() only re-derives country_id from the city when
  -- `new.city_id IS DISTINCT FROM old.city_id`, which compares VALUES, and
  -- assigning a column to itself does not change it. set_entity_safety_gated()
  -- then evaluated location_is_high_risk() against the STALE country_id and
  -- left the gate open. Measured: moving a 3-venue city into the United Arab
  -- Emirates produced venues_gated 0 -> 0. Naming the column in the SET list is
  -- enough to FIRE a column-scoped trigger but not to change what it computes.
  --
  -- Assigning country_id sets v_fk_explicit in the derive function, which keeps
  -- our value, refreshes the `country` text, and recomputes safety_gated from
  -- the country that actually changed.
  UPDATE public.venues        SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('venues', n);
  UPDATE public.events        SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('events', n);
  UPDATE public.hotels        SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('hotels', n);
  UPDATE public.organizations SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('organizations', n);
  -- guides have no country_id: set_guide_safety_gated() calls
  -- location_is_high_risk(NULL, NEW.city_id) and resolves the country through
  -- the city, reading it fresh -- so naming city_id IS sufficient here.
  UPDATE public.guides        SET city_id = city_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('guides', n);

  -- No safety gate on these two, but their denormalized country must follow.
  UPDATE public.queer_villages SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('queer_villages', n);
  -- personalities.city_id is a BIRTHPLACE; country_id is the birth country.
  UPDATE public.personalities  SET country_id = p_country_id WHERE city_id = p_city_id;
  GET DIAGNOSTICS n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('personalities', n);

  INSERT INTO public.city_quality_signals (city_id, signal_type, source, value, details)
  VALUES (p_city_id, 'enrichment',
          coalesce(p_evidence->>'source', 'country_repair'), 1,
          jsonb_build_object('kind', 'country_repair', 'from', v_old_country,
                             'to', p_country_id, 'evidence', p_evidence,
                             'repropagated', v_counts));

  RETURN jsonb_build_object('ok', true, 'changed', true, 'id', p_city_id,
                            'city', v_city_name, 'from', v_old_country,
                            'to', p_country_id, 'repropagated', v_counts);
END;
$$;

COMMENT ON FUNCTION public.apply_city_country_repair(uuid, uuid, jsonb) IS
  'Moves a city between countries AND re-derives country_id + safety_gated on '
  'every attached venue/event/hotel/organization/guide. Never UPDATE '
  'cities.country_id directly -- nothing else repropagates the safety gate.';

REVOKE ALL ON FUNCTION public.apply_city_country_repair(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_city_country_repair(uuid, uuid, jsonb) TO service_role;
