-- Fix two venues wrongly assigned to Winterthur that are actually in Zürich.
--
-- Reported via feedback story "Heile Welt AG" (ae6a34da-…): a venue showed
-- city "Winterthur" but its map pin sat in Zürich — "should rather be Heaven".
--
-- Both records are the Heaven club at Spitalgasse 5, 8001 Zürich
-- ("Heile Welt AG" is the operating company). Their coordinates
-- (47.3735, 8.5442) and address match every other Spitalgasse-5 Zürich venue,
-- but city/city_id were set to Winterthur (47.50, 8.72 — ~15 km off).
--
-- Safe: targets exactly the two known ids, only when still mis-tagged Winterthur.
-- Idempotent: re-running is a no-op once corrected.
-- Reversible: see DOWN section at bottom (commented out).

BEGIN;

UPDATE venues
SET city = 'Zürich',
    city_id = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf', -- Zürich
    updated_at = now()
WHERE id IN (
    '0b7ecfb1-311f-4acf-9bcb-b761b8e151fe', -- "Heile Welt AG" (reported)
    'd1771f21-c51e-45b7-a14e-68a5c7662faf'  -- "Heaven" (same address, same bug)
  )
  AND city_id = '05599810-ae82-4f75-95e5-8f31f1ecc6fe'; -- only if still Winterthur

COMMIT;

-- DOWN (manual rollback):
-- UPDATE venues
-- SET city = 'Winterthur',
--     city_id = '05599810-ae82-4f75-95e5-8f31f1ecc6fe',
--     updated_at = now()
-- WHERE id IN (
--     '0b7ecfb1-311f-4acf-9bcb-b761b8e151fe',
--     'd1771f21-c51e-45b7-a14e-68a5c7662faf'
--   );
