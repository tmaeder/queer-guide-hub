-- Add 'toilet' to venues_category_check.
--
-- 740 venues sourced from refuge-restrooms (a gender-neutral / accessible public
-- restroom database) are public toilets. The category vocabulary had no slot for them,
-- so they could only ever be 'other' -- a genuine impossibility rather than a
-- classifier failure, and one no amount of inference could fix.
--
-- The orphaned public.venue_categories vocabulary table already carries a "Toilet" row.
-- It has no FK to venues.category and matches 0 rows against it, so it could not be
-- used as the source of truth here.
--
-- Every surface that renders a category needs the new value or it renders blank; they
-- are fed from src/lib/venueCategories.ts, which is guarded by a drift test against
-- this constraint.

ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_category_check;

ALTER TABLE public.venues ADD CONSTRAINT venues_category_check CHECK (
  category = ANY (ARRAY[
    'bar','club','cafe','restaurant','hotel','sauna','cruising','outdoor','shop',
    'community_center','organization','event-venue','theater','gallery','salon','gym',
    'toilet','other'
  ])
);

-- Provenance here is unambiguous -- the source IS a restroom database -- so this is a
-- direct backfill, not an inference. Guarded to rows still sitting in 'other' so it
-- never overwrites a curated category, and to rows whose ONLY source is
-- refuge-restrooms, so a venue that merely also appears in that database (8 of the 740)
-- is left alone rather than relabelled a toilet.
--
-- Batched at 300: trg_search_documents_venue fires on every UPDATE and this database is
-- disk-constrained. A single 732-row statement risks the statement timeout, and a
-- timeout is a full rollback of the migration.
DO $$
DECLARE
  v_rows int;
BEGIN
  LOOP
    WITH batch AS (
      SELECT v.id
      FROM public.venues v
      WHERE v.duplicate_of_id IS NULL
        AND v.category = 'other'
        AND EXISTS (
          SELECT 1 FROM public.venue_sources s
          WHERE s.venue_id = v.id AND s.source_slug = 'refuge-restrooms'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.venue_sources s2
          WHERE s2.venue_id = v.id AND s2.source_slug <> 'refuge-restrooms'
        )
      LIMIT 300
    )
    UPDATE public.venues v
    SET category = 'toilet',
        enrichment_status = jsonb_set(
          coalesce(v.enrichment_status, '{}'::jsonb),
          '{category_backfill}',
          jsonb_build_object(
            'from', v.category, 'to', 'toilet',
            'source', 'refuge-restrooms', 'confidence', 1.0
          )
        )
    FROM batch b
    WHERE v.id = b.id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
    RAISE NOTICE 'venue category toilet backfill: % rows', v_rows;
  END LOOP;
END $$;
