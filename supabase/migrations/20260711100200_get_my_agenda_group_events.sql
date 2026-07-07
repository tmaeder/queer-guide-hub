-- Hub redesign, Phase 1 (cont'd) — group events in the unified calendar.
--
-- get_my_agenda() currently unions trips + reservations + event RSVPs +
-- dated saved events. Events belonging to a group (events.group_id) weren't
-- surfaced unless the viewer had also personally RSVP'd. Add a 5th branch:
-- every active event belonging to any group the viewer is a member of,
-- deduped against BOTH prior event branches (it's the last branch in the
-- UNION, so it must check both event_attendees and event_favorites to avoid
-- double-listing an event the viewer both saved/RSVP'd to and whose group
-- they're also in).
--
-- Bounded by the same p_from/p_to window as every other branch; both join
-- columns (events.group_id, group_memberships(user_id, group_id)) are
-- already indexed (idx_events_group_id, idx_group_memberships_user_group) —
-- no new index needed. Read-time UNION on a STABLE function, not a write
-- path, so no risk of the trigger-storm class of incident seen elsewhere in
-- this project's history.

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
  SELECT 'trip_' || t.id::text AS id, 'trip'::text AS kind, t.title AS title,
         t.primary_city_name AS subtitle, t.start_date::timestamptz AS starts_at,
         t.end_date::timestamptz AS ends_at, true AS all_day,
         t.status AS status, '/trips/' || t.id::text AS open_target
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
  UNION ALL
  -- group events (every active event belonging to a group the viewer is a
  -- member of, excluding ones already surfaced via the RSVP or saved
  -- branches above)
  SELECT 'grpevt_' || e.id::text, 'group_event', e.title, cg.name,
         e.start_date, e.end_date, false, e.status, '/events/' || e.slug
    FROM public.events e
    JOIN public.community_groups cg ON cg.id = e.group_id
    JOIN public.group_memberships gm
      ON gm.group_id = e.group_id AND gm.user_id = auth.uid()
   WHERE e.group_id IS NOT NULL
     AND e.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.event_attendees ea3
        WHERE ea3.event_id = e.id AND ea3.user_id = auth.uid()
          AND ea3.status IN ('going','interested'))
     AND NOT EXISTS (
       SELECT 1 FROM public.event_favorites f3
        WHERE f3.event_id = e.id AND f3.user_id = auth.uid())
     AND e.start_date IS NOT NULL
     AND e.start_date <= p_to
     AND COALESCE(e.end_date, e.start_date) >= p_from
  ORDER BY starts_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) TO authenticated;
