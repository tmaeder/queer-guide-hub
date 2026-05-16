-- Phase 7 (Layer C) — Per-trip booking inbox + LLM-parsed items.
--
-- Users get an opt-in forwarding address `trip-<short_id>@inbox.queer.guide`.
-- A Cloudflare Email Worker receives forwarded confirmations, parses them
-- via Claude Haiku, and writes structured rows into trip_inbox_items.
-- A "slot it" action promotes a parsed item into reservations.

-- ----------------------------------------------------------------------------
-- 1. trip_inboxes — per-trip forwarding addresses (opt-in, revocable).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  short_id text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS trip_inboxes_trip_id_idx
  ON public.trip_inboxes(trip_id);

-- ----------------------------------------------------------------------------
-- 2. trip_inbox_items — parsed-but-not-yet-slotted booking confirmations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  raw_subject text,
  raw_from text,
  raw_body_encrypted bytea,
  parse_status text NOT NULL DEFAULT 'parsed'
    CHECK (parse_status IN ('pending','parsed','failed','slotted','dismissed')),
  parse_confidence numeric,
  parsed_type text
    CHECK (parsed_type IS NULL OR parsed_type IN (
      'lodging','flight','rail','restaurant','activity','unknown'
    )),
  parsed_vendor text,
  parsed_title text,
  parsed_start_at timestamptz,
  parsed_end_at timestamptz,
  parsed_location text,
  parsed_price numeric,
  parsed_currency text,
  parsed_confirmation text,
  slotted_reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_inbox_items_trip_id_status_idx
  ON public.trip_inbox_items(trip_id, parse_status);

-- ----------------------------------------------------------------------------
-- 3. RLS — only trip members may read; only members with edit may mutate.
--    Modeled after trip_places policies.
-- ----------------------------------------------------------------------------
ALTER TABLE public.trip_inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_inboxes_select ON public.trip_inboxes;
DROP POLICY IF EXISTS trip_inboxes_insert ON public.trip_inboxes;
DROP POLICY IF EXISTS trip_inboxes_update ON public.trip_inboxes;
DROP POLICY IF EXISTS trip_inboxes_delete ON public.trip_inboxes;

CREATE POLICY trip_inboxes_select ON public.trip_inboxes
  FOR SELECT USING (public.is_trip_member(trip_id, (SELECT auth.uid())));
CREATE POLICY trip_inboxes_insert ON public.trip_inboxes
  FOR INSERT WITH CHECK (public.can_edit_trip(trip_id, (SELECT auth.uid())));
CREATE POLICY trip_inboxes_update ON public.trip_inboxes
  FOR UPDATE USING (public.can_edit_trip(trip_id, (SELECT auth.uid())));
CREATE POLICY trip_inboxes_delete ON public.trip_inboxes
  FOR DELETE USING (public.can_edit_trip(trip_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS trip_inbox_items_select ON public.trip_inbox_items;
DROP POLICY IF EXISTS trip_inbox_items_insert ON public.trip_inbox_items;
DROP POLICY IF EXISTS trip_inbox_items_update ON public.trip_inbox_items;
DROP POLICY IF EXISTS trip_inbox_items_delete ON public.trip_inbox_items;

CREATE POLICY trip_inbox_items_select ON public.trip_inbox_items
  FOR SELECT USING (public.is_trip_member(trip_id, (SELECT auth.uid())));
-- Writes from worker/edge function go through service role and bypass RLS.
-- These INSERT/UPDATE/DELETE policies cover any future direct writes by users.
CREATE POLICY trip_inbox_items_insert ON public.trip_inbox_items
  FOR INSERT WITH CHECK (public.can_edit_trip(trip_id, (SELECT auth.uid())));
CREATE POLICY trip_inbox_items_update ON public.trip_inbox_items
  FOR UPDATE USING (public.can_edit_trip(trip_id, (SELECT auth.uid())));
CREATE POLICY trip_inbox_items_delete ON public.trip_inbox_items
  FOR DELETE USING (public.can_edit_trip(trip_id, (SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- 4. Extend reservations.source enum to include 'inbox' and 'paste'.
-- ----------------------------------------------------------------------------
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_source_check CHECK (source IN (
    'manual','imported_email','provider_api','scraper','inbox','paste'
  ));

-- ----------------------------------------------------------------------------
-- 5. Privacy cleanup — purge raw_body_encrypted 30d after trip end.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_trip_inbox_raw_bodies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH purged AS (
    UPDATE public.trip_inbox_items i
       SET raw_body_encrypted = NULL
      FROM public.trips t
     WHERE i.trip_id = t.id
       AND t.end_date IS NOT NULL
       AND t.end_date < (now() - interval '30 days')::date
       AND i.raw_body_encrypted IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM purged;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_trip_inbox_raw_bodies() FROM public;

-- Best-effort pg_cron schedule; ignore if extension absent. The same job
-- can be triggered from an edge function on a CF cron if pg_cron is off.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-trip-inbox-raw-bodies',
      '17 3 * * *',
      $cron$SELECT public.purge_trip_inbox_raw_bodies();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron schema may not be available even when extension is; ignore.
  NULL;
END$$;
