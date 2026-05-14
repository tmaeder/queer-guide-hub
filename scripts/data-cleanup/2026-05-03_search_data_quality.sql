-- Data-quality cleanup driven by the search bug report (bug #15).
--
-- Audit findings on 2026-05-03 against project xqeacpakadqfxjxjcewc:
--
--   venues:
--     7,679 rows with country as full name (e.g. "Germany", "USA")
--    23,957 rows with country = ''  (should be NULL)
--    13,648 rows with city = ''     (should be NULL)
--       541 rows with city = '0'    (junk from a broken importer)
--   events:
--     2,923 rows with country as full name
--        96 rows with city = ''
--
-- The countries table has 250 rows, all with valid ISO2 in `code`.
-- A simple JOIN on lower(name) covers all but 7 country aliases that
-- need an explicit map.
--
-- Apply via the Supabase MCP `apply_migration` tool (per memory:
-- Dev/web/supabase is gitignored; migrations don't go through git).
-- Suggested name: search_data_quality_cleanup
--
-- This file lives in scripts/data-cleanup/ for posterity / audit trail.
-- Don't try to run it through the Supabase CLI without reading first —
-- it touches ~50k rows.

BEGIN;

-- 1. Country aliases that don't match countries.name 1:1.
CREATE TEMP TABLE country_alias (alias text PRIMARY KEY, iso2 char(2)) ON COMMIT DROP;
INSERT INTO country_alias (alias, iso2) VALUES
  ('USA', 'US'),
  ('U.S.A.', 'US'),
  ('U.S.', 'US'),
  ('UK', 'GB'),
  ('U.K.', 'GB'),
  ('England', 'GB'),
  ('Scotland', 'GB'),
  ('Wales', 'GB'),
  ('Northern Ireland', 'GB'),
  ('Czechia', 'CZ'),
  ('Czech Republic', 'CZ'),
  ('Cote d''Ivoire', 'CI'),
  ('Côte d''Ivoire', 'CI'),
  ('Hong Kong S.A.R.', 'HK'),
  ('Hong Kong SAR', 'HK'),
  ('Curacao', 'CW'),
  ('Curaçao', 'CW'),
  ('The Bahamas', 'BS'),
  ('Russia', 'RU'),
  ('South Korea', 'KR'),
  ('North Korea', 'KP'),
  ('Iran', 'IR'),
  ('Vietnam', 'VN'),
  ('Taiwan', 'TW'),
  ('Macau', 'MO'),
  ('Various locations', NULL); -- not a country, will become NULL

-- 2. Resolve every venue/event country to ISO2 in one CTE.
CREATE TEMP TABLE country_resolved (raw text PRIMARY KEY, iso2 char(2)) ON COMMIT DROP;
INSERT INTO country_resolved (raw, iso2)
SELECT DISTINCT
  v.country,
  COALESCE(
    -- already ISO2
    NULLIF((CASE WHEN v.country ~ '^[A-Z]{2}$' THEN v.country END), ''),
    -- lookup by name
    (SELECT c.code FROM countries c WHERE lower(c.name) = lower(v.country) LIMIT 1),
    -- alias map
    (SELECT a.iso2 FROM country_alias a WHERE lower(a.alias) = lower(v.country) LIMIT 1)
  )
FROM (
  SELECT country FROM venues WHERE country IS NOT NULL AND country <> ''
  UNION
  SELECT country FROM events WHERE country IS NOT NULL AND country <> ''
) v;

-- 3. Apply normalisation. Skip rows we couldn't resolve (NULL iso2 left as-is).
UPDATE venues v SET country = r.iso2
FROM country_resolved r
WHERE r.raw = v.country AND r.iso2 IS NOT NULL AND v.country IS DISTINCT FROM r.iso2;

UPDATE events e SET country = r.iso2
FROM country_resolved r
WHERE r.raw = e.country AND r.iso2 IS NOT NULL AND e.country IS DISTINCT FROM r.iso2;

-- 4. Empty strings → NULL. Same for the literal-zero city values that came
--    from a buggy importer (e.g. addiction-Berlin venue).
UPDATE venues SET country = NULL WHERE country = '';
UPDATE venues SET city = NULL WHERE city = '' OR city = '0' OR city ~ '^[0-9]+$';

UPDATE events SET country = NULL WHERE country = '';
UPDATE events SET city = NULL WHERE city = '' OR city = '0' OR city ~ '^[0-9]+$';

-- 5. Audit: every non-null venues.country is now exactly 2 chars and a known ISO2.
DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM venues
   WHERE country IS NOT NULL
     AND country NOT IN (SELECT code FROM countries);
  IF bad_count > 0 THEN
    RAISE NOTICE 'venues: % rows with country not in countries.code (likely Various locations / other unknown aliases)', bad_count;
  END IF;
  SELECT COUNT(*) INTO bad_count FROM events
   WHERE country IS NOT NULL
     AND country NOT IN (SELECT code FROM countries);
  IF bad_count > 0 THEN
    RAISE NOTICE 'events: % rows with country not in countries.code', bad_count;
  END IF;
END $$;

-- 6. Add a CHECK to keep new writes honest. We allow NULL but require
--    non-NULL values to be exactly 2 uppercase letters. (Doesn't enforce
--    "must be a real ISO2" — too restrictive; do that in the API layer.)
ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_country_iso2_check,
  ADD CONSTRAINT venues_country_iso2_check
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_country_iso2_check,
  ADD CONSTRAINT events_country_iso2_check
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- 7. Same for city: empty strings and pure-digit blobs are forbidden going forward.
ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_city_nonjunk_check,
  ADD CONSTRAINT venues_city_nonjunk_check
    CHECK (city IS NULL OR (length(trim(city)) > 0 AND city !~ '^[0-9]+$'));

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_city_nonjunk_check,
  ADD CONSTRAINT events_city_nonjunk_check
    CHECK (city IS NULL OR (length(trim(city)) > 0 AND city !~ '^[0-9]+$'));

COMMIT;
