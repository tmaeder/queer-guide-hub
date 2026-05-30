-- Geo backfill: the match_personality_city() trigger only fires on INSERT/UPDATE,
-- so the ~4,400 personalities imported before it existed were never geo-linked.
-- This RPC replays the SAME matching logic over existing rows, in batches.
-- Returns (personality_id, city_id, country_id) for each row it would/did link.

CREATE OR REPLACE FUNCTION public.backfill_personality_geo(
  p_limit   INT DEFAULT 200,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(personality_id UUID, city_id UUID, country_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  _country_id  UUID;
  _city        RECORD;
  _birth_clean TEXT;
  _new_city_id UUID;
BEGIN
  FOR r IN
    SELECT id, birth_place, nationality, country_id AS cur_country
    FROM public.personalities
    WHERE city_id IS NULL
      AND duplicate_of_id IS NULL
      AND (birth_place IS NOT NULL OR nationality IS NOT NULL)
    ORDER BY view_count DESC NULLS LAST
    LIMIT p_limit
  LOOP
    _country_id := r.cur_country;
    _new_city_id := NULL;

    -- Resolve country from nationality (mirror of trigger).
    IF _country_id IS NULL AND r.nationality IS NOT NULL AND r.nationality <> '' THEN
      SELECT c.id INTO _country_id FROM public.countries c
      WHERE c.duplicate_of_id IS NULL AND c.name ILIKE r.nationality LIMIT 1;
    END IF;

    IF r.birth_place IS NOT NULL AND r.birth_place <> '' THEN
      _birth_clean := trim(split_part(r.birth_place, '(', 1));

      SELECT c.id, c.country_id INTO _city
      FROM public.cities c
      WHERE c.duplicate_of_id IS NULL
        AND (c.name ILIKE r.birth_place OR c.name ILIKE _birth_clean)
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;

      IF _city.id IS NOT NULL THEN
        _new_city_id := _city.id;
        IF _country_id IS NULL THEN _country_id := _city.country_id; END IF;
      ELSE
        SELECT ca.city_id INTO _new_city_id FROM public.city_aliases ca
        WHERE lower(ca.alias) = lower(_birth_clean) OR lower(ca.alias) = lower(r.birth_place)
        LIMIT 1;
      END IF;

      -- Auto-create city when we have a country and it isn't itself a country name.
      IF _new_city_id IS NULL AND _country_id IS NOT NULL
         AND length(_birth_clean) >= 2
         AND NOT EXISTS (SELECT 1 FROM public.countries WHERE name ILIKE _birth_clean AND duplicate_of_id IS NULL)
      THEN
        IF NOT p_dry_run THEN
          INSERT INTO public.cities (name, country_id, slug, data_source)
          VALUES (_birth_clean, _country_id, 'tmp-' || gen_random_uuid(), 'personality-birth-place')
          ON CONFLICT (country_id, name_normalized) WHERE duplicate_of_id IS NULL
          DO NOTHING
          RETURNING id INTO _new_city_id;
          IF _new_city_id IS NULL THEN
            SELECT id INTO _new_city_id FROM public.cities
            WHERE country_id = _country_id AND name ILIKE _birth_clean AND duplicate_of_id IS NULL
            LIMIT 1;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Only emit/commit rows where we actually resolved something new.
    IF _new_city_id IS NOT NULL OR (_country_id IS NOT NULL AND r.cur_country IS NULL) THEN
      IF NOT p_dry_run THEN
        UPDATE public.personalities
        SET city_id      = COALESCE(_new_city_id, city_id),
            country_id   = COALESCE(_country_id, country_id),
            geo_linked_at = now()
        WHERE id = r.id AND city_id IS NULL;
      END IF;
      personality_id := r.id; city_id := _new_city_id; country_id := _country_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_personality_geo(INT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.backfill_personality_geo IS
  'Batch geo-link existing personalities (city_id/country_id) by replaying match_personality_city logic. p_dry_run=true previews without mutation.';
