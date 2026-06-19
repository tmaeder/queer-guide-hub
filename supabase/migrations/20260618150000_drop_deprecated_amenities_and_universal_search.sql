-- Tech-debt #24 (2026-06-18 audit): retire deprecated objects now that every
-- live code reader has been removed.
--
--   * venue_amenities          -- replaced by the controlled public.amenities vocabulary
--                                 (Amenity Truth Engine). 43-row catalog; no FK junction
--                                 referenced it. Admin CRUD page + import-helper writers gone.
--   * attributes               -- generic entity-attribute catalog; only reader was the
--   * entity_attribute_assignments  orphan get_entity_attributes() RPC (0 code callers) and
--                                 its 0-row junction.
--   * get_entity_attributes()  -- orphan RPC over the two tables above.
--   * universal_search()       -- legacy FTS search RPC, superseded end-to-end by the
--                                 search-proxy worker + search_hybrid(). Zero live callers
--                                 (the only "universal_search*" string in the app is the
--                                 'universal_searchbar' analytics source tag).
--
-- All DROPs are IF EXISTS so the migration is idempotent / safe if partially applied.

-- Orphan RPC first (depends on attributes + entity_attribute_assignments).
DROP FUNCTION IF EXISTS public.get_entity_attributes(uuid, text);

-- FK child before parent.
DROP TABLE IF EXISTS public.entity_attribute_assignments;
DROP TABLE IF EXISTS public.attributes;

-- Standalone deprecated catalog.
DROP TABLE IF EXISTS public.venue_amenities;

-- Legacy search RPC (single 9-arg overload).
DROP FUNCTION IF EXISTS public.universal_search(
  text, text[], integer, text, boolean,
  double precision, double precision, double precision, text
);
