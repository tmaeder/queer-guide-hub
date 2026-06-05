-- Selector for the venue coordinate backfill (backfill-venue-geocode edge fn):
-- venues with a real street address (not a placeholder == name) and a known
-- country but no coordinates, excluding already-attempted rows so the backfill
-- drains. Featured venues first.
CREATE OR REPLACE FUNCTION public.venues_needing_geocode(p_limit int DEFAULT 150)
RETURNS TABLE(id uuid, address text, city text, ccode text, cname text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT v.id, v.address, v.city, co.code, co.name
  FROM venues v JOIN countries co ON co.id = v.country_id
  WHERE v.latitude IS NULL AND v.duplicate_of_id IS NULL
    AND v.address IS NOT NULL AND btrim(v.address) <> '' AND lower(v.address) <> lower(coalesce(v.name,''))
    AND co.code IS NOT NULL
    AND coalesce(v.geocode_attempted, false) = false
  ORDER BY v.is_featured DESC NULLS LAST, v.id
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.venues_needing_geocode(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venues_needing_geocode(int) TO service_role;
