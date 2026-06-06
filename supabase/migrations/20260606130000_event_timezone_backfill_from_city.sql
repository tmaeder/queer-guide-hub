-- Trust-&-safety audit M-3 (follow-up to 20260606122000): backfill event
-- timezone from the CITY's IANA zone, which is accurate even inside multi-zone
-- countries (Chicago=America/Chicago, Perth=Australia/Perth) — unlike the
-- country-level zone used in the prior pass. Idempotent: only fills NULLs and
-- only from a valid IANA value (contains '/').

UPDATE events e
SET timezone = c.timezone
FROM cities c
WHERE e.city_id = c.id
  AND e.duplicate_of_id IS NULL
  AND (e.timezone IS NULL OR e.timezone = '')
  AND c.timezone IS NOT NULL
  AND c.timezone LIKE '%/%';
