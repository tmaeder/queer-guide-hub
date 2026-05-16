-- =============================================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW
-- P2-3 server-side draft: split unified_tags into resource taxonomy vs
-- venue features.
--
-- Background: the bug report's P2-3 calls for splitting "Popular tags"
-- on /resources into two sections — "Concepts" (resource taxonomy) and
-- "Venue features" — because the current Popular tags strip mixes them.
-- Without an entity_kind column the frontend can't tell them apart.
-- =============================================================================

BEGIN;

CREATE TYPE public.tag_entity_kind AS ENUM (
  'concept',         -- resource taxonomy (BDSM, Trans, Coming Out, ...)
  'venue_feature',   -- venue/event/group attributes (Wheelchair-accessible, Outdoor, ...)
  'practice',        -- practices/play (overlap with concept; pick one)
  'aesthetic'        -- gear/aesthetics (overlap with concept; pick one)
);

ALTER TABLE public.unified_tags
  ADD COLUMN IF NOT EXISTS entity_kind public.tag_entity_kind
    NOT NULL DEFAULT 'concept';

-- Backfill rule (rough — review carefully):
--   - Tags assigned to "Places & Travel" or "Safety & Practices > Physical"
--     parent categories → 'venue_feature'.
--   - Everything else → 'concept'.
--
-- Refine this in the migration PR after auditing actual taxonomy
-- assignments.
WITH venue_categories AS (
  SELECT id FROM public.tag_categories WHERE name IN (
    'Venues & Nightlife',
    'Travel & Destinations',
    'Safe Spaces',
    'Accommodation'
  )
)
UPDATE public.unified_tags ut
SET entity_kind = 'venue_feature'
WHERE EXISTS (
  SELECT 1
  FROM public.tag_category_assignments tca
  WHERE tca.tag_id = ut.id
    AND tca.category_id IN (SELECT id FROM venue_categories)
);

CREATE INDEX IF NOT EXISTS idx_unified_tags_entity_kind
  ON public.unified_tags (entity_kind);

COMMIT;

-- Frontend follow-up (separate PR):
--   1. useCentralizedTags exposes entity_kind on each tag.
--   2. Resources landing splits Popular tags into two sections:
--      "Concepts" and "Venue features", reading entity_kind.
--   3. Admin tag editor has a control to set entity_kind per tag.
