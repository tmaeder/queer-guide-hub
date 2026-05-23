-- Historical birthplaces for personalities
-- Design: docs/plans/2026-05-22-historical-birthplaces-design.md

-- 1. Schema -----------------------------------------------------------------

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS historical_names jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.cities.historical_names IS
  'Array of historical name/country entries: {name_de,name_en,country_name_de,country_name_en,country_code,valid_from,valid_to,region?}. Used by resolve_historical_place() to render period-correct birthplaces for personalities.';

CREATE INDEX IF NOT EXISTS idx_cities_historical_names
  ON public.cities USING GIN (historical_names jsonb_path_ops);


-- 2. Resolver ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_historical_place(
  p_city_id     uuid,
  p_birth_place text,
  p_birth_date  date,
  p_locale      text DEFAULT 'de'
) RETURNS TABLE(display_name text, display_country text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_city           RECORD;
  v_entry          jsonb;
  v_name_field     text := CASE WHEN p_locale = 'en' THEN 'name_en' ELSE 'name_de' END;
  v_country_field  text := CASE WHEN p_locale = 'en' THEN 'country_name_en' ELSE 'country_name_de' END;
  v_match          jsonb;
BEGIN
  IF p_city_id IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT c.name, c.name_de, c.name_en, c.historical_names, co.name AS country_name
    INTO v_city
    FROM public.cities c
    LEFT JOIN public.countries co ON co.id = c.country_id
   WHERE c.id = p_city_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 1. Exact-name match (raw birth_place text against any historical name in any locale)
  -- 1. Exact-name match constrained by date (or no date given). Prevents
  --    "Berlin" + 1955 from matching the 1871-1945 "Deutsches Reich" entry.
  IF p_birth_place IS NOT NULL AND v_city.historical_names IS NOT NULL THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_city.historical_names) LOOP
      IF (lower(btrim(p_birth_place)) = lower(coalesce(v_entry->>'name_de','')) OR
          lower(btrim(p_birth_place)) = lower(coalesce(v_entry->>'name_en','')))
         AND (p_birth_date IS NULL
              OR ((v_entry->>'valid_from')::date <= p_birth_date
                  AND p_birth_date <= (v_entry->>'valid_to')::date)) THEN
        v_match := v_entry;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- 2. Date-interval match. Skip regional entries (Ost-/West-Berlin) — they
  --    overlap in time and need explicit name disambiguation.
  IF v_match IS NULL AND p_birth_date IS NOT NULL AND v_city.historical_names IS NOT NULL THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_city.historical_names) LOOP
      IF (v_entry->>'region') IS NULL
         AND (v_entry->>'valid_from')::date <= p_birth_date
         AND p_birth_date <= (v_entry->>'valid_to')::date THEN
        v_match := v_entry;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_match IS NOT NULL THEN
    RETURN QUERY SELECT
      coalesce(v_match->>v_name_field,
               v_match->>'name_de',
               v_match->>'name_en'),
      coalesce(v_match->>v_country_field,
               v_match->>'country_name_de',
               v_match->>'country_name_en');
    RETURN;
  END IF;

  -- 3. Current fallback
  RETURN QUERY SELECT
    coalesce(
      CASE WHEN p_locale = 'en' THEN v_city.name_en ELSE v_city.name_de END,
      v_city.name),
    v_city.country_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_historical_place(uuid, text, date, text)
  TO anon, authenticated, service_role;


-- 3. Mirror historical names to city_aliases for search ---------------------

CREATE OR REPLACE FUNCTION public.cities_mirror_historical_names_to_aliases()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry  jsonb;
  v_name   text;
