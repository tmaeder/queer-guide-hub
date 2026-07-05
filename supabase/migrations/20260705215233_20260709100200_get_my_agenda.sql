-- Shim for a self-inflicted drift: `supabase.apply_migration`'s `name` param is
-- NOT the migration version — the MCP tool auto-generates the version from the
-- call's own timestamp and stores the passed `name` verbatim in the history
-- row's name column. Passing name="20260709100200_get_my_agenda" (intending to
-- match this repo's file) actually recorded remote version 20260705215233 with
-- that string as its *name* — a version this repo had no file for, so plain
-- `db push`'s drift guard ("Remote migration versions not found in local
-- migrations directory") skipped every subsequent push, re-blocking
-- deploy-supabase-functions right after #2011 unblocked it.
--
-- This file exists purely so the local file list matches remote history for
-- version 20260705215233 — db push sees it as already-applied and moves on.
-- The real, canonically-versioned migration is
-- 20260709100200_get_my_agenda.sql (content identical; CREATE OR REPLACE is
-- idempotent, so both applying).

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
  -- Postgres names a UNION's output columns after the FIRST branch, so this
  -- branch must alias every column to the RETURNS TABLE names for `ORDER BY
  -- starts_at` below to resolve (bare SELECT lists on later branches don't
  -- matter). Prod bug: unaliased original raised 42703 "column starts_at
  -- does not exist" on every db push, blocking deploy-supabase-functions.
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
  ORDER BY starts_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_agenda(timestamptz, timestamptz) TO authenticated;
