-- Unified personal agenda for the /hub Calendar module (workstream C2).
--
-- One SECURITY DEFINER RPC that UNIONs the viewer's dated commitments —
-- trips + reservations + event RSVPs + dated saved events — into a single
-- ordered list. No new tables (the DB is disk-constrained); auth.uid()-gated
-- internally, so anon gets zero rows. Mirrors the hardened get_inbox_feed
-- pattern. Dates: trips.start_date/end_date are DATE; events.* and
-- reservations.* are timestamptz.

CREATE OR REPLACE FUNCTION public.get_my_agenda(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  id text,
  kind text,
  title text,
  subtitle text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  status text,
  open_target text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  -- trips (owner's planning/active trips overlapping the window)
  SELECT 'trip_' || t.id::text, 'trip', t.title, t.primary_city_name,
         t.start_date::timestamptz, t.end_date::timestamptz, true,
         t.status, '/trips/' || t.id::text
    FROM public.trips t
   WHERE t.owner_id = auth.uid()
     AND t.status IN ('planning','active')
     AND t.start_date IS NOT NULL
     AND t.start_date::timestamptz <= p_to
     AND COALESCE(t.end_date, t.start_date)::timestamptz >= p_from
  UNION ALL
  -- reservations (booked, not cancelled/failed)
  SELECT 'res_' || r.id::text, 'reservation', r.title, r.provider,
         r.start_at, r.end_at, false, r.status,
         COALESCE('/trips/' || r.trip_id::text, '/hub/trips')
    FROM public.reservations r
   WHERE r.user_id = auth.uid()
     AND r.status NOT IN ('cancelled','failed')
     AND r.start_at IS NOT NULL
     AND r.start_at <= p_to
     AND COALESCE(r.end_at, r.start_at) >= p_from
  UNION ALL
  -- event RSVPs (going / interested)
  SELECT 'att_' || ea.id::text, 'event_rsvp', e.title, NULL,
         e.start_date, e.end_date, false, ea.status, '/events/' || e.slug
    FROM public.event_attendees ea
    JOIN public.events e ON e.id = ea.event_id
   WHERE ea.user_id = auth.uid()
     AND ea.status IN ('going','interested')
     AND e.start_date IS NOT NULL
     AND e.start_date <= p_to
     AND COALESCE(e.end_date, e.start_date) >= p_from
  UNION ALL
  -- saved events with a date (excluding ones already covered by an RSVP)
  SELECT 'fav_' || f.id::text, 'event_saved', e.title, NULL,
         e.start_date, e.end_date, false, 'saved', '/events/' || e.slug
    FROM public.event_favorites f
    JOIN public.events e ON e.id = f.event_id
   WHERE f.user_id = auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.event_attendees ea2
        WHERE ea2.event_id = f.event_id AND ea2.user_id = auth.uid()
          AND ea2.status IN ('going','interested'))
     AND e.start_date IS NOT NULL
     AND e.start_date <= p_to
     AND COALESCE(e.end_date, e.start_date) >= p_from
  ORDER BY starts_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) TO authenticated;
