-- Top cities by hotel count for the /hotels discovery page.
-- Returns one row per city that has at least one LGBTQ+-friendly hotel,
-- with the city's cover image and the count of matching hotels.
CREATE OR REPLACE FUNCTION public.hotels_top_cities(result_limit integer DEFAULT 8)
RETURNS TABLE (
  city_id uuid,
  name text,
  slug text,
  country text,
  image_url text,
  hotel_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS city_id,
    c.name,
    c.slug,
    co.name AS country,
    c.image_url,
    COUNT(h.id) AS hotel_count
  FROM public.cities c
  JOIN public.hotels h ON h.city_id = c.id
  LEFT JOIN public.countries co ON co.id = c.country_id
  WHERE COALESCE(h.lgbtq_friendly, true) = true
  GROUP BY c.id, c.name, c.slug, co.name, c.image_url
  ORDER BY COUNT(h.id) DESC, c.name ASC
  LIMIT GREATEST(1, LEAST(result_limit, 24));
$$;

GRANT EXECUTE ON FUNCTION public.hotels_top_cities(integer) TO anon, authenticated;
