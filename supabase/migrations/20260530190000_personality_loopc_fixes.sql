-- Loop C corrections:
-- (1) backfill_personality_geo had an ambiguous `country_id` reference (table column
--     vs RETURNS TABLE OUT param) that aborted every call. Alias the table.
-- (2) The profession-tag seed keyed off a category whitelist, but the real
--     profession tags ('Author','Activist',...) are null/mis-categorised, so it
--     seeded 0 rows. The reliable safety signal for a real person is the curated
--     profession NAME, not the category. Re-seed by an explicit safe-name allow-list,
--     picking ONE tag per name and HARD-excluding any sensitive (kink/NSFW/slang)
--     category as defense-in-depth.

-- (1) Fix geo backfill --------------------------------------------------------
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
    SELECT pp.id, pp.birth_place, pp.nationality, pp.country_id AS cur_country
    FROM public.personalities pp
    WHERE pp.city_id IS NULL
      AND pp.duplicate_of_id IS NULL
      AND (pp.birth_place IS NOT NULL OR pp.nationality IS NOT NULL)
    ORDER BY pp.view_count DESC NULLS LAST
    LIMIT p_limit
  LOOP
    _country_id := r.cur_country;
    _new_city_id := NULL;

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

-- (2) Re-seed profession tags by safe NAME allow-list -------------------------
-- Sensitive-category guard (defense in depth on top of the curated name list).
WITH safe_names(profession_kw, tag_name) AS (
  VALUES
    ('activist','activist'), ('politician','politician'), ('writer','writer'),
    ('author','author'), ('poet','poet'), ('journalist','journalist'),
    ('photographer','photographer'), ('actor','actor'), ('actress','actor'),
    ('singer','singer'), ('musician','musician'), ('filmmaker','filmmaker'),
    ('director','director'), ('academic','academic'), ('historian','historian'),
    ('scientist','scientist'), ('athlete','athlete')
),
chosen AS (
  SELECT sn.profession_kw,
    (SELECT t.id FROM public.unified_tags t
     WHERE lower(t.name) = sn.tag_name
       AND t.status IS DISTINCT FROM 'deprecated'
       AND (t.category IS NULL OR lower(t.category) !~
            '(kink|fetish|bdsm|leather|power exchange|roles & dynamics|substance|drug|slang|sex toy|sexual practice|sti|intimate|reproduc)')
     ORDER BY (t.category IS NOT NULL) DESC, t.usage_count DESC NULLS LAST, t.id
     LIMIT 1) AS tag_id
  FROM safe_names sn
)
INSERT INTO public.personality_profession_tags (profession_kw, tag_id)
SELECT profession_kw, tag_id FROM chosen WHERE tag_id IS NOT NULL
ON CONFLICT (profession_kw, tag_id) DO NOTHING;
