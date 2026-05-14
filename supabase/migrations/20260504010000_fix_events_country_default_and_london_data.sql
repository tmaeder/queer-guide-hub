-- Events Audit 2026-05 — P0.3
--
-- Two problems with `events.country`:
--   1. Default 'US' silently mis-tags any row that doesn't explicitly set it.
--      All London events ended up labeled "London, US" because no scraper /
--      ingestion path set country, so the column defaulted.
--   2. The text column drifts from the `country_id` FK to `countries(id)`.
--
-- This migration:
--   * Backfills `country_id` for rows where it's NULL but `country` matches
--     a known ISO code in the `countries` table.
--   * Fixes London/US rows to GB.
--   * Drops the misleading default 'US'.
--   * Re-derives the `country` text from `countries.code` for London-fixed
--     rows so the denormalized field stays consistent with the FK.
--
-- We do NOT drop the `country` column in this migration — too many call
-- sites and the trending worker still read it. A follow-up migration can
-- finish the denorm cleanup once code paths are migrated to read
-- `events.countries.code` everywhere.

BEGIN;

-- 1. Backfill country_id from country text where the FK is missing.
UPDATE public.events e
SET country_id = c.id
FROM public.countries c
WHERE e.country_id IS NULL
  AND e.country IS NOT NULL
  AND upper(e.country) = upper(c.code);

-- 2. Fix the London/US rows. Match cities by name (case-insensitive) and
--    only flip when current country claims US — keeps any legitimate US
--    "London" rows untouched (e.g. London, KY) by also requiring no
--    matching London-in-US city row in the cities table for those events.
WITH gb AS (
  SELECT id FROM public.countries WHERE code = 'GB'
)
UPDATE public.events e
SET
  country_id = (SELECT id FROM gb),
  country = 'GB'
WHERE lower(trim(e.city)) = 'london'
  AND e.country_id <> (SELECT id FROM gb)
  AND COALESCE(upper(e.country), 'US') = 'US'
  -- Only touch events whose linked city (if any) is in GB. If city_id
  -- is NULL we still flip — these are unmoderated rows that defaulted
  -- and there is no London, US city in our cities table today.
  AND (
    e.city_id IS NULL
    OR e.city_id IN (
      SELECT ci.id FROM public.cities ci
      WHERE lower(trim(ci.name)) = 'london' AND ci.country_id = (SELECT id FROM gb)
    )
  );

-- 3. Drop the misleading 'US' default. New rows must explicitly set country
--    (or country_id), or insert NULL.
ALTER TABLE public.events ALTER COLUMN country DROP DEFAULT;

COMMIT;
