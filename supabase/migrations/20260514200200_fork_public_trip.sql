-- fork_public_trip: copy a public trip into the caller's account.
--
-- Copies: title (prefixed "Forked: "), description, cover, dates, primary
-- city/country/currency/timezone, all trip_days (with date offset preserved),
-- all trip_places (mapped onto cloned days). Sets status='planning',
-- is_public=false, owner_id=caller. Bumps trips.fork_count on the source.
-- Returns the new trip id.
--
-- Authorization: caller must be authenticated; source must be is_public=true.

CREATE OR REPLACE FUNCTION public.fork_public_trip(p_source_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source public.trips%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_source FROM public.trips WHERE id = p_source_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_source.is_public THEN
    RAISE EXCEPTION 'source trip is not public' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.trips (
    owner_id, title, description, cover_image_url,
    start_date, end_date, currency, timezone,
    primary_city_id, primary_country_id,
    status, is_public
  ) VALUES (
    v_uid,
    'Forked: ' || coalesce(v_source.title, 'Trip'),
    v_source.description,
    v_source.cover_image_url,
    v_source.start_date,
    v_source.end_date,
    coalesce(v_source.currency, 'EUR'),
    v_source.timezone,
    v_source.primary_city_id,
    v_source.primary_country_id,
    'planning',
    false
  ) RETURNING id INTO v_new_id;

  -- Clone days. Preserve (date, title, notes, sort_order). Build a map
  -- old_day_id -> new_day_id so we can rewire trip_places.day_id.
  WITH src AS (
    SELECT id AS old_id, "date", title, notes, sort_order
    FROM public.trip_days
    WHERE trip_id = p_source_trip_id
  ), ins AS (
    INSERT INTO public.trip_days (trip_id, "date", title, notes, sort_order)
    SELECT v_new_id, "date", title, notes, sort_order FROM src
    RETURNING id, "date", sort_order
  )
  INSERT INTO public.trip_places (
    trip_id, day_id, venue_id, event_id, hotel_id,
    custom_name, custom_address, latitude, longitude,
    city_id, country_id, start_time, end_time, duration_minutes,
    notes, category, sort_order, created_by
  )
  SELECT
    v_new_id,
    (SELECT i.id FROM ins i
       JOIN public.trip_days d_old ON d_old.id = p.day_id
      WHERE i."date" = d_old."date" AND i.sort_order = d_old.sort_order
      LIMIT 1),
    p.venue_id, p.event_id, p.hotel_id,
    p.custom_name, p.custom_address, p.latitude, p.longitude,
    p.city_id, p.country_id, p.start_time, p.end_time, p.duration_minutes,
    p.notes, p.category, p.sort_order, v_uid
  FROM public.trip_places p
  WHERE p.trip_id = p_source_trip_id;

  UPDATE public.trips
    SET fork_count = fork_count + 1
    WHERE id = p_source_trip_id;

  RETURN v_new_id;
END
$$;

REVOKE ALL ON FUNCTION public.fork_public_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fork_public_trip(uuid) TO authenticated;
