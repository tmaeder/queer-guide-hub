-- One-shot repair of the NATIONAL capital flag.
--
-- Measured on prod 2026-08-25: 199 of 5,552 live cities carried is_capital, and
-- 198 of them matched their country's `capital` text. The remainder was not
-- noise — it was three distinct defects that had no detector:
--
--   (1) 9 capitals existed as city rows and were simply never flagged. Nothing
--       ever writes is_capital except commit_city_staging_item reading a literal
--       metadata.is_capital, so a city that arrived from any other path could
--       only be flagged by hand, and never was.
--   (2) 36 capitals had no `cities` row at all.
--   (3) 3 `countries.capital` values were wrong.
--
-- Every one of the affected countries is a dependent territory, which is why
-- this stayed invisible: the 198 sovereign states were fine.
--
-- Iceland is NOT in any of these lists. `countries.capital` says 'Reykjavik' and
-- the city is 'Reykjavík'; both spellings are legitimate, so the comparison is
-- unaccented (public.city_name_key) rather than one side being "corrected".

-- ---------------------------------------------------------------- (3) bad values
--
-- Decided per row, not by a rule:
--
-- HK 'City of Victoria' -> 'Hong Kong'. Victoria is the historical colonial name
--    of the urban core; the territory's seat of government is Hong Kong itself,
--    which already exists as a city row (pop 7,396,076).
-- UM 'Washington DC' -> NULL. The United States Minor Outlying Islands are
--    scattered uninhabited possessions with no capital; the value was the US
--    capital, which is a different country entirely. NULL is the honest answer
--    and it is what stops the checker demanding a city that must not exist.
-- MO 'Macao' is LEFT ALONE. Macau is a city-territory whose city row is named
--    'Macau/Macao'; the value is not wrong, only spelled differently from the
--    row, and the checker keys on the flag rather than on the name (see the
--    coverage-radar migration), so no name surgery is needed.

UPDATE public.countries
   SET capital = 'Hong Kong', updated_at = now()
 WHERE code = 'HK' AND duplicate_of_id IS NULL AND capital = 'City of Victoria';

UPDATE public.countries
   SET capital = NULL, updated_at = now()
 WHERE code = 'UM' AND duplicate_of_id IS NULL AND capital = 'Washington DC';

-- ---------------------------------------------------------------- (1) flag existing
--
-- Matched on (country code, exact city name), never on the name alone: `cities`
-- can hold at most one row per (name, country), so a same-name city elsewhere is
-- unrepresentable there and a bare name match cannot tell the two apart.
--
-- The names are transcribed verbatim from the measurement, including the two
-- that do NOT equal their country's `capital` text — Bermuda's row is 'City of
-- Hamilton' against capital 'Hamilton', Macau's is 'Macau/Macao' against
-- 'Macao'. Those are alias spellings of the right place, not different places.

WITH target(country_code, city_name) AS (VALUES
  ('CW', 'Willemstad'),
  ('FO', 'Tórshavn'),
  ('GI', 'Gibraltar'),
  ('GL', 'Nuuk'),
  ('JE', 'Saint Helier'),
  ('MQ', 'Fort-de-France'),
  ('PR', 'San Juan'),
  ('BM', 'City of Hamilton'),
  ('GG', 'Saint Peter Port'),
  ('HK', 'Hong Kong'),
  ('MO', 'Macau/Macao')
)
UPDATE public.cities c
   SET is_capital = true,
       field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
         'is_capital', jsonb_build_object(
           'source', 'capital_repair',
           'value', true,
           'at', now()
         )),
       updated_at = now()
  FROM target t
  JOIN public.countries co ON co.code = t.country_code AND co.duplicate_of_id IS NULL
 WHERE c.country_id = co.id
   AND c.name = t.city_name
   AND c.duplicate_of_id IS NULL
   AND c.is_capital IS NOT TRUE;

-- ---------------------------------------------------------------- (2) create missing
--
-- 36 rows. Coordinates are the only fact supplied beyond name and country:
-- population, timezone and region are left NULL rather than guessed, and
-- city-factual-backfill will fill what it can find.
--
-- Guarded twice: the country must exist, and no unaccent-equal city may already
-- be in it. Without the second guard this would sit a duplicate next to an
-- existing row under a different spelling — exactly the trap 'City of Hamilton'
-- and 'Saint Peter Port' just demonstrated, and which 'München'/'Munich' still
-- shows live.
--
-- Most of these places have no venues and no events, so the nightly City Truth
-- Engine classifier will route them to shell_status='ghost' + seo_indexable=false
-- on its next pass. That is intended: they exist so the capital of a territory
-- resolves, not so they get indexed.

