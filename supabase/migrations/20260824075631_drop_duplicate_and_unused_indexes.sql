-- Index cleanup, part 2 (cost/efficiency audit, 2026-08-24).
--
-- Duplicate index: `tag_relations_uniq` (added 20260724120000) duplicates the
-- baseline UNIQUE constraint `tag_relations_source_tag_id_target_tag_id_relation_type_key`
-- on the exact same columns (source_tag_id, target_tag_id, relation_type) --
-- confirmed identical column lists, no predicate on either. Both get real
-- traffic (Postgres splits ON CONFLICT lookups across whichever matching unique
-- index it picks), so this isn't dead weight, just redundant: one index would
-- serve every query either currently serves. Keeping the constraint-backed one
-- (it's the formally-named uniqueness guarantee) and dropping the later add-on.
DROP INDEX IF EXISTS public.tag_relations_uniq;

-- Unused indexes (idx_scan = 0; stats_reset is NULL on this instance, so this
-- is a genuine multi-week zero, not a post-restart artifact -- same check
-- 20260810075202 used for the previous round of this cleanup). Each adds write
-- overhead to every INSERT/UPDATE on its table for zero read benefit.
--
-- Deliberately NOT included: search_documents_geog_gix, user_presence_geog_gist
-- -- geospatial GIST indexes backing proximity search/nearby-user features,
-- excluded from the 20260810075202 pass for the same reason and still true here.
DROP INDEX IF EXISTS public.hotels_closure_status_idx;
DROP INDEX IF EXISTS public.queer_villages_closure_status_idx;
DROP INDEX IF EXISTS public.geo_landmark_profiles_closure_status_idx;
DROP INDEX IF EXISTS public.idx_marketplace_listings_attributes;
DROP INDEX IF EXISTS public.idx_marketplace_listings_sizes;
DROP INDEX IF EXISTS public.idx_marketplace_listings_colors;
DROP INDEX IF EXISTS public.marketplace_listing_variants_size_idx;
DROP INDEX IF EXISTS public.marketplace_listing_variants_color_idx;
DROP INDEX IF EXISTS public.idx_milestone_quality_signals_mid;
DROP INDEX IF EXISTS public.idx_milestone_quality_signals_created;
DROP INDEX IF EXISTS public.idx_milestone_coverage_gaps_status;
