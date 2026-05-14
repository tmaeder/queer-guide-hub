-- Recategorize mis-tagged venues in the 'bar' category.
-- Many spas, salons, theaters, fitness centers, and barbershops were imported
-- as category='bar'. This migration corrects them based on name patterns.
--
-- Safe: only touches rows where category='bar' AND name matches a non-bar pattern.
-- Reversible: see DOWN section at bottom (commented out).

BEGIN;

-- Spas / massage → sauna (closest existing category)
UPDATE venues
SET category = 'sauna', updated_at = now()
WHERE category = 'bar'
  AND (
    name ILIKE '%spa%'
    OR name ILIKE '%massage%'
    OR name ILIKE '%tanning%'
  )
  AND name NOT ILIKE '%spar%'     -- exclude "Sparrow" etc.
  AND name NOT ILIKE '%sparkle%';

-- Hair / barbershop / salon → salon
UPDATE venues
SET category = 'salon', updated_at = now()
WHERE category = 'bar'
  AND (
    name ILIKE '%barber%'
    OR name ILIKE '%hair%'
    OR name ILIKE '%salon%'
    OR name ILIKE '%styling%'
    OR name ILIKE '%makeup%'
    OR name ILIKE '%laser hair%'
  )
  AND name NOT ILIKE '%bar %& %'  -- exclude "Bar & Salon" dual-purpose
  AND name NOT ILIKE '%hair of the dog%'; -- actual bar name

-- Theater / theatre → theater (new canonical category)
UPDATE venues
SET category = 'theater', updated_at = now()
WHERE category = 'bar'
  AND (
    name ILIKE '%theatre%'
    OR name ILIKE '%theater%'
  )
  AND name NOT ILIKE '%bar%';  -- keep "Tron Theatre Bar & Kitchen"

-- Gym / fitness → gym
UPDATE venues
SET category = 'gym', updated_at = now()
WHERE category = 'bar'
  AND (
    name ILIKE '%fitness%'
    OR name ILIKE '%gymnasium%'
  )
  AND name NOT ILIKE '%bar%'
  AND name NOT ILIKE '%café%';  -- exclude "Café & Fitness Center" combos

COMMIT;

-- ── DOWN (rollback) ─────────────────────────────────────────────────────────
-- To reverse, run:
--
-- UPDATE venues SET category = 'bar', updated_at = now()
-- WHERE category IN ('sauna', 'salon', 'theater', 'gym')
--   AND updated_at >= '2026-05-05T10:00:00Z'
--   AND updated_at < '2026-05-05T10:01:00Z';
