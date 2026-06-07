-- Corrupt city records — name did not match stored coordinates/country.
-- Found while fixing misplaced venue pins (migration 20260606100000).
-- These were distinct real towns piled onto the wrong coordinates/country;
-- venues linked to them inherited the wrong location. Applied to prod 2026-06-06.
-- Authoritative coords from Nominatim.

UPDATE cities SET latitude=50.2803881, longitude=6.1258953,
  country_id=(SELECT id FROM countries WHERE code='BE' AND duplicate_of_id IS NULL LIMIT 1)
WHERE name='St. Vith'  AND country_id=(SELECT id FROM countries WHERE code='CH' LIMIT 1);  -- was CH @ Zürich

UPDATE cities SET latitude=52.5606426, longitude=13.0882400,
  country_id=(SELECT id FROM countries WHERE code='DE' AND duplicate_of_id IS NULL LIMIT 1)
WHERE name='Falkensee' AND country_id=(SELECT id FROM countries WHERE code='CH' LIMIT 1);  -- was CH @ Zürich

UPDATE cities SET latitude=47.8803788, longitude=10.6222460
WHERE name='Kaufbeuren' AND longitude::float < 8;                                          -- was DE @ Cologne

UPDATE cities SET latitude=35.6937632, longitude=139.7036319,
  country_id=(SELECT id FROM countries WHERE code='JP' AND duplicate_of_id IS NULL LIMIT 1)
WHERE name='Shinjuku'  AND country_id=(SELECT id FROM countries WHERE code='DZ' LIMIT 1);  -- country was DZ

-- Venues that had been snapped to the OLD (wrong) city centers were re-snapped to
-- the corrected centers; see venue_coord_fixes (source='snap_city_fix' / 'snap').

-- NOTE (separate follow-up, NOT done here): the clustering scan also surfaced many
-- LEGITIMATE duplicate city records — same real place under name variants, e.g.
-- Cologne/Köln, Prague/Praha, Brighton/Brighton & Hove, Antwerp/Antwerpen,
-- Florence/Firenze, Brussels variants, Copenhagen/København*, Melbourne/Melbourne
-- City Centre. These are a city-dedup concern (merge + slug redirect), not coord
-- corruption, and are out of scope for the venue-pin fix.
