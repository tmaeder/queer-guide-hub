-- Commit-time guardrail: keep a venue's pin near its linked city.
-- ===============================================================
-- Complements migration 20260606100000 (one-off cleanup + nightly sweep).
-- This BEFORE trigger fires on every venue write (pipeline commit, admin
-- edit, backfill) and catches GROSS errors immediately:
--   * pin > GUARD_KM from the linked city center
--       - no usable street address  -> snap pin to city center (audited)
--       - has a real street address  -> keep pin, flag needs_attention
-- Subtle cases (8–25km, "closer to a neighbouring city") are left to the
-- nightly run_venue_coord_snap() precise nearest-city sweep, so this trigger
-- stays cheap (one PK lookup + one distance calc per write, no city scan).

-- audit FK must tolerate BEFORE INSERT (venue row not yet written) -> defer it
ALTER TABLE public.venue_coord_fixes
  DROP CONSTRAINT IF EXISTS venue_coord_fixes_venue_id_fkey;
ALTER TABLE public.venue_coord_fixes
  ADD CONSTRAINT venue_coord_fixes_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.venue_coord_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    INSERT INTO public.venue_coord_fixes
      (venue_id, mode, old_lat, old_lng, new_lat, new_lng, city_id, km_before, source)
    VALUES (NEW.id, 'snap_to_city', NEW.latitude, NEW.longitude, v_clat, v_clng,
            NEW.city_id, round(v_km::numeric,2), 'guardrail');
    NEW.latitude  := v_clat;
    NEW.longitude := v_clng;
  ELSE
    NEW.needs_attention := true;
  END IF;

  RETURN NEW;
END $$;
ALTER FUNCTION public.venue_coord_guard() OWNER TO postgres;

DROP TRIGGER IF EXISTS venue_coord_guard_trg ON public.venues;
CREATE TRIGGER venue_coord_guard_trg
  BEFORE INSERT OR UPDATE OF latitude, longitude, city_id, address ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venue_coord_guard();
