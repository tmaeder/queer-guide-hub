-- Two cohorts of `enrichment_status='failed'` rows that have sat at
-- disposition='pending' for months, and they need OPPOSITE treatment.
--
-- Both were invisible because `disposition='pending'` reads as "in flight".
-- Neither was: a failed enrichment yields no quality verdict, and
-- news_commit_staging_batch requires one, so these rows can never commit and
-- nothing was ever going to revisit them.
--
-- ── COHORT A: 2,103 content-less stubs. REJECTED, never publishable. ────────
-- error_message: "| content-less stub (pre-fulltext-extraction); not enrichable"
-- Created 2026-05-12 → 2026-05-29 and none since — they predate full-text
-- extraction. Measured: mean content length 51 CHARACTERS, i.e. a headline and
-- little else. Zero are podcasts.
--
-- These are marked `rejected`, not committed. Publishing a 51-character
-- article is publishing a blank page: useNews and get_news_front both require
-- `content <> ''` to render at all, and the crawler body would carry a heading
-- and nothing under it. The enrichment stage already judged them correctly and
-- said so in the error message; this records that judgement in the column the
-- pipeline actually reads, so they stop counting as a backlog forever.
--
-- ── COHORT A2: 309 of those stubs ARE NO LONGER STUBS. RE-QUEUED. ──────────
-- Same "content-less stub" label, but they now carry >= 200 characters
-- (mean 305). Measured: 309 of 309 have `updated_at > processed_at` — i.e.
-- every one was modified AFTER enrichment failed on it, by
-- news_fulltext_backfill (*/10), which filled in exactly the content whose
-- absence the error message names.
--
-- The pipeline healed them and nothing noticed, because `enrichment_status`
-- was already 'failed' and no path re-examines a failed row. The label is
-- stale evidence about a condition that no longer holds. THE ERROR MESSAGE IS
-- A RECORD OF THE PAST, NOT A PROPERTY OF THE ROW — which is why both stub
-- branches below test the CONTENT rather than trusting the label.

-- ── COHORT B: real articles enrichment returned nothing for. RE-QUEUED. ─────
-- error_message: "no_enrichment_data_produced"
-- Created 2026-07-14 → 2026-09-12 and STILL ACCRUING. Measured: mean content
-- length 3,697 CHARACTERS — these are complete articles, 51 of them podcast
-- episodes. Enrichment ran and returned nothing usable; the row was parked and
-- never retried.
--
-- They go back to `enrichment_status='pending'` so the driver picks them up
-- again. The 51 podcast episodes among them will be answered for free by
-- run_podcast_deterministic_verdict (45030614072311) rather than re-entering
-- the LLM queue; the ~128 articles do re-enter it.
--
-- The attempt is STAMPED rather than silently reset. Without a counter a row
-- that fails for a structural reason loops forever, re-costing an LLM call
-- every pass — the terminal-sentinel lesson from the countries and cities
-- engines. A row that has been retried twice is left alone for a human.
--
-- ── NOT TOUCHED, AND NAMED SO THEY STAY VISIBLE ────────────────────────────
-- The 1,500 rows carrying quality_status 'rejected' or 'review'. Those were
-- judged. 'rejected' is terminal and 'review' is waiting for a human queue;
-- forcing either to publish would override a verdict the pipeline made on
-- purpose. They are not a backlog, they are decisions.
--
-- The ~43 rows that failed `no_enrichment_data_produced` with UNDER 200
-- characters. Rejecting a 150-character article is a judgement I have no basis
-- to make automatically — the live corpus publishes plenty that short (5th
-- percentile 72 characters). They are deliberately left as-is and COUNTED by
-- news_enrichment_signals() instead, so they are visible rather than
-- dispositioned by guesswork.

BEGIN;

-- ── Cohort A ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.ingestion_staging
     SET disposition = 'rejected',
         processed_at = now(),
         error_message = coalesce(error_message,'')
           || ' | dispositioned 45030614072412: content-less stub, unpublishable'
   WHERE target_table = 'news_articles'
     AND disposition = 'pending'
     AND enrichment_status = 'failed'
     AND error_message LIKE '%content-less stub%'
     -- Belt and braces: only rows that really are thin. If a row somehow
     -- carries real content despite the label, it is not dispositioned here.
     AND coalesce(length(normalized_data->>'content'), 0) < 200;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'cohort A: % content-less stubs rejected', v_n;
END $$;

-- ── Cohort A2: stub label, real content, healed since ──────────────────────
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.ingestion_staging
     SET enrichment_status = 'pending',
         error_message = NULL,
         enriched_data = coalesce(enriched_data, '{}'::jsonb) || jsonb_build_object(
           'enrichment_retries',
           coalesce((enriched_data->>'enrichment_retries')::int, 0) + 1,
           'enrichment_retry_at', now(),
           'enrichment_retry_reason', 'content arrived after failure (news_fulltext_backfill)'
         ),
         updated_at = now()
   WHERE target_table = 'news_articles'
     AND disposition = 'pending'
     AND enrichment_status = 'failed'
     AND error_message LIKE '%content-less stub%'
     AND coalesce(length(normalized_data->>'content'), 0) >= 200
     AND coalesce((enriched_data->>'enrichment_retries')::int, 0) < 2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'cohort A2: % healed stubs re-queued', v_n;
END $$;

-- ── Cohort B ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.ingestion_staging
     SET enrichment_status = 'pending',
         error_message = NULL,
         enriched_data = coalesce(enriched_data, '{}'::jsonb) || jsonb_build_object(
           'enrichment_retries',
           coalesce((enriched_data->>'enrichment_retries')::int, 0) + 1,
           'enrichment_retry_at', now()
         ),
         updated_at = now()
   WHERE target_table = 'news_articles'
     AND disposition = 'pending'
     AND enrichment_status = 'failed'
     AND error_message = 'no_enrichment_data_produced'
     -- Real content only, and never loop: two attempts is the ceiling.
     AND coalesce(length(normalized_data->>'content'), 0) >= 200
     AND coalesce((enriched_data->>'enrichment_retries')::int, 0) < 2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'cohort B: % articles re-queued for enrichment', v_n;
END $$;

-- ── Postcondition ──────────────────────────────────────────────────────────
-- Soft on preconditions (a concurrent session may have moved rows), hard on
-- the state this file exists to reach: no content-less stub may remain
-- pending, because pending is the status that made them invisible.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.ingestion_staging
   WHERE target_table = 'news_articles' AND disposition = 'pending'
     AND enrichment_status = 'failed'
     AND error_message LIKE '%content-less stub%'
     AND coalesce(length(normalized_data->>'content'), 0) < 200;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'still % content-less stubs pending', v_left;
  END IF;
END $$;

COMMIT;
