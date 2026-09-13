-- ============================================================================
-- Requeue the 708 marketplace rows stranded at dedup_status='merge_candidate'
-- ============================================================================
--
-- These rows are in a state with NO READER. Measured on prod 2026-09-10:
--
--   commit_marketplace_staging_batch  requires
--       dedup_status IN ('unique','duplicate') OR IS NULL      → excludes them
--   pipeline-deduplicate's selector   requires
--       dedup_status = 'pending'                               → excludes them
--   human review                      requires a review_queue row
--       707 of the 708 have NONE                               → invisible
--
-- So they can never commit, never be re-evaluated, and never be reviewed. All
-- 708 are review_status='approved', but only 13 carry a reviewed_at — the other
-- 695 were approved by an automatic path while dedup_status stayed
-- 'merge_candidate', which is the same shape as the 2026-08-22 finding where
-- approve wrote review_status while every stage gated on ai_validation_status.
-- One column short, decisions discarded.
--
-- WHY THEY ARE NOT SIMPLY FLIPPED TO 'duplicate'
--
-- 541 of the 708 are exact despaced name matches against an existing listing —
-- re-imports, genuinely duplicates. The other 167 are NOT: sampling found
-- "Oxballs Juicy XL Blueballs" matched to "Oxballs Juicy Blueballs", a
-- different SKU that a blanket merge would collapse. Hand-classifying 708 rows
-- is also the wrong instrument when the classifier itself was broken.
--
-- The fused score cannot separate them either: all 708 carry the IDENTICAL
-- score 0.919 (`select count(distinct dedup_match_score)` = 1). That is the
-- semantic standalone-review constant, not a similarity — marketplace has
-- confirmWeight 0.05, so cosine barely moves the fused score. A threshold over
-- a constant is not a rule.
--
-- ROOT CAUSE, fixed in the companion code change
--
-- buildDetArgs read five of six identity args at the top level of
-- normalized_data, where pipeline-normalize does not put them:
--   source_entity_id 0/708 (it is `sourceId`), merchant_domain 0/708 (metadata),
--   brand 0/708 (metadata), external_url 0/708 (a `urls` array),
--   source_slug 0/708 (it is `sourceName`).
-- find_marketplace_duplicate_candidates therefore received only p_title, which
-- kills four of its five branches and drops everything into the semantic
-- fallback. Same rows, args restored, measured live:
--   "A Single Man"         title_trigram 0.75  → despaced_exact 0.95
--   "Upgraded Icy Silk …"  title_trigram 0.606 → domain_title   0.923
--   "Fourteen Poems: …"    NO CANDIDATES       → domain_title   0.911 ×2
--
-- So the correct repair is to let the FIXED classifier disposition them, not to
-- guess here. This resets them to 'pending' — the one state that has a reader —
-- and mp_drain_dedup (hourly, batch 100) works through them in ~7 hours. With
-- autoMerge 0.92 the true re-imports resolve as duplicates and the ambiguous
-- ones land in review as they always should have.
--
-- The stale match is CLEARED rather than carried: persistVerdict merges
-- `...existingDetails`, so a leftover semantic match_type/fused_score would sit
-- underneath the new verdict and misreport how the row was decided. The prior
-- values are preserved under dedup_details.requeued_2039 so the reset is
-- auditable and reversible.
--
-- Ordering note: this migration is safe to apply BEFORE the code change lands —
-- the rows simply get re-evaluated by the old logic and return to
-- merge_candidate, i.e. back to where they are now. It is not safe to apply and
-- then never ship the code, which is why the companion edit is in the same PR.
-- ============================================================================

DO $$
DECLARE
  v_before int;
  v_after  int;
  v_reset  int;
BEGIN
  SELECT count(*) INTO v_before
    FROM public.ingestion_staging
   WHERE target_table = 'marketplace_listings'
     AND disposition = 'pending'
     AND dedup_status = 'merge_candidate';

  WITH reset AS (
    UPDATE public.ingestion_staging s
       SET dedup_status = 'pending',
           dedup_match_id = NULL,
           dedup_match_table = NULL,
           dedup_match_score = NULL,
           dedup_details = coalesce(s.dedup_details, '{}'::jsonb)
             - 'match_type' - 'fused_score' - 'semantic_cosine' - 'signals' - 'guards_fired'
             || jsonb_build_object('requeued_2039', jsonb_build_object(
                  'at', now(),
                  'reason', 'stranded merge_candidate: no reader (commit excludes it, dedup selector excludes it, 707/708 had no review_queue row); identity args were NULL at classification time',
                  'prev_match_id', s.dedup_match_id,
                  'prev_match_score', s.dedup_match_score,
                  'prev_match_type', s.dedup_details->>'match_type',
                  'prev_semantic_cosine', s.dedup_details->>'semantic_cosine')),
           updated_at = now()
     WHERE s.target_table = 'marketplace_listings'
       AND s.disposition = 'pending'
       AND s.dedup_status = 'merge_candidate'
    RETURNING 1)
  SELECT count(*) INTO v_reset FROM reset;

  SELECT count(*) INTO v_after
    FROM public.ingestion_staging
   WHERE target_table = 'marketplace_listings'
     AND disposition = 'pending'
     AND dedup_status = 'merge_candidate';

  -- Postconditions. Soft on the count (the cohort moves as the pipeline runs),
  -- hard on the invariant this migration exists to establish.
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'still % marketplace rows stranded at merge_candidate after the requeue', v_after;
  END IF;
  IF v_reset <> v_before THEN
    RAISE EXCEPTION 'requeued % rows but % were stranded', v_reset, v_before;
  END IF;

  -- Every requeued row must now be reachable by the dedup selector, which
  -- additionally requires ai_validation_status='approved' and
  -- disposition='pending'. A row that is 'pending' but fails those is simply
  -- stranded again in a different state, which is the whole failure being fixed.
  SELECT count(*) INTO v_after
    FROM public.ingestion_staging
   WHERE target_table = 'marketplace_listings'
     AND dedup_details ? 'requeued_2039'
     AND NOT (dedup_status = 'pending'
              AND disposition = 'pending'
              AND ai_validation_status = 'approved');
  IF v_after <> 0 THEN
    RAISE EXCEPTION '% requeued rows are not reachable by the dedup selector', v_after;
  END IF;

  RAISE NOTICE 'requeued % stranded marketplace merge_candidates', v_reset;
END $$;