WITH want(country_code, city_name, lat, lng) AS (VALUES
  ('AX', 'Mariehamn',          60.0973,   19.9348),
  ('AS', 'Pago Pago',         -14.2756, -170.7020),
  ('AI', 'The Valley',         18.2170,  -63.0578),
  ('AW', 'Oranjestad',         12.5240,  -70.0270),
  ('IO', 'Diego Garcia',       -7.3195,   72.4229),
  ('VG', 'Road Town',          18.4286,  -64.6185),
  ('BQ', 'Kralendijk',         12.1444,  -68.2656),
  ('KY', 'George Town',        19.2866,  -81.3744),
  ('CX', 'Flying Fish Cove',  -10.4217,  105.6791),
  ('CC', 'West Island',       -12.1568,   96.8225),
  ('CK', 'Avarua',            -21.2075, -159.7750),
  ('PF', 'Papeetē',           -17.5350, -149.5696),
  ('TF', 'Port-aux-Français', -49.3500,   70.2167),
  ('GP', 'Basse-Terre',        15.9958,  -61.7292),
  ('GU', 'Hagåtña',            13.4745,  144.7504),
  ('IM', 'Douglas',            54.1509,   -4.4814),
  ('YT', 'Mamoudzou',         -12.7806,   45.2278),
  ('MS', 'Plymouth',           16.7062,  -62.2158),
  ('NC', 'Nouméa',            -22.2758,  166.4580),
  ('NU', 'Alofi',             -19.0554, -169.9187),
  ('NF', 'Kingston',          -29.0561,  167.9613),
  ('MP', 'Saipan',             15.1850,  145.7467),
  ('PN', 'Adamstown',         -25.0662, -130.1027),
  ('RE', 'Saint-Denis',       -20.8823,   55.4504),
  ('BL', 'Gustavia',           17.8962,  -62.8498),
  ('SH', 'Jamestown',         -15.9387,   -5.7168),
  ('MF', 'Marigot',            18.0700,  -63.0828),
  ('PM', 'Saint-Pierre',       46.7811,  -56.1764),
  ('SX', 'Philipsburg',        18.0255,  -63.0450),
  ('GS', 'King Edward Point', -54.2825,  -36.4986),
  ('SJ', 'Longyearbyen',       78.2232,   15.6267),
  ('TK', 'Fakaofo',            -9.3656, -171.2151),
  ('TC', 'Cockburn Town',      21.4664,  -71.1360),
  ('VI', 'Charlotte Amalie',   18.3419,  -64.9307),
  ('WF', 'Mata-Utu',          -13.2825, -176.1745),
  ('EH', 'El Aaiún',           27.1536,  -13.2033)
)
INSERT INTO public.cities (name, country_id, is_capital, latitude, longitude, data_source,
                           field_provenance, last_synced_at, last_refreshed_at)
SELECT w.city_name, co.id, true, w.lat, w.lng, 'capital_repair',
       jsonb_build_object(
         'is_capital', jsonb_build_object('source','capital_repair','value',true,'at',now()),
         'latitude',   jsonb_build_object('source','capital_repair','at',now()),
         'longitude',  jsonb_build_object('source','capital_repair','at',now())
       ),
       now(), now()
  FROM want w
  JOIN public.countries co ON co.code = w.country_code AND co.duplicate_of_id IS NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM public.cities c
    WHERE c.country_id = co.id
      AND c.duplicate_of_id IS NULL
      AND public.city_name_key(c.name) = public.city_name_key(w.city_name)
 );

-- ---------------------------------------------------------------- assertion
--
-- Fail the migration rather than leave a half-repair: after this, every live
-- country that names a capital must have exactly one flagged city.

DO $$
DECLARE
  v_missing int;
  v_multi   int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.countries co
   WHERE co.duplicate_of_id IS NULL
     AND nullif(btrim(co.capital), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cities c
                      WHERE c.country_id = co.id AND c.duplicate_of_id IS NULL AND c.is_capital);

  SELECT count(*) INTO v_multi
    FROM (SELECT c.country_id FROM public.cities c
           WHERE c.duplicate_of_id IS NULL AND c.is_capital
           GROUP BY c.country_id HAVING count(*) > 1) x;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'capital_repair_incomplete: % countries still name a capital with no flagged city', v_missing;
  END IF;
  IF v_multi > 0 THEN
    RAISE EXCEPTION 'capital_repair_ambiguous: % countries now have more than one flagged capital', v_multi;
  END IF;
END $$;
