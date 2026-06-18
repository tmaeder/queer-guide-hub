-- Tech-debt #24 (partial): drop the deprecated legacy FTS RPC universal_search().
--
-- Superseded by the Postgres hybrid search engine (search_hybrid + search_documents).
-- Verified dead 2026-06-18:
--   * 0 code callers (no .rpc('universal_search') anywhere in src/supabase/workers;
--     the only "universal_search" strings left were the auto-generated types file
--     and a 'universal_searchbar' telemetry source label).
--   * 0 other DB objects reference it (routines/views/triggers all 0).
-- Single overload exists; drop by its exact identity signature. IF EXISTS keeps
-- this idempotent.
--
-- NOTE: the other "deprecated" items in this area — the venue_amenities and
-- attributes tables — still have LIVE readers (the routed /admin venue-amenities
-- page + venue-import-helpers) and are intentionally NOT dropped here. They need
-- the readers migrated to the new amenities vocabulary first (tracked separately).

DROP FUNCTION IF EXISTS public.universal_search(
  text, text[], integer, text, boolean, double precision, double precision, double precision, text
);
