-- Improved city matching: aliases for local names and district→city resolution
-- Uses existing city_aliases table (alias_key is generated column)

-- 1. Local name aliases
INSERT INTO city_aliases (city_id, alias)
SELECT c.id, a.alias
FROM (VALUES
  ('Rome', 'Roma'),
  ('Mexico City', 'Ciudad de México'),
  ('Bangkok', 'กรุงเทพมหานคร'),
  ('Cairo', 'القاهرة'),
  ('Moscow', 'Moskva'),
  ('Bucharest', 'București'),
  ('Edinburgh', 'City of Edinburgh'),
  ('Reykjavik', 'Reykjavíkurborg'),
  ('Hamilton', 'City of Hamilton'),
  ('Montreal', 'Montréal'),
  ('Krakow', 'Kraków')
) AS a(city_name, alias)
JOIN cities c ON c.name = a.city_name AND c.duplicate_of_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. District → parent city aliases
INSERT INTO city_aliases (city_id, alias)
SELECT c.id, a.alias
FROM (VALUES
  ('Tokyo', 'Taito'), ('Tokyo', 'Kita'), ('Tokyo', 'Meguro'), ('Tokyo', 'Shibuya'),
  ('Tokyo', 'Shinjuku'), ('Tokyo', 'Minato'), ('Tokyo', 'Chiyoda'), ('Tokyo', 'Toshima'),
  ('Tokyo', 'Nakano'), ('Tokyo', 'Setagaya'), ('Tokyo', 'Sumida'),
  ('Hong Kong', 'Causeway Bay'), ('Hong Kong', 'Hong Kong Island'), ('Hong Kong', 'Kowloon'),
  ('Hong Kong', 'Tsim Sha Tsui'), ('Hong Kong', 'Wan Chai'), ('Hong Kong', 'Central'),
  ('Bangkok', 'Chatuchak'), ('Bangkok', 'Huai Khwang'), ('Bangkok', 'Khlong Toei'),
  ('Bangkok', 'Phra Nakhon'), ('Bangkok', 'Watthana'), ('Bangkok', 'Sathon'),
  ('Bangkok', 'Bang Rak'), ('Bangkok', 'Pathum Wan'),
  ('Lima', 'Miraflores')
) AS a(city_name, alias)
JOIN cities c ON c.name = a.city_name AND c.duplicate_of_id IS NULL
ON CONFLICT DO NOTHING;

-- 3. Helper: match city text against cities + aliases, with paren stripping
CREATE OR REPLACE FUNCTION match_city_with_aliases(p_city_text text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _clean text;
  _city_id uuid;
BEGIN
  IF p_city_text IS NULL OR p_city_text = '' OR p_city_text = 'null' THEN
    RETURN NULL;
  END IF;

  -- Strip parenthetical suffix: "Berlin (DE)" → "Berlin"
  _clean := trim(split_part(p_city_text, '(', 1));

  -- Direct match on cities table
  SELECT id INTO _city_id FROM cities
  WHERE duplicate_of_id IS NULL AND (name ILIKE _clean OR name ILIKE p_city_text)
  ORDER BY population DESC NULLS LAST LIMIT 1;

  IF _city_id IS NOT NULL THEN RETURN _city_id; END IF;

  -- Alias match
  SELECT ca.city_id INTO _city_id FROM city_aliases ca
  WHERE lower(ca.alias) = lower(_clean) OR lower(ca.alias) = lower(p_city_text)
  LIMIT 1;

  RETURN _city_id;
END;
$$;

-- 4. Backfill: strip parens from venue city text
UPDATE venues
SET city = trim(split_part(city, '(', 1))
WHERE city_id IS NULL AND duplicate_of_id IS NULL AND city LIKE '%(%)';

-- 5. Backfill: fix mojibake
UPDATE venues SET city = 'Düsseldorf'
WHERE city LIKE 'D%sseldorf' AND city != 'Düsseldorf' AND city_id IS NULL;

-- 6. Backfill: clean literal 'null'
UPDATE venues SET city = NULL WHERE city = 'null';

-- 7. Backfill: match venues via aliases
UPDATE venues v SET city_id = ca.city_id
FROM city_aliases ca
WHERE v.city_id IS NULL AND v.duplicate_of_id IS NULL
  AND v.city IS NOT NULL AND v.city != ''
  AND lower(ca.alias) = lower(v.city);

-- 8. Backfill: match events via aliases
UPDATE events e SET city_id = ca.city_id
FROM city_aliases ca
WHERE e.city_id IS NULL AND e.duplicate_of_id IS NULL
  AND e.city IS NOT NULL AND e.city != ''
  AND lower(ca.alias) = lower(e.city);

-- 9. Backfill: direct text match remaining (venues + events)
UPDATE venues v SET city_id = sub.cid
FROM (
  SELECT DISTINCT ON (v2.id) v2.id as vid, c.id as cid
  FROM venues v2 JOIN cities c ON c.duplicate_of_id IS NULL AND c.name ILIKE v2.city
  WHERE v2.city_id IS NULL AND v2.duplicate_of_id IS NULL AND v2.city IS NOT NULL AND v2.city != ''
  ORDER BY v2.id, c.population DESC NULLS LAST
) sub WHERE v.id = sub.vid;

UPDATE events e SET city_id = sub.cid
FROM (
  SELECT DISTINCT ON (e2.id) e2.id as eid, c.id as cid
  FROM events e2 JOIN cities c ON c.duplicate_of_id IS NULL AND c.name ILIKE e2.city
  WHERE e2.city_id IS NULL AND e2.duplicate_of_id IS NULL AND e2.city IS NOT NULL AND e2.city != ''
  ORDER BY e2.id, c.population DESC NULLS LAST
) sub WHERE e.id = sub.eid;

-- 10. Sync review_status
UPDATE venues SET review_status = 'approved' WHERE city_id IS NOT NULL AND review_status = 'pending';
UPDATE events SET review_status = 'approved' WHERE city_id IS NOT NULL AND review_status = 'pending';
