-- Marketplace anon visibility: grant SELECT on the two read-only,
-- public-safe tables the /marketplace landing hits before sign-in.
--
-- fx_rates           — daily exchange rates used to convert card prices
--                      into the visitor's display currency (useCurrency +
--                      useFxRates). Anon hit produced 401 in console.
-- marketplace_price_history — observations used to detect "Price drops"
--                      and render the per-listing sparkline. Prices
--                      themselves are already public on the listings.
--
-- Neither contains PII or anything not already exposed elsewhere.

GRANT SELECT ON fx_rates TO anon;
GRANT SELECT ON marketplace_price_history TO anon;

-- Re-iterate authenticated grants in case future migrations widen the
-- policy without remembering anon.
GRANT SELECT ON fx_rates TO authenticated;
GRANT SELECT ON marketplace_price_history TO authenticated;

-- Add anon-readable policies. If a permissive policy with the same name
-- already exists it stays — these are additive USING (true) reads.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fx_rates'
      AND policyname = 'fx_rates_public_read'
  ) THEN
    CREATE POLICY "fx_rates_public_read" ON fx_rates FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'marketplace_price_history'
      AND policyname = 'marketplace_price_history_public_read'
  ) THEN
    CREATE POLICY "marketplace_price_history_public_read"
      ON marketplace_price_history FOR SELECT USING (true);
  END IF;
END$$;
