-- Podcast episodes earn their quality verdict from curation, not from an LLM.
--
-- ── THE STARVATION ──────────────────────────────────────────────────────────
-- news_commit_staging_batch has required a quality verdict since 20260902
-- ("a row with NO verdict is not 'not rejected', it is UNJUDGED"), and that
-- gate is correct — it exists because 346 unjudged articles had published
-- INDEXABLE with quality_status NULL and nothing ever revisited them.
--
-- The verdict comes from pipeline-enrich-news, which runs hourly at
-- `batch_size: 20` (news_orphan_reclaim). Measured on prod, every hour for
-- twelve hours straight: 20, 20, 20, 20, 20, 20, 20, 20, 19, 32, 59 enriched.
-- That is 480/day against an llm_budget of 600/day — every circuit breaker
-- closed, zero failures. A hard, healthy-looking cap.
--
-- Then the podcast URL fix (22000101100000 era) took podcast staging from ~7
-- rows/hour to ~175 rows/hour. Inflow ~4,200/day against 480/day of verdicts,
-- so the queue grows about nine times faster than it drains and episodes stage
-- perfectly, pass validate, pass dedup, and never publish.
--
-- ── WHY A DETERMINISTIC VERDICT IS HONEST HERE, AND ONLY HERE ───────────────
-- What the LLM decides for a news article is RELEVANCE: an RSS feed of general
-- news carries stories that may or may not concern this audience, and only
-- reading the article answers that.
--
-- A podcast episode's relevance was already decided by a human, once, when the
-- SHOW was admitted to news_sources. Every episode of a hand-seeded LGBTQ+
-- podcast is on-topic by construction — judging each one individually re-asks
-- a question that curation has already answered. `feed_type='podcast' AND
-- is_active` IS the evidence, and it is recorded on the row as the basis.
--
-- THIS DOES NOT WEAKEN THE COMMIT GATE. It stamps a REAL verdict with its own
-- provenance; it does not teach commit to accept unjudged rows. Re-read that
-- gate before changing anything here — relaxing it is how the 346-article
-- defect happened, and this migration deliberately routes around it rather
-- than through it.
--
-- ── WHAT IS GIVEN UP, STATED PLAINLY ───────────────────────────────────────
-- The LLM path also produces ai_tags, ai_topics, ai_summary, ai_category,
-- sentiment and entity links. A deterministically-passed episode gets none of
-- them: it publishes with its own title, its own show notes and its show's
-- artwork. That is a real reduction in metadata and the reason this is scoped
-- to podcasts alone.
--
-- One thing actually IMPROVES. On a row with no image the LLM path substitutes
-- a PEXELS STOCK PHOTO (measured: a Pexels image on an intersex episode whose
-- own show art existed). Podcast rows already carry image_url from the feed —
-- episode art, else the show's channel artwork — and commit prefers
-- enriched_data.image_url then normalized_data.image_url, so skipping the LLM
-- means an episode keeps its own artwork instead of gaining a stock photo.
--
-- ── THE CONTENT FLOOR IS THE READER'S, NOT A NEW ONE ───────────────────────
-- Non-empty content, which is exactly what useNews and get_news_front already
-- require (`content is not null and content <> ''`). A stricter floor was
-- measured and rejected: the LIVE podcast corpus has 2,826 of 14,064 episodes
-- under 200 characters with a 5th percentile of 72, so a 200-char bar would
-- hold new episodes to a standard the existing corpus does not meet. An
-- empty-content row is left alone — it cannot render, so passing it would
-- publish a blank page.

BEGIN;

