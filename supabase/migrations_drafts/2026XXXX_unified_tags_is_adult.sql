-- =============================================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW
-- P0-3 server-side follow-up: tag-level adult-content flag.
--
-- Background: P0-3 (PR #786) shipped a client-only age gate that detects
-- Sex & Kink content via string match on tag_categories.name. The category
-- list lives in src/components/resources/categoryMeta.ts and is duplicated
-- (deliberately, until this migration lands) for the gate filter.
--
-- Goal: move the gate authority server-side via unified_tags.is_adult so
--   1. queries can short-circuit 18+ rows for safe-mode users without a
--      client filter, and
--   2. row-level security can be tightened later if needed (e.g.
--      block 18+ tags from anonymous SELECT entirely).
--
-- Backfill rule:
--   is_adult = TRUE for any tag whose primary category (or that category's
--   parent) is one of the ADULT_CATEGORY_NAMES set in the frontend code.
-- =============================================================================

BEGIN;

-- 1. Column with sane default. NOT NULL with DEFAULT FALSE so existing
--    rows backfill before we add a NOT NULL constraint in step 3.
ALTER TABLE public.unified_tags
  ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT FALSE;

-- 2. Backfill from the canonical category names. This list mirrors
--    ADULT_CATEGORY_NAMES in src/components/resources/categoryMeta.ts.
WITH adult_category_ids AS (
  SELECT id
  FROM public.tag_categories
  WHERE name IN (
    'Sexuality & Kink',
    'Sexual Roles',
    'BDSM & Power Exchange',
    'Fetishes & Interests',
    'Practices & Play',
    'Gear & Aesthetics',
    'Body Types & Archetypes'
  )
),
parent_adult_category_ids AS (
  -- Also count children of "Sexuality & Kink" as adult (defence in depth
  -- if the leaves above are renamed but the parent link stays).
  SELECT id
  FROM public.tag_categories
  WHERE parent_id IN (
    SELECT id FROM public.tag_categories WHERE name = 'Sexuality & Kink'
  )
),
adult_tag_ids AS (
  SELECT DISTINCT tca.tag_id
  FROM public.tag_category_assignments tca
  WHERE tca.category_id IN (SELECT id FROM adult_category_ids)
     OR tca.category_id IN (SELECT id FROM parent_adult_category_ids)
)
UPDATE public.unified_tags ut
SET is_adult = TRUE
WHERE ut.id IN (SELECT tag_id FROM adult_tag_ids);

-- 3. Index for the safe-mode WHERE filter.
CREATE INDEX IF NOT EXISTS idx_unified_tags_is_adult
  ON public.unified_tags (is_adult)
  WHERE is_adult = TRUE;

-- 4. Audit trigger so admin edits to tag→category assignments keep
--    is_adult in sync. Recomputes per-tag whenever an assignment changes.
CREATE OR REPLACE FUNCTION public.unified_tags_recompute_is_adult()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tag_id uuid := COALESCE(NEW.tag_id, OLD.tag_id);
  v_is_adult boolean;
BEGIN
  IF v_tag_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tag_category_assignments tca
    JOIN public.tag_categories tc ON tc.id = tca.category_id
    LEFT JOIN public.tag_categories tcp ON tcp.id = tc.parent_id
    WHERE tca.tag_id = v_tag_id
      AND (
        tc.name IN (
          'Sexuality & Kink',
          'Sexual Roles',
          'BDSM & Power Exchange',
          'Fetishes & Interests',
          'Practices & Play',
          'Gear & Aesthetics',
          'Body Types & Archetypes'
        )
        OR tcp.name = 'Sexuality & Kink'
      )
  ) INTO v_is_adult;

  UPDATE public.unified_tags
  SET is_adult = v_is_adult
  WHERE id = v_tag_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS unified_tags_recompute_is_adult_trigger
  ON public.tag_category_assignments;
CREATE TRIGGER unified_tags_recompute_is_adult_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.tag_category_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.unified_tags_recompute_is_adult();

COMMIT;

-- Frontend follow-up (separate PR after this lands):
--   1. Read `is_adult` in useCentralizedTags / useTagGraph and remove
--      the duplicate string list from categoryMeta.ts.
--   2. SafeModeProvider.shouldHide takes a single boolean from the row
--      instead of a category-name array.
--   3. Audit search / RLS to ensure 18+ rows are filtered server-side
--      under safe mode.
