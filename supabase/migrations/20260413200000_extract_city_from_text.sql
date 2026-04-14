-- Extract a city name from free text (e.g. event title "Berlin Pride 2026" → Berlin)
-- Matches longest city name first, then by population, min 3 chars to avoid false positives.

CREATE OR REPLACE FUNCTION extract_city_from_text(input_text text)
RETURNS TABLE(id uuid, name text, country_id uuid) AS $$
  SELECT c.id, c.name, c.country_id
  FROM cities c
  WHERE input_text ILIKE '%' || c.name || '%'
    AND length(c.name) >= 3
  ORDER BY length(c.name) DESC, c.population DESC NULLS LAST
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