CREATE OR REPLACE FUNCTION public.run_podcast_deterministic_verdict(p_batch int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n int; v_remaining int;
BEGIN
  WITH batch AS (
    SELECT st.id, s.name AS show_name, s.id AS show_id
      FROM public.ingestion_staging st
      JOIN public.news_sources s
        ON s.id = nullif(st.normalized_data->'metadata'->>'source_id','')::uuid
     WHERE st.target_table = 'news_articles'
       AND st.disposition = 'pending'
       AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
       -- Never overwrite a verdict that already exists, from any source.
       AND coalesce(st.enriched_data->>'quality_status','') = ''
       -- The curation signal. This is the whole basis for the verdict, so it
       -- is required rather than inferred from media_type alone: a podcast
       -- item from a source that is no longer an active curated show does not
       -- inherit anything.
       AND s.feed_type = 'podcast'
       AND s.is_active
       -- An episode is its audio. No audio, no episode.
       AND nullif(st.normalized_data->'metadata'->>'audio_url','') IS NOT NULL
       -- The validator's own verdict still governs: title, URL and content
       -- were checked there and this does not re-litigate or bypass them.
       AND coalesce(st.ai_validation_status,'pending') = 'approved'
       -- The reader's predicate, not a new standard. See the header.
       AND coalesce(st.normalized_data->>'content','') <> ''
     ORDER BY st.created_at
     LIMIT greatest(p_batch, 0)
  )
  UPDATE public.ingestion_staging st
     SET enriched_data = coalesce(st.enriched_data, '{}'::jsonb) || jsonb_build_object(
           'quality_status', 'passed',
           'quality_run_at', now(),
           'quality_pipeline_version', 'podcast-deterministic.v1',
           -- relevance_score is deliberately ABSENT. The commit RPC reads it as
           -- nullable, and there is no measurement behind a number here — an
           -- invented 0.9 would be indistinguishable from one the LLM derived
           -- from reading the episode.
           'quality_decision', jsonb_build_object(
             'basis', 'curated_show',
             'rationale', 'Relevance was decided when the show was admitted to news_sources; every episode of a curated LGBTQ+ show inherits it.',
             'show_id', b.show_id,
             'show_name', b.show_name,
             'isRelevant', true,
             'shouldPublish', true,
             'needsManualReview', false,
             'llm_used', false
           )
         ),
         enrichment_status = 'enriched',
         updated_at = now()
    FROM batch b
   WHERE st.id = b.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT count(*) INTO v_remaining
    FROM public.ingestion_staging st
    JOIN public.news_sources s
      ON s.id = nullif(st.normalized_data->'metadata'->>'source_id','')::uuid
   WHERE st.target_table = 'news_articles' AND st.disposition = 'pending'
     AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
     AND coalesce(st.enriched_data->>'quality_status','') = ''
     AND s.feed_type = 'podcast' AND s.is_active
     AND nullif(st.normalized_data->'metadata'->>'audio_url','') IS NOT NULL
     AND coalesce(st.ai_validation_status,'pending') = 'approved'
     AND coalesce(st.normalized_data->>'content','') <> '';

  RETURN jsonb_build_object('verdicts', v_n, 'remaining', v_remaining);
END $$;

REVOKE ALL ON FUNCTION public.run_podcast_deterministic_verdict(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_podcast_deterministic_verdict(int) TO service_role;

-- Every 15 minutes at 500/run = far above any plausible podcast inflow, so the
-- queue drains instead of accumulating. It is pure SQL — no LLM call, no
-- budget, no circuit breaker — which is the entire point.
INSERT INTO public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
VALUES (
  'podcast_deterministic_verdict',
  'Podcast deterministic quality verdict',
  'Stamps quality_status=passed on podcast episodes from active curated shows so they can reach commit without waiting on the LLM enrichment queue, which caps at ~480/day against ~4,200/day of podcast inflow.',
  '*/15 * * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_podcast_deterministic_verdict',
    'command', 'SELECT public.run_podcast_deterministic_verdict(500);',
    'jobname', 'podcast_deterministic_verdict'
  ),
  true,
  3
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = excluded.schedule, action = excluded.action, enabled = true;

SELECT cron.schedule(
  'podcast_deterministic_verdict',
  '*/15 * * * *',
  'SELECT public.run_podcast_deterministic_verdict(500);'
);

-- Prove it works against today's data rather than asserting it will. This is
-- also the first drain of the existing backlog.
DO $$
DECLARE v jsonb;
BEGIN
  v := public.run_podcast_deterministic_verdict(500);
  RAISE NOTICE 'podcast deterministic verdict: %', v;
  IF NOT (v ? 'verdicts' AND v ? 'remaining') THEN
    RAISE EXCEPTION 'run_podcast_deterministic_verdict returned an unexpected shape: %', v;
  END IF;
END $$;

COMMIT;
