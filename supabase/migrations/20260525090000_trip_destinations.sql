-- Trip Destinations (Phase 1 of editorial + travel redesign)
-- First-class "destinations" layer on top of trips. A trip "to Lisbon & Porto" gets
-- structural notion of each destination with its own date sub-range, enabling
-- per-destination scoped itinerary auto-generation and cross-trip co-visit signals.
--
-- Additive only. Existing trip_days / trip_places keep working with NULL destination_id
-- until the backfill assigns them.

-- ============================================================
-- Table
-- ============================================================
CREATE TABLE public.trip_destinations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  city_id     UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  country_id  UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  village_id  UUID REFERENCES public.queer_villages(id) ON DELETE SET NULL,
  arrive_date DATE,
  depart_date DATE,
  sort_order  INT NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_destinations_one_entity CHECK (
    (city_id IS NOT NULL)::int + (country_id IS NOT NULL)::int + (village_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT trip_destinations_date_order CHECK (
    arrive_date IS NULL OR depart_date IS NULL OR arrive_date <= depart_date
  )
);

ALTER TABLE public.trip_days
  ADD COLUMN destination_id UUID REFERENCES public.trip_destinations(id) ON DELETE SET NULL;

ALTER TABLE public.trip_places
  ADD COLUMN destination_id UUID REFERENCES public.trip_destinations(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_trip_destinations_trip       ON public.trip_destinations(trip_id, sort_order);
CREATE INDEX idx_trip_destinations_city       ON public.trip_destinations(city_id)    WHERE city_id    IS NOT NULL;
CREATE INDEX idx_trip_destinations_country    ON public.trip_destinations(country_id) WHERE country_id IS NOT NULL;
CREATE INDEX idx_trip_destinations_village    ON public.trip_destinations(village_id) WHERE village_id IS NOT NULL;
CREATE INDEX idx_trip_days_destination        ON public.trip_days(destination_id)     WHERE destination_id IS NOT NULL;
CREATE INDEX idx_trip_places_destination      ON public.trip_places(destination_id)   WHERE destination_id IS NOT NULL;

-- ============================================================
-- updated_at trigger (reuses existing trip_update_timestamp())
-- ============================================================
CREATE TRIGGER trg_trip_destinations_updated_at
  BEFORE UPDATE ON public.trip_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_update_timestamp();

-- ============================================================
-- RPC: assign overlapping trip_days to a destination by date range
-- Idempotent. Called after insert / update of a destination's date range.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_days_to_destination(
  p_destination_id UUID,
  p_arrive DATE,
  p_depart DATE
) RETURNS INT AS $$
DECLARE
  v_trip_id UUID;
  v_updated INT;
BEGIN
  SELECT trip_id INTO v_trip_id FROM public.trip_destinations WHERE id = p_destination_id;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'destination % not found', p_destination_id;
  END IF;

  IF NOT public.can_edit_trip(v_trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Clear stale assignments for this destination outside the new range
  UPDATE public.trip_days
     SET destination_id = NULL
   WHERE destination_id = p_destination_id
     AND (p_arrive IS NULL OR p_depart IS NULL OR date NOT BETWEEN p_arrive AND p_depart);

  -- Assign days inside the range that aren't already pinned to a different destination
  IF p_arrive IS NOT NULL AND p_depart IS NOT NULL THEN
    UPDATE public.trip_days
       SET destination_id = p_destination_id
     WHERE trip_id = v_trip_id
       AND date BETWEEN p_arrive AND p_depart
       AND (destination_id IS NULL OR destination_id = p_destination_id);
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.assign_days_to_destination(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_days_to_destination(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.trip_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_destinations_select ON public.trip_destinations FOR SELECT USING (
  public.is_trip_member(trip_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_public)
);
CREATE POLICY trip_destinations_insert ON public.trip_destinations FOR INSERT WITH CHECK (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_destinations_update ON public.trip_destinations FOR UPDATE USING (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_destinations_delete ON public.trip_destinations FOR DELETE USING (
  public.can_edit_trip(trip_id, auth.uid())
);

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_destinations;

-- ============================================================
-- Backfill: one trip_destinations row per existing trip from primary_city_id,
-- spanning start_date..end_date, then attach all trip_days inside that range.
-- Safe to re-run: only inserts when no destination exists for the trip.
-- ============================================================
INSERT INTO public.trip_destinations (trip_id, city_id, arrive_date, depart_date, sort_order, created_by)
SELECT t.id, t.primary_city_id, t.start_date, t.end_date, 0, t.owner_id
  FROM public.trips t
 WHERE t.primary_city_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.trip_destinations d WHERE d.trip_id = t.id);

UPDATE public.trip_days td
   SET destination_id = d.id
  FROM public.trip_destinations d
 WHERE td.trip_id = d.trip_id
   AND td.destination_id IS NULL
   AND (d.arrive_date IS NULL OR d.depart_date IS NULL
        OR td.date BETWEEN d.arrive_date AND d.depart_date);

UPDATE public.trip_places tp
   SET destination_id = td.destination_id
  FROM public.trip_days td
 WHERE tp.day_id = td.id
   AND tp.destination_id IS NULL
   AND td.destination_id IS NOT NULL;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE  public.trip_destinations IS 'First-class destinations on a trip. One trip → many destinations (cities/countries/villages) with date sub-ranges. Drives per-destination itinerary auto-gen and cross-trip co-visit signals.';
COMMENT ON COLUMN public.trip_days.destination_id   IS 'Optional pin to a trip_destinations row. Auto-assigned by assign_days_to_destination(). NULL means unassigned.';
COMMENT ON COLUMN public.trip_places.destination_id IS 'Optional pin to a trip_destinations row. Auto-inherited from trip_days.destination_id during backfill; future edits may overwrite.';
