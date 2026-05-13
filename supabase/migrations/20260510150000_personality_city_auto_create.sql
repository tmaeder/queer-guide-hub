-- Enhanced: auto-create city when birth_place doesn't match existing city
-- but we can resolve country from nationality
CREATE OR REPLACE FUNCTION match_personality_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _city record;
  _country_id uuid;
  _birth_clean text;
  _new_city_id uuid;
BEGIN
  -- Skip if already has city_id
  IF NEW.city_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Resolve country from nationality if needed
  IF NEW.country_id IS NULL AND NEW.nationality IS NOT NULL AND NEW.nationality != '' THEN
    SELECT id INTO _country_id FROM countries
    WHERE duplicate_of_id IS NULL AND name ILIKE NEW.nationality
    LIMIT 1;
    IF _country_id IS NOT NULL THEN
      NEW.country_id := _country_id;
    END IF;
  ELSE
    _country_id := NEW.country_id;
  END IF;

  -- No birth_place → done
  IF NEW.birth_place IS NULL OR NEW.birth_place = '' THEN
    RETURN NEW;
  END IF;

  -- Clean birth_place: strip parenthetical suffix
  _birth_clean := trim(split_part(NEW.birth_place, '(', 1));

  -- Try matching birth_place to existing city
  SELECT c.id, c.country_id INTO _city
  FROM cities c
  WHERE c.duplicate_of_id IS NULL
    AND (
      c.name ILIKE NEW.birth_place
      OR c.name ILIKE _birth_clean
    )
  ORDER BY c.population DESC NULLS LAST
  LIMIT 1;

  IF _city IS NOT NULL THEN
    NEW.city_id := _city.id;
    IF NEW.country_id IS NULL THEN
      NEW.country_id := _city.country_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Try alias match
  SELECT ca.city_id INTO _new_city_id FROM city_aliases ca
  WHERE lower(ca.alias) = lower(_birth_clean) OR lower(ca.alias) = lower(NEW.birth_place)
  LIMIT 1;

  IF _new_city_id IS NOT NULL THEN
    NEW.city_id := _new_city_id;
    RETURN NEW;
  END IF;

  -- No match — auto-create city if we have a country and birth_place looks like a city name
  -- Skip entries that are country/state names (no comma, matches a country name)
  IF _country_id IS NOT NULL
    AND length(_birth_clean) >= 2
    AND NOT EXISTS (SELECT 1 FROM countries WHERE name ILIKE _birth_clean AND duplicate_of_id IS NULL)
  THEN
    -- Insert with ON CONFLICT to handle races
    INSERT INTO cities (name, country_id, slug, data_source)
    VALUES (_birth_clean, _country_id, 'tmp-' || gen_random_uuid(), 'personality-birth-place')
    ON CONFLICT (country_id, name_normalized) WHERE duplicate_of_id IS NULL
    DO NOTHING
    RETURNING id INTO _new_city_id;

    -- If conflict, fetch existing
    IF _new_city_id IS NULL THEN
      SELECT id INTO _new_city_id FROM cities
      WHERE country_id = _country_id
        AND name ILIKE _birth_clean
        AND duplicate_of_id IS NULL
      LIMIT 1;
    END IF;

    IF _new_city_id IS NOT NULL THEN
      NEW.city_id := _new_city_id;
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
