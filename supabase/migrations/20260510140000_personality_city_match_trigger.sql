-- Auto-match personality birth_place to cities table on insert/update
CREATE OR REPLACE FUNCTION match_personality_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _city record;
  _country_id uuid;
BEGIN
  -- Skip if already has city_id or no birth_place
  IF NEW.city_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.birth_place IS NULL OR NEW.birth_place = '' THEN
    -- Try nationality → country_id if missing
    IF NEW.country_id IS NULL AND NEW.nationality IS NOT NULL AND NEW.nationality != '' THEN
      SELECT id INTO _country_id FROM countries
      WHERE duplicate_of_id IS NULL AND name ILIKE NEW.nationality
      LIMIT 1;
      IF _country_id IS NOT NULL THEN
        NEW.country_id := _country_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Try matching birth_place to city name (strip parenthetical if present)
  SELECT c.id, c.country_id INTO _city
  FROM cities c
  WHERE c.duplicate_of_id IS NULL
    AND (
      c.name ILIKE NEW.birth_place
      OR (NEW.birth_place LIKE '% (%)' AND c.name ILIKE trim(split_part(NEW.birth_place, '(', 1)))
    )
  ORDER BY c.population DESC NULLS LAST
  LIMIT 1;

  IF _city IS NOT NULL THEN
    NEW.city_id := _city.id;
    IF NEW.country_id IS NULL THEN
      NEW.country_id := _city.country_id;
    END IF;
  ELSIF NEW.country_id IS NULL AND NEW.nationality IS NOT NULL AND NEW.nationality != '' THEN
    SELECT id INTO _country_id FROM countries
    WHERE duplicate_of_id IS NULL AND name ILIKE NEW.nationality
    LIMIT 1;
    IF _country_id IS NOT NULL THEN
      NEW.country_id := _country_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personality_city_match ON personalities;
CREATE TRIGGER trg_personality_city_match
  BEFORE INSERT OR UPDATE OF birth_place, nationality
  ON personalities
  FOR EACH ROW
  EXECUTE FUNCTION match_personality_city();
