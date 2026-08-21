-- Security fix: venue_checkins exposed precise GPS coordinates to other users.
--
-- get_secure_venue_checkins() was a stub ("RETURN '[]'::JSON"), so the app's own
-- "secure" read path returned nothing — but the underlying table's RLS policy
-- ("Venue checkins read") independently permits any authenticated user to SELECT a
-- public check-in belonging to anyone they have an accepted user_relationships row
-- with, and the table grant is unrestricted, so a direct PostgREST query bypassed
-- the dead RPC entirely and returned raw latitude/longitude (numeric(10,8)/(11,8) —
-- sub-meter precision). That is a real-world-location leak on a platform whose
-- threat model is specifically outing/physical-safety risk.
--
-- calculate_secure_venue_distance() was also a stub ("RETURN 0.0"), so the 100m
-- proximity check in checkInAtVenue() always passed regardless of actual location —
-- check-ins asserting "physically at venue X" were unverified, which undermines the
-- one signal that made a public check-in meaningful to show anyone else at all.

-- 1. Column-level lockdown: no client role may ever read raw coordinates directly,
--    regardless of which row-level policy would otherwise let the row through.
--    Everything the frontend currently selects directly (useVenuesV2Data.ts's
--    `venue_id, checked_in_at` own-rows query) stays unaffected; all cross-user
--    reads go through the RPC below, which runs SECURITY DEFINER and so is not
--    subject to this column grant.
REVOKE SELECT ("latitude", "longitude") ON TABLE "public"."venue_checkins" FROM "authenticated";

-- 2. Cleanup: anon was granted INSERT/UPDATE/DELETE (never SELECT) on this table.
--    RLS policies are all scoped `TO authenticated`, so this was never reachable by
--    an anon-key request (no permissive policy matches the anon role), but it's the
--    same "DEFAULT PRIVILEGES armed every new object" pattern documented elsewhere
--    in this schema and should not be left lying around.
REVOKE INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, MAINTAIN, UPDATE
  ON TABLE "public"."venue_checkins" FROM "anon";

-- 3. Real implementation. Precise coordinates are returned ONLY to the check-in's
--    own owner or an admin; every other visible row (public + accepted relationship)
--    gets location_data = null and can_view_precise_location = false. There is
--    nothing between "exact GPS" and "nothing" here on purpose — the venue itself
--    already conveys where the check-in happened, so a fuzzed midpoint would add
--    false precision, not privacy.
CREATE OR REPLACE FUNCTION "public"."get_secure_venue_checkins"("venue_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_result json;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_data), '[]'::json) INTO v_result
  FROM (
    SELECT json_build_object(
      'id', vc.id,
      'venue_id', vc.venue_id,
      'user_id', vc.user_id,
      'checked_in_at', vc.checked_in_at,
      'distance_meters', vc.distance_meters,
      'is_public', vc.is_public,
      'can_view_precise_location', can_view_precise,
      'location_data', CASE WHEN can_view_precise
        THEN json_build_object('latitude', vc.latitude, 'longitude', vc.longitude, 'precise', true)
        ELSE NULL
      END
    ) AS row_data
    FROM public.venue_checkins vc
    CROSS JOIN LATERAL (
      SELECT (vc.user_id = v_viewer OR public.has_role_jwt('admin'::public.app_role)) AS can_view_precise
    ) perm
    WHERE (get_secure_venue_checkins.venue_id IS NULL OR vc.venue_id = get_secure_venue_checkins.venue_id)
      AND (
        vc.user_id = v_viewer
        OR public.has_role_jwt('admin'::public.app_role)
        OR (
          vc.is_public = true
          AND EXISTS (
            SELECT 1 FROM public.user_relationships ur
            WHERE (
              (ur.user_id = v_viewer AND ur.target_user_id = vc.user_id)
              OR (ur.user_id = vc.user_id AND ur.target_user_id = v_viewer)
            )
            AND ur.status = 'accepted'
          )
        )
      )
    ORDER BY vc.checked_in_at DESC
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_secure_venue_checkins"("venue_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_secure_venue_checkins"("venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_secure_venue_checkins"("venue_id" "uuid") TO "service_role";

-- 4. Real proximity check, replacing the "RETURN 0.0" stub. Haversine distance in
--    meters between the caller's reported position and the venue's stored
--    coordinates. A venue with no coordinates on file fails closed (large distance)
--    rather than silently passing every check-in.
CREATE OR REPLACE FUNCTION "public"."calculate_secure_venue_distance"("venue_id" "uuid", "user_lat" double precision, "user_lng" double precision) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  v_earth_radius_m constant double precision := 6371000;
  v_dlat double precision;
  v_dlng double precision;
  v_a double precision;
BEGIN
  SELECT v.latitude, v.longitude INTO v_lat, v_lng
  FROM public.venues v
  WHERE v.id = calculate_secure_venue_distance.venue_id;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN 999999.0;
  END IF;

  v_dlat := radians(v_lat - user_lat);
  v_dlng := radians(v_lng - user_lng);
  v_a := sin(v_dlat / 2) ^ 2
    + cos(radians(user_lat)) * cos(radians(v_lat)) * sin(v_dlng / 2) ^ 2;

  RETURN v_earth_radius_m * 2 * atan2(sqrt(v_a), sqrt(1 - v_a));
END;
$$;
