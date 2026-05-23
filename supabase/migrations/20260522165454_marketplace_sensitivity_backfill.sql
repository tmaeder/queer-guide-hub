-- Backfill `adult` into marketplace_listings.sensitivity_flags (jsonb)
-- for listings whose subcategory is unambiguously adult. The frontend
-- AdultContentGate keys off this flag to show an 18+ acknowledgement
-- dialog. Idempotent — only appends when the flag isn't already
-- present and the existing payload is a JSON array.

UPDATE public.marketplace_listings
SET sensitivity_flags = COALESCE(sensitivity_flags, '[]'::jsonb) || '["adult"]'::jsonb
WHERE status = 'active'
  AND subcategory_slug IN ('fetish_gear', 'sex_toys', 'lubricant', 'bdsm', 'adult_toys')
  AND jsonb_typeof(COALESCE(sensitivity_flags, '[]'::jsonb)) = 'array'
  AND NOT (sensitivity_flags @> '["adult"]'::jsonb);
