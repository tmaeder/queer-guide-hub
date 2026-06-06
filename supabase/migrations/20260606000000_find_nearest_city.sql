-- find_nearest_city — nearest canonical (non-placeholder) city to a coordinate.
--
-- Used to re-link content (venues/events) that was mis-bucketed into placeholder
-- ("tmp-") cities back to the correct real city, and as a coordinate-based fallback
-- when name matching fails. Country-scoped so a point never snaps across a border.
--
-- Excludes placeholder cities (slug LIKE 'tmp-%') and merged duplicates so callers
-- only ever resolve to a real, public city.

CREATE OR REPLACE FUNCTION public.find_nearest_city(
  p_lat double precision,
  p_lng double precision,
  p_country_id uuid DEFAULT NULL,
  p_max_km numeric DEFAULT 75
)
RETURNS TABLE(city_id uuid, city_name text, distance_km numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.name,
    ROUND((ST_DistanceSphere(
      ST_MakePoint(c.longitude::float8, c.latitude::float8),
      ST_MakePoint(p_lng, p_lat)
    ) / 1000.0)::numeric, 2) AS distance_km
  FROM public.cities c
  WHERE p_lat IS NOT NULL AND p_lng IS NOT NULL
    AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
    AND c.duplicate_of_id IS NULL
    AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
    AND (p_country_id IS NULL OR c.country_id = p_country_id)
    AND ST_DistanceSphere(
      ST_MakePoint(c.longitude::float8, c.latitude::float8),
      ST_MakePoint(p_lng, p_lat)
    ) <= p_max_km * 1000.0
  ORDER BY ST_MakePoint(c.longitude::float8, c.latitude::float8) <-> ST_MakePoint(p_lng, p_lat)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearest_city(double precision, double precision, uuid, numeric)
  TO authenticated, anon, service_role;
