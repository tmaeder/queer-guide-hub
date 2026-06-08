-- Marketplace Tagging Truth Engine — P1a: deterministic content_rating axis.
-- Design: docs/plans/2026-06-08-marketplace-tagging-design.md §1/§2.
--
-- The existing adult signal (sensitivity_flags @> '["adult"]') is broken: its backfill
-- keyed on slugs that don't match the real vocab (fetish_gear vs fetish_wear, bdsm vs
-- bdsm_and_bondage), so whole adult departments are mostly unflagged (sex_toys 456/2931,
-- bdsm 499/1676; 2726 total vs ~5000 expected). The 18+ badge + age-gate read that flag,
-- so both misfire today.
--
-- Fix: a 4-tier content_rating (sfw/suggestive/adult/explicit) derived purely from
-- department + keyword signals, as a STORED GENERATED column. Correct on every row for
-- free, self-maintaining on ingest. A generated-column ADD rewrites the table via DDL —
-- it does NOT fire the per-row trg_search_documents_marketplace, so no search-sync storm
-- on the disk-constrained DB (unlike a 13.8k-row UPDATE backfill would). The frontend
-- reads content_rating directly; sensitivity_flags is left untouched (legacy, harmless).
-- Idempotent; no CONCURRENTLY (runs in a txn).

-- ===== 1. pure derivation: department base, escalated by keyword signal =====
CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text, p_title text, p_description text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT
      lower(regexp_replace(coalesce(p_subcategory,''), '[\s\-]+', '_', 'g')) AS slug,
      lower(coalesce(p_title,'') || ' ' || coalesce(p_description,'')) AS txt
  ),
  ranked AS (
    SELECT GREATEST(
      -- department base
      CASE
        WHEN slug IN ('sex_toys','anal_toys','cock_rings_and_stretchers',
                      'pumps_and_enlargement','chastity','bdsm_and_bondage','pup_and_pet_play')
          THEN 4   -- explicit
        WHEN slug IN ('fetish_wear','fetish_gear')                  THEN 3   -- adult
        WHEN slug IN ('underwear_and_swimwear','underwear','swimwear') THEN 2 -- suggestive
        ELSE 1                                                              -- sfw
      END,
      -- keyword escalation (catches items misfiled in apparel/hygiene)
      CASE
        WHEN txt ~ '(dildo|butt ?plug|vibrator|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|strap[- ]?on|anal (plug|bead|douche|hook)|nipple clamp|urethral|e-?stim|stroker|onanism)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|enema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M)'
          THEN 2
        ELSE 1
      END
    ) AS rank
    FROM s
  )
  SELECT CASE (SELECT rank FROM ranked)
           WHEN 4 THEN 'explicit'
           WHEN 3 THEN 'adult'
           WHEN 2 THEN 'suggestive'
           ELSE 'sfw'
         END;
$$;

-- ===== 2. generated column (storm-free: DDL rewrite, not row DML) =====
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS content_rating text
  GENERATED ALWAYS AS (
    public.marketplace_content_rating(subcategory, title, description)
  ) STORED;

-- ===== 3. index for the default-SFW browse filter =====
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_content_rating
  ON public.marketplace_listings (content_rating)
  WHERE status = 'active';

COMMENT ON COLUMN public.marketplace_listings.content_rating IS
  'Derived browse-safety tier: sfw < suggestive < adult < explicit. STORED generated from '
  'subcategory + title + description via marketplace_content_rating(). Canonical adult signal '
  '(supersedes the under-populated sensitivity_flags). Frontend hides adult/explicit by default.';
