-- Classifier v3 regen + attribute columns (companion to 20260926100000).
--
-- Regenerates subcategory_group / department against the v3 vocabulary and
-- adds the finer-categorisation surface in the SAME rewrite pass:
--   subcategory_fine        — nullable third tier (STORED, v3 fine ladder)
--   attributes jsonb        — canonical listing attributes (see COMMENT below);
--                             written only by the marketplace-variant-backfill
--                             runner (PR 3), default '{}'.
--   attributes_extracted_at — the runner's resume marker (tagged_at pattern)
--   sizes / colors text[]   — GENERATED from attributes; the filterable,
--                             GIN-indexable mirror of the two highest-traffic
--                             attribute axes (PostgREST `ov` pushdown).
--
-- content_rating is deliberately NOT touched — its function did not change in
-- v3, and re-adding it would re-litigate the v2 search delete/enqueue block.
-- Group/department value changes have no search consequence today: the
-- marketplace search facets don't yet carry them (that lands in PR 5 with an
-- explicit reindex), and index eligibility is content_rating-only.
--
-- Two ALTERs = two table rewrites (~134 MB heap each, no row triggers, no
-- search storm). Split is deliberate: the sizes/colors generation expressions
-- reference the attributes column, and referencing a column added in the same
-- ALTER is not portable — a second rewrite is cheap; a failed migration is not.
--
-- LOCK ACQUISITION IS A RETRY LOOP, NOT A SINGLE SHOT. The v2 precedent
-- (20260822131224) took one 5s attempt at the AccessExclusive lock and got it;
-- this migration's first production run did NOT — `db push` aborted with
-- SQLSTATE 55P03 at 12:49 UTC and the six migrations behind it never applied,
-- while the edge functions deployed anyway (new code, old schema).
-- `marketplace_listings` is read continuously by browse, so a 5s window only
-- succeeds if it happens to land in a gap. Fail-fast is still right — queueing
-- an AccessExclusive request behind live traffic stalls every reader behind it
-- — but the correct shape is fail fast AND try again: each attempt waits at
-- most 5s, releases on timeout (so no reader ever queues behind us), sleeps,
-- and retries. Bounded at ~2 min so a genuinely stuck table still fails the
-- run loudly instead of hanging CI.
--
-- The lock is taken in the same transaction as the ALTERs, so once acquired it
-- is held through both rewrites and they cannot block.
--
-- STATEMENT_TIMEOUT MUST BE RAISED, AND AS ITS OWN TOP-LEVEL STATEMENT. The
-- cluster default is 2min. The second production attempt DID acquire the lock
-- and then died at ~2min mid-rewrite (`canceling statement due to statement
-- timeout`) — the rewrite recomputes three generated columns per row and the
-- new fine ladder alone evaluates ~90 regexes on each of 62k rows. Raising the
-- GUC from inside a DO block would be a no-op: the timer is armed when the
-- top-level statement starts, so a function cannot extend its own budget
-- (measured 2026-08-19, see the pg_cron precedent in 20260819* / PR #2871).
-- Issued here as a standalone statement, it is in force when each ALTER below
-- is armed. Session-scoped (not LOCAL) so it holds whether or not the CLI
-- wraps this file in a transaction.
--
-- COST, MEASURED: the first ALTER alone ran >2min, so the two rewrites block
-- all marketplace reads for roughly 3-5 minutes. That is the price of
-- recomputing the taxonomy in place and it is paid once.
SET statement_timeout = '15min';

DO $$
DECLARE
  v_attempt int := 0;
BEGIN
  LOOP
    BEGIN
      SET LOCAL lock_timeout = '5s';
      LOCK TABLE public.marketplace_listings IN ACCESS EXCLUSIVE MODE;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 12 THEN
        RAISE EXCEPTION
          'marketplace_listings stayed busy for % attempts — regen not applied', v_attempt;
      END IF;
      PERFORM pg_sleep(5);
    END;
  END LOOP;
END $$;

-- Lock already held; this only bounds incidental index/toast locks below.
SET LOCAL lock_timeout = '30s';

ALTER TABLE public.marketplace_listings
  DROP COLUMN subcategory_group,
  DROP COLUMN department,
  ADD COLUMN subcategory_group text GENERATED ALWAYS AS (public.marketplace_subcategory_group(subcategory, title)) STORED,
  ADD COLUMN department text GENERATED ALWAYS AS (public.marketplace_department(subcategory, title)) STORED,
  ADD COLUMN subcategory_fine text GENERATED ALWAYS AS (public.marketplace_subcategory_fine(subcategory, title)) STORED,
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN attributes_extracted_at timestamptz;

ALTER TABLE public.marketplace_listings
  ADD COLUMN sizes text[] GENERATED ALWAYS AS (public.jsonb_text_array(attributes->'size')) STORED,
  ADD COLUMN colors text[] GENERATED ALWAYS AS (public.jsonb_text_array(attributes->'color')) STORED;

COMMENT ON COLUMN public.marketplace_listings.attributes IS
  'Canonical product attributes, written ONLY by marketplace-variant-backfill. '
  'Whitelisted keys; arrays hold canonical bare slugs (no namespace prefix): '
  '{"color":["black","rainbow"],"size":["s","m","eu-38","w32"],"material":["cotton"],'
  '"genre":["memoir"],"fit":["femme-cut"],"condition":"new","gtin":"…","dimensions":"…"}. '
  'sizes/colors are GENERATED mirrors for array-overlap filtering; the tag mirror '
  '(color-*/size-*/genre-*/fit-* in unified_tags) is derived from this column too.';

-- Re-create the two indexes the DROP COLUMN took down + the new surface.
CREATE INDEX idx_marketplace_listings_subcategory_group
  ON public.marketplace_listings USING btree (subcategory_group) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_department
  ON public.marketplace_listings USING btree (department) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_subcategory_fine
  ON public.marketplace_listings USING btree (subcategory_fine) WHERE (status = 'active'::text);
CREATE INDEX idx_marketplace_listings_attributes
  ON public.marketplace_listings USING gin (attributes jsonb_path_ops);
CREATE INDEX idx_marketplace_listings_sizes
  ON public.marketplace_listings USING gin (sizes);
CREATE INDEX idx_marketplace_listings_colors
  ON public.marketplace_listings USING gin (colors);

-- ── Fine-tier counts (browse sub-tiles) — same gate/grant pattern as
--    get_marketplace_subcategory_group_counts (20260709100500) ────────────────
CREATE OR REPLACE FUNCTION public.get_marketplace_subcategory_fine_counts(
  p_department text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_include_adult boolean DEFAULT false)
RETURNS TABLE(fine text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT subcategory_fine AS fine, count(*)::bigint AS count
  FROM public.marketplace_listings
  WHERE status = 'active'
    AND subcategory_fine IS NOT NULL
    AND (p_department IS NULL OR department = p_department)
    AND (p_subcategory_group IS NULL OR subcategory_group = p_subcategory_group)
    AND (p_include_adult OR content_rating IN ('sfw','suggestive'))
  GROUP BY subcategory_fine
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_subcategory_fine_counts(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_subcategory_fine_counts(text, text, boolean) TO anon, authenticated;
