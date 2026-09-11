-- Publish the 2,533 news articles that were quality_status='passed' and
-- seo_indexable=false with no recorded reason.
--
-- ROOT CAUSE — `news_enforce_seo_indexable`, a ONE-WAY GATE.
--
--   BEFORE INSERT OR UPDATE OF quality_status, seo_indexable
--   IF NEW.quality_status IN ('rejected','review')
--      AND NEW.seo_indexable IS DISTINCT FROM false
--   THEN NEW.seo_indexable := false; END IF;
--
-- It forces the flag down when an article is rejected or in review, and never
-- lifts it when the status improves. So any article that travelled
-- review -> passed keeps seo_indexable=false forever, with nothing recorded:
-- the trigger leaves no stamp, and whatever set `passed` also cleared
-- auto_publish_blocked_reasons. That is the whole cohort, and it is why no
-- function search found a writer — the deindex happened much earlier, under a
-- status the row no longer has.
--
-- The cohort is CLOSED, measured before acting: newest member created
-- 2026-08-08, zero created in the last 30 days, against a control of 391 new
-- articles in the last 7 days. So this is a one-time repair of a historical
-- residue, not a dam against an active leak.
--
-- SCOPE IS A DELIBERATE HUMAN DECISION, RECORDED HERE BECAUSE IT IS NOT THE
-- CONSERVATIVE ONE. 882 of the 2,533 do NOT clear the thresholds
-- run_news_safe_publish_sweep uses to call an article safe to auto-publish
-- (relevance >= 0.6, quality_score >= 50, length(content) >= 300):
--
--     clears the site's own bar   1,651
--     fails relevance (< 0.6)       781
--     fails length (< 300 chars)    126
--     fails quality (< 50)           20
--
-- The operator was shown these numbers and chose to publish all 2,533 anyway.
-- Publishing the whole cohort is therefore an explicit override of the
-- platform's standing auto-publish policy, not an application of it. It is
-- recorded per row so a later reader can tell the two apart and can reverse
-- exactly this set.
--
-- Pre-flight on the full cohort, all clean: 0 sensitivity-flagged, 0 rows whose
-- image_url is not an image (the podcast-audio-as-artwork defect does not touch
-- these), 0 missing titles, 0 missing slugs, 0 non-English, avg quality 92
-- across 29 distinct sources.

DO $publish$
DECLARE
  v_ids uuid[];
  v_n int;
  v_total int := 0;
  v_below_bar int := 0;
  v_before int;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.news_articles
  WHERE duplicate_of_id IS NULL AND archived_at IS NULL AND published_at IS NOT NULL
    AND quality_status = 'passed' AND seo_indexable IS FALSE
    AND coalesce(array_length(auto_publish_blocked_reasons, 1), 0) = 0;

  -- Soft on preconditions: the cohort drifted 2,524 -> 2,533 while this was
  -- being written, so an exact-count premise would abort on a correct tree and
  -- block every migration queued behind it. Assert a range instead, and treat
  -- "already done" as success rather than failure.
  IF v_before = 0 THEN
    RAISE NOTICE 'nothing to publish — cohort already empty, skipping';
    RETURN;
  END IF;
  IF v_before > 6000 THEN
    RAISE EXCEPTION 'cohort is % rows, far beyond the measured 2,533 — refusing to bulk-publish an unrecognised set', v_before;
  END IF;

  -- Batched at 300: trg_search_documents_news is UNSCOPED, so every row here
  -- fires it and enqueues a search reindex. The enqueue is cheap since the
  -- pipeline overhaul decoupled indexing into search_reindex_queue, but the
  -- chain is still per row and 2,533 in one statement is the shape that trips a
  -- statement timeout — and a timeout is a full rollback.
  LOOP
    SELECT array_agg(id) INTO v_ids FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL AND archived_at IS NULL AND published_at IS NOT NULL
        AND quality_status = 'passed' AND seo_indexable IS FALSE
        AND coalesce(array_length(auto_publish_blocked_reasons, 1), 0) = 0
      ORDER BY id
      LIMIT 300
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);
    EXIT WHEN v_n = 0;

    UPDATE public.news_articles a
      SET seo_indexable = true,
          enrichment_status = jsonb_set(
            coalesce(a.enrichment_status, '{}'::jsonb),
            ARRAY['seo_republish'],
            jsonb_build_object(
              'at', now(),
              'via', 'migration:20490101100000',
              'reason', 'stranded by news_enforce_seo_indexable one-way gate (review->passed never lifts the flag)',
              -- The honest per-row record of whether this particular article
              -- met the platform's own bar or was published by override.
              'cleared_site_publish_bar',
              (coalesce(a.lgbti_relevance_score, a.relevance_score, 0) >= 0.6
                 AND coalesce(a.quality_score, 0) >= 50
                 AND length(coalesce(a.content, '')) >= 300),
              'operator_override_all', true), true)
      WHERE a.id = ANY(v_ids);

    v_total := v_total + v_n;
    EXIT WHEN v_n < 300;
  END LOOP;

  SELECT count(*) INTO v_below_bar
  FROM public.news_articles
  WHERE enrichment_status->'seo_republish'->>'via' = 'migration:20490101100000'
    AND (enrichment_status->'seo_republish'->>'cleared_site_publish_bar')::boolean IS FALSE;

  RAISE NOTICE 'published % articles (% of them below the site publish bar, by operator decision)',
    v_total, v_below_bar;

  -- Hard on the postcondition this file exists to reach.
  IF EXISTS (
    SELECT 1 FROM public.news_articles
    WHERE duplicate_of_id IS NULL AND archived_at IS NULL AND published_at IS NOT NULL
      AND quality_status = 'passed' AND seo_indexable IS FALSE
      AND coalesce(array_length(auto_publish_blocked_reasons, 1), 0) = 0
  ) THEN
    RAISE EXCEPTION 'stranded passed+unindexable articles remain after the sweep';
  END IF;

  IF v_total <> v_before THEN
    RAISE EXCEPTION 'published % rows but the cohort measured % before the sweep', v_total, v_before;
  END IF;
END $publish$;
