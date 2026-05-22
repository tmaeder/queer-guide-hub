-- D5 follow-up: backfill venues.country_id from the `country` text
-- column when it holds an ISO-2 code that matches countries.code.
--
-- Context. The venue detail breadcrumb used to fall back to the raw
-- text column (`venue.country`) when the joined FK was null, which
-- surfaced ISO codes like "CH" and "DE" in the trail. The frontend
-- now omits the segment when country_id is null. This backfill
-- restores the country breadcrumb for the ~9,247 venues that had a
-- valid ISO code sitting in the text column.
--
-- Audited live on 2026-05-22 — every distinct ISO-2 in venues.country
-- matched exactly one row in countries.code; 9,247 venues updated.

UPDATE venues v
SET country_id = c.id
FROM countries c
WHERE v.country_id IS NULL
  AND v.country IS NOT NULL
  AND length(v.country) = 2
  AND upper(c.code) = upper(v.country);
