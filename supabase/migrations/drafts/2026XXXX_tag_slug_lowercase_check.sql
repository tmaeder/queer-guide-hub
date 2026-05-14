-- =============================================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW
-- P1-7 server-side follow-up: enforce lowercase tag slugs.
--
-- Background: P1-7 (PR #793) added a client-side replace-navigate that
-- canonicalizes /resources/<Slug> → /resources/<slug>. New tag rows
-- created via the contribute flow can still bypass this if the form
-- doesn't lowercase before insert. This migration:
--   1. Backfills any existing non-lowercase slug.
--   2. Adds a CHECK constraint preventing future drift.
--   3. Adds a defensive BEFORE INSERT/UPDATE trigger that lowercases.
--
-- Note: backfill must run before the constraint, and the trigger is
-- redundant-but-safe insurance against forms that bypass validation.
-- =============================================================================

BEGIN;

-- 1. Backfill. Touches only rows where slug differs from lower(slug).
--    Watch for slug collisions: if Foo and foo both exist, the UPDATE
--    will fail on the unique constraint. Pre-flight query:
--
--      SELECT lower(slug) AS s, count(*)
--      FROM public.unified_tags
--      GROUP BY lower(slug)
--      HAVING count(*) > 1;
--
--    Resolve collisions by hand before running this migration.
UPDATE public.unified_tags
SET slug = lower(slug)
WHERE slug IS NOT NULL AND slug <> lower(slug);

-- 2. CHECK constraint. NOT VALID first so we can ALTER VALIDATE in a
--    separate transaction if the table is large.
ALTER TABLE public.unified_tags
  ADD CONSTRAINT unified_tags_slug_lowercase_chk
  CHECK (slug = lower(slug))
  NOT VALID;

ALTER TABLE public.unified_tags
  VALIDATE CONSTRAINT unified_tags_slug_lowercase_chk;

-- 3. Belt-and-braces trigger. Lowercases on insert/update so contribute
--    forms that forget to lowercase still produce valid rows.
CREATE OR REPLACE FUNCTION public.unified_tags_lowercase_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    NEW.slug := lower(NEW.slug);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unified_tags_lowercase_slug_trigger ON public.unified_tags;
CREATE TRIGGER unified_tags_lowercase_slug_trigger
  BEFORE INSERT OR UPDATE OF slug
  ON public.unified_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.unified_tags_lowercase_slug();

COMMIT;