BEGIN
  IF NEW.historical_names IS NULL OR jsonb_array_length(NEW.historical_names) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.historical_names) LOOP
    FOREACH v_name IN ARRAY ARRAY[v_entry->>'name_de', v_entry->>'name_en'] LOOP
      IF v_name IS NULL OR btrim(v_name) = '' THEN CONTINUE; END IF;
      INSERT INTO public.city_aliases (city_id, alias, locale)
      VALUES (NEW.id, btrim(v_name), NULL)
      ON CONFLICT (city_id, alias_key) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cities_mirror_historical_names ON public.cities;
CREATE TRIGGER trg_cities_mirror_historical_names
  AFTER INSERT OR UPDATE OF historical_names ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.cities_mirror_historical_names_to_aliases();


-- 4. Seed data --------------------------------------------------------------
-- Match by canonical_key (lowercase name) + country code. Missing cities are
-- silently skipped — the seed is idempotent and can be re-run.

DO $$
DECLARE
  seed RECORD;
  v_city_id uuid;
BEGIN
  FOR seed IN
    SELECT * FROM (VALUES
      -- name, country_code, historical_names
      ('Berlin', 'DE', '[
        {"name_de":"Ost-Berlin","name_en":"East Berlin","country_name_de":"Deutsche Demokratische Republik","country_name_en":"German Democratic Republic","country_code":"DDR","valid_from":"1949-10-07","valid_to":"1990-10-03","region":"east"},
        {"name_de":"West-Berlin","name_en":"West Berlin","country_name_de":"Bundesrepublik Deutschland","country_name_en":"Federal Republic of Germany","country_code":"BRD","valid_from":"1949-05-23","valid_to":"1990-10-03","region":"west"},
        {"name_de":"Berlin","name_en":"Berlin","country_name_de":"Deutsches Reich","country_name_en":"German Reich","country_code":"DR","valid_from":"1871-01-18","valid_to":"1945-05-08"}
      ]'::jsonb),
      ('Saint Petersburg', 'RU', '[
        {"name_de":"Sankt Petersburg","name_en":"Saint Petersburg","country_name_de":"Russisches Kaiserreich","country_name_en":"Russian Empire","country_code":"RUS-EMP","valid_from":"1703-05-27","valid_to":"1914-08-31"},
        {"name_de":"Petrograd","name_en":"Petrograd","country_name_de":"Russisches Kaiserreich","country_name_en":"Russian Empire","country_code":"RUS-EMP","valid_from":"1914-09-01","valid_to":"1917-11-06"},
        {"name_de":"Petrograd","name_en":"Petrograd","country_name_de":"Russische SFSR","country_name_en":"Russian SFSR","country_code":"RSFSR","valid_from":"1917-11-07","valid_to":"1924-01-25"},
        {"name_de":"Leningrad","name_en":"Leningrad","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1924-01-26","valid_to":"1991-09-05"}
      ]'::jsonb),
      ('Volgograd', 'RU', '[
        {"name_de":"Zarizyn","name_en":"Tsaritsyn","country_name_de":"Russisches Kaiserreich","country_name_en":"Russian Empire","country_code":"RUS-EMP","valid_from":"1589-01-01","valid_to":"1925-04-09"},
        {"name_de":"Stalingrad","name_en":"Stalingrad","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1925-04-10","valid_to":"1961-11-09"}
      ]'::jsonb),
      ('Kaliningrad', 'RU', '[
        {"name_de":"Königsberg","name_en":"Königsberg","country_name_de":"Königreich Preußen","country_name_en":"Kingdom of Prussia","country_code":"PRU","valid_from":"1701-01-18","valid_to":"1871-01-17"},
        {"name_de":"Königsberg","name_en":"Königsberg","country_name_de":"Deutsches Reich","country_name_en":"German Reich","country_code":"DR","valid_from":"1871-01-18","valid_to":"1945-04-09"}
      ]'::jsonb),
      ('Gdańsk', 'PL', '[
        {"name_de":"Danzig","name_en":"Danzig","country_name_de":"Deutsches Reich","country_name_en":"German Reich","country_code":"DR","valid_from":"1871-01-18","valid_to":"1919-11-14"},
        {"name_de":"Freie Stadt Danzig","name_en":"Free City of Danzig","country_name_de":"Freie Stadt Danzig","country_name_en":"Free City of Danzig","country_code":"DZG","valid_from":"1920-01-10","valid_to":"1939-09-01"},
        {"name_de":"Danzig","name_en":"Danzig","country_name_de":"Deutsches Reich","country_name_en":"German Reich","country_code":"DR","valid_from":"1939-09-02","valid_to":"1945-03-30"}
      ]'::jsonb),
      ('Wrocław', 'PL', '[
        {"name_de":"Breslau","name_en":"Breslau","country_name_de":"Königreich Preußen","country_name_en":"Kingdom of Prussia","country_code":"PRU","valid_from":"1741-01-01","valid_to":"1871-01-17"},
        {"name_de":"Breslau","name_en":"Breslau","country_name_de":"Deutsches Reich","country_name_en":"German Reich","country_code":"DR","valid_from":"1871-01-18","valid_to":"1945-05-06"}
      ]'::jsonb),
      ('Istanbul', 'TR', '[
        {"name_de":"Konstantinopel","name_en":"Constantinople","country_name_de":"Osmanisches Reich","country_name_en":"Ottoman Empire","country_code":"OTT","valid_from":"1453-05-29","valid_to":"1922-11-01"},
        {"name_de":"Konstantinopel","name_en":"Constantinople","country_name_de":"Türkei","country_name_en":"Turkey","country_code":"TR","valid_from":"1923-10-29","valid_to":"1930-03-27"}
      ]'::jsonb),
      ('Mumbai', 'IN', '[
        {"name_de":"Bombay","name_en":"Bombay","country_name_de":"Britisch-Indien","country_name_en":"British India","country_code":"BR-IN","valid_from":"1858-08-02","valid_to":"1947-08-14"},
        {"name_de":"Bombay","name_en":"Bombay","country_name_de":"Indien","country_name_en":"India","country_code":"IN","valid_from":"1947-08-15","valid_to":"1995-11-21"}
      ]'::jsonb),
      ('Chennai', 'IN', '[
        {"name_de":"Madras","name_en":"Madras","country_name_de":"Britisch-Indien","country_name_en":"British India","country_code":"BR-IN","valid_from":"1858-08-02","valid_to":"1947-08-14"},
        {"name_de":"Madras","name_en":"Madras","country_name_de":"Indien","country_name_en":"India","country_code":"IN","valid_from":"1947-08-15","valid_to":"1996-08-16"}
      ]'::jsonb),
      ('Kolkata', 'IN', '[
        {"name_de":"Kalkutta","name_en":"Calcutta","country_name_de":"Britisch-Indien","country_name_en":"British India","country_code":"BR-IN","valid_from":"1858-08-02","valid_to":"1947-08-14"},
        {"name_de":"Kalkutta","name_en":"Calcutta","country_name_de":"Indien","country_name_en":"India","country_code":"IN","valid_from":"1947-08-15","valid_to":"2000-12-31"}
      ]'::jsonb),
      ('Ho Chi Minh City', 'VN', '[
        {"name_de":"Saigon","name_en":"Saigon","country_name_de":"Französisch-Indochina","country_name_en":"French Indochina","country_code":"FR-IC","valid_from":"1862-06-05","valid_to":"1954-07-21"},
        {"name_de":"Saigon","name_en":"Saigon","country_name_de":"Republik Vietnam","country_name_en":"Republic of Vietnam","country_code":"RVN","valid_from":"1955-10-26","valid_to":"1975-04-30"}
      ]'::jsonb),
      ('Lviv', 'UA', '[
        {"name_de":"Lemberg","name_en":"Lemberg","country_name_de":"Österreich-Ungarn","country_name_en":"Austria-Hungary","country_code":"AT-HU","valid_from":"1867-12-21","valid_to":"1918-11-11"},
        {"name_de":"Lwów","name_en":"Lwów","country_name_de":"Polen","country_name_en":"Poland","country_code":"PL","valid_from":"1918-11-12","valid_to":"1939-09-22"}
      ]'::jsonb),
      ('Yangon', 'MM', '[
        {"name_de":"Rangun","name_en":"Rangoon","country_name_de":"Britisch-Birma","country_name_en":"British Burma","country_code":"BR-BU","valid_from":"1886-01-01","valid_to":"1948-01-03"},
        {"name_de":"Rangun","name_en":"Rangoon","country_name_de":"Birma","country_name_en":"Burma","country_code":"BU","valid_from":"1948-01-04","valid_to":"1989-06-17"}
      ]'::jsonb),
      ('Almaty', 'KZ', '[
        {"name_de":"Alma-Ata","name_en":"Alma-Ata","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1921-02-05","valid_to":"1991-12-16"}
      ]'::jsonb),
      ('Yekaterinburg', 'RU', '[
        {"name_de":"Swerdlowsk","name_en":"Sverdlovsk","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1924-10-14","valid_to":"1991-09-22"}
      ]'::jsonb),
      ('Nizhny Novgorod', 'RU', '[
        {"name_de":"Gorki","name_en":"Gorky","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1932-10-07","valid_to":"1990-10-21"}
      ]'::jsonb),
      ('Samara', 'RU', '[
        {"name_de":"Kuibyschew","name_en":"Kuybyshev","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1935-01-27","valid_to":"1991-01-25"}
      ]'::jsonb),
      ('Chemnitz', 'DE', '[
        {"name_de":"Karl-Marx-Stadt","name_en":"Karl-Marx-Stadt","country_name_de":"Deutsche Demokratische Republik","country_name_en":"German Democratic Republic","country_code":"DDR","valid_from":"1953-05-10","valid_to":"1990-06-01"}
      ]'::jsonb),
      ('Tallinn', 'EE', '[
        {"name_de":"Reval","name_en":"Reval","country_name_de":"Russisches Kaiserreich","country_name_en":"Russian Empire","country_code":"RUS-EMP","valid_from":"1721-09-10","valid_to":"1917-11-06"},
        {"name_de":"Tallinn","name_en":"Tallinn","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1940-08-06","valid_to":"1991-08-19"}
      ]'::jsonb),
      ('Vilnius', 'LT', '[
        {"name_de":"Wilna","name_en":"Vilna","country_name_de":"Russisches Kaiserreich","country_name_en":"Russian Empire","country_code":"RUS-EMP","valid_from":"1795-01-01","valid_to":"1915-09-18"},
        {"name_de":"Wilno","name_en":"Wilno","country_name_de":"Polen","country_name_en":"Poland","country_code":"PL","valid_from":"1922-04-08","valid_to":"1939-09-19"},
        {"name_de":"Vilnius","name_en":"Vilnius","country_name_de":"Sowjetunion","country_name_en":"Soviet Union","country_code":"USSR","valid_from":"1940-08-03","valid_to":"1990-03-10"}
      ]'::jsonb)
    ) AS t(city_name, country_code, hist)
  LOOP
    SELECT c.id INTO v_city_id
      FROM public.cities c
      JOIN public.countries co ON co.id = c.country_id
     WHERE co.code = seed.country_code
       AND (c.canonical_key = public.city_canonical_key(seed.city_name)
            OR lower(c.name) = lower(seed.city_name)
            OR lower(coalesce(c.name_de, '')) = lower(seed.city_name)
            OR lower(coalesce(c.name_en, '')) = lower(seed.city_name))
     LIMIT 1;

    IF v_city_id IS NOT NULL THEN
      UPDATE public.cities
         SET historical_names = seed.hist::jsonb,
             updated_at = now()
       WHERE id = v_city_id;
    END IF;
  END LOOP;
END $$;
