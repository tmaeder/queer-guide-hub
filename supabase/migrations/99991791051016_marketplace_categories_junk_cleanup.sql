-- `marketplace_categories` is not the marketplace's taxonomy, and 257 of its
-- 267 rows are scraped product text (2026-10-03 glossary pass, part 3).
--
-- WHAT THIS TABLE IS. Nothing reads it. Measured across the whole repo: no
-- page, hook, component, edge function, worker or script references it; the
-- only consumers are `commit_marketplace_staging_item` and
-- `commit_marketplace_staging_batch`, which SELECT a `category_id` by
-- name/slug on commit. The live browse taxonomy is the three-tier classifier
-- (`subcategory_group` / `subcategory_fine` / `department`) and has been since
-- v1 — which is why this table could rot for a year without anyone noticing.
--
-- WHAT THE ROWS ARE. 267 rows: 10 active generic placeholders ("Clothing &
-- Fashion", "Technology", "Other") and 257 inactive rows created on ONE DAY,
-- 2025-07-23, by an importer that pushed merchant product-description text
-- into the slug column. A sample of the shortest and most word-like of them:
--
--     glycerin | sucrose | stearic-acid | sodium-methylparaben | raising-agent
--     myjoytoys-ltd | plusshop-uk | tantaly-uk | cerqular
--     a-softer | while-the-broad | with-a-rounded | the-stretchy
--     best-sellers | new-arrival | all-products
--
-- — i.e. INGREDIENT lists, MERCHANT names, SENTENCE FRAGMENTS and storefront
-- nav labels. The rest run to hundreds of characters ("and-5-feet-of-flexible-
-- tubing-the-water-bottle-is-made-of-premium…") or are bare prices ("49-99").
-- None is a category under any reading.
--
-- THERE IS NO PRODUCER TO SEAL, which is why this file only cleans up.
-- Measured on prod: ZERO functions in the schema INSERT into this table, the
-- two that mention it only read, and every junk row shares a single
-- `created_at` date thirteen months ago. This was one bad import, not a
-- running process — so a guard here would watch a door nothing walks through.
-- If a future importer starts writing categories again, the right fix is at
-- that importer, not a trigger here.
--
-- HARD DELETE, WITH A FULL SNAPSHOT. The standing convention in this repo is
-- reversible soft-archive, and these rows ARE already `is_active = false` —
-- that is precisely the problem: they have been soft-deleted for a year and
-- are still junk, still enumerable, and still a trap for the next person who
-- opens the table looking for the taxonomy. Precedent for a hard delete behind
-- a jsonb audit is `nonplace_city_deletion_audit` (20261001120000). The audit
-- row is the only way back and is therefore the whole row, not a summary.
--
-- SAFE BY MEASUREMENT, NOT BY ASSUMPTION: 0 of the 257 are referenced by any
-- listing (`marketplace_listings.category_id`), and only 11 listings carry a
-- category at all — all of them pointing at 2 of the 10 ACTIVE rows, which
-- this file does not touch.

CREATE TABLE IF NOT EXISTS public.marketplace_category_junk_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_row jsonb       NOT NULL,
  reason       text        NOT NULL,
  deleted_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marketplace_category_junk_audit IS
  'Full-row snapshots of marketplace_categories rows deleted as scraped import '
  'junk. The only way back — these were hard-deleted, not archived.';

ALTER TABLE public.marketplace_category_junk_audit ENABLE ROW LEVEL SECURITY;

-- No policy: service_role bypasses RLS, and nothing else has any business
-- reading a deletion audit. An un-policied RLS table is closed to anon and
-- authenticated by default, which is the intent.

DO $cleanup$
DECLARE
  v_referenced integer;
  v_deleted    integer;
  v_remaining  integer;
BEGIN
  -- Refuse rather than cascade if the premise has changed since it was
  -- measured. A listing pointing at a junk row means somebody started using
  -- this table again and the whole diagnosis above needs redoing.
  SELECT count(*) INTO v_referenced
  FROM public.marketplace_categories c
  WHERE NOT c.is_active
    AND EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.category_id = c.id);

  IF v_referenced > 0 THEN
    RAISE EXCEPTION
      'aborting: % inactive categories are referenced by listings — the premise that none are has changed',
      v_referenced;
  END IF;

  INSERT INTO public.marketplace_category_junk_audit (category_row, reason)
  SELECT to_jsonb(c), 'scraped import junk, 2025-07-23 import; no listings, no readers'
  FROM public.marketplace_categories c
  WHERE NOT c.is_active;

  DELETE FROM public.marketplace_categories WHERE NOT is_active;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM public.marketplace_categories;

  RAISE NOTICE 'marketplace_categories: deleted %, % remain', v_deleted, v_remaining;
END $cleanup$;

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Asserts the REACHED STATE, not a delete count: a re-run deletes 0 and must
-- still pass, and a concurrent cleanup must not turn this into a `db push`
-- abort that blocks every migration queued behind it.
DO $verify$
DECLARE
  v_inactive  integer;
  v_total     integer;
  v_orphaned  integer;
  v_audited   integer;
BEGIN
  SELECT count(*) FILTER (WHERE NOT is_active), count(*)
    INTO v_inactive, v_total
  FROM public.marketplace_categories;

  IF v_inactive <> 0 THEN
    RAISE EXCEPTION 'cleanup left % inactive categories behind', v_inactive;
  END IF;

  -- The ten real rows must survive. Deleting the table's entire contents would
  -- also satisfy "no inactive rows left", and would break the commit path's
  -- category lookup.
  IF v_total < 10 THEN
    RAISE EXCEPTION 'only % categories remain — the active rows were taken too', v_total;
  END IF;

  -- Nothing may have been orphaned. `category_id` has no ON DELETE, so a
  -- referenced row would have raised above; this re-checks from the other end.
  SELECT count(*) INTO v_orphaned
  FROM public.marketplace_listings l
  WHERE l.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.marketplace_categories c WHERE c.id = l.category_id);
  IF v_orphaned > 0 THEN
    RAISE EXCEPTION '% listings now point at a deleted category', v_orphaned;
  END IF;

  -- And the deletions must be recoverable. An empty audit alongside a cleaned
  -- table means the snapshot step was skipped and the rows are simply gone.
  SELECT count(*) INTO v_audited FROM public.marketplace_category_junk_audit;
  IF v_audited = 0 THEN
    RAISE EXCEPTION 'table cleaned but the audit is empty — deletions are unrecoverable';
  END IF;

  RAISE NOTICE 'marketplace_categories clean: % rows remain, % snapshotted', v_total, v_audited;
END $verify$;
