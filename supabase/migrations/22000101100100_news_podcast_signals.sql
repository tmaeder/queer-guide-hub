-- A sentinel for the podcast path, and the artwork-fill counter that never drains.
--
-- WHY THIS EXISTS. Two podcast faults ran undetected for months, and neither
-- was invisible for want of data — both were invisible because nothing was
-- looking at the right quantity.
--
--  * 5,729 episodes committed as articles between 2026-06-23 and 2026-07-14
--    (20780101100000 repairs them). Nothing counted them for two months.
--  * The parser wrote a bare <guid> into news_articles.url, pipeline-validate
--    rejected it with E_INVALID_URL, and the episode was destroyed. 323 of 680
--    podcast rejections in a 30-day window, every episode of several ACTIVE
--    shows, every day — while 256 of 265 sources reported a SUCCESSFUL fetch
--    within 24h and consecutive_failures sat at 0 on all of them.
--
-- The second one is the lesson this file is built around: presence of fetches
-- is not a rate. Every source-health signal was green throughout, because
-- fetching worked perfectly and only the COMMIT did not. So the sentinel
-- reports staged-vs-committed, not "did the cron run".
--
-- STANDALONE, not a new pipeline_hygiene_stats() key: that function's body is
-- restated in full by every migration that touches it, which makes it a
-- merge-collision surface. Same call as event_dup_signals / news_image_signals.

CREATE OR REPLACE FUNCTION public.news_podcast_signals()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    -- ZERO TOLERANCE. An episode from a podcast source that carries no audio
    -- and is not typed as a podcast is the 2026-06 defect recurring. There is
    -- no legitimate shape here: the staging corroboration in the predicate
    -- means the feed itself called it a podcast.
    'stranded_as_article', (
      SELECT count(*)
        FROM public.news_articles a
        JOIN public.news_sources  s  ON s.id = a.source_id
        JOIN public.ingestion_staging st
             ON st.target_record_id = a.id AND st.target_table = 'news_articles'
       WHERE s.feed_type = 'podcast'
         AND a.media_type IS DISTINCT FROM 'podcast'
         AND a.audio_url IS NULL
         AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
         AND st.normalized_data->'metadata'->>'audio_url' IS NOT NULL
    ),
    -- A podcast row with no audio cannot be played. Distinct from the above:
    -- this one needs no staging row, so it also catches a future writer that
    -- types a row as a podcast and forgets the URL.
    'podcast_without_audio', (
      SELECT count(*) FROM public.news_articles
       WHERE media_type = 'podcast' AND (audio_url IS NULL OR btrim(audio_url) = '')
    ),
    -- The live parser fault. Should be 0 once the URL ladder ships; anything
    -- above 0 means a host shape the ladder does not handle.
    'invalid_url_rejections_7d', (
      SELECT count(*) FROM public.ingestion_staging st
       WHERE st.target_table = 'news_articles'
         AND st.created_at > now() - interval '7 days'
         AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
         AND st.ai_validation_result->'errors' ? 'E_INVALID_URL'
    ),
    -- THE RATE. These two are reported as a pair and never collapsed into a
    -- ratio in SQL: a ratio hides its own denominator, and "0 staged" and
    -- "0 committed of 0 staged" are different facts about the world.
    'episodes_staged_7d', (
      SELECT count(*) FROM public.ingestion_staging st
       WHERE st.target_table = 'news_articles'
         AND st.created_at > now() - interval '7 days'
         AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
    ),
    'episodes_committed_7d', (
      SELECT count(*) FROM public.ingestion_staging st
       WHERE st.target_table = 'news_articles'
         AND st.created_at > now() - interval '7 days'
         AND st.normalized_data->'metadata'->>'media_type' = 'podcast'
         AND st.disposition IN ('inserted', 'updated')
    ),
    -- Advisory. Drains as the artwork cron works through the backlog.
    'podcast_without_artwork', (
      SELECT count(*) FROM public.news_articles
       WHERE media_type = 'podcast' AND (image_url IS NULL OR btrim(image_url) = '')
    ),
    -- Advisory. A show that fetches successfully and still commits nothing is
    -- the shape the E_INVALID_URL fault produced 61 times over.
    'shows_fetching_with_zero_episodes', (
      SELECT count(*) FROM public.news_sources s
       WHERE s.feed_type = 'podcast'
         AND s.is_active
         AND s.last_successful_fetch IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.news_articles a WHERE a.source_id = s.id)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.news_podcast_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_podcast_signals() TO service_role;

-- ── The artwork-fill counter that can never reach zero ───────────────────────
--
-- run_news_podcast_artwork_fill's `batch` CTE requires btrim(s.artwork_url) <> ''
-- and its `remaining` count does not. A source whose artwork_url is the empty
-- string is therefore counted as outstanding work forever and is never
-- selected, so the number it reports never drains — a backlog that reads as
-- stalled when it is finished. Restated in full because CREATE OR REPLACE
-- takes a whole body; the only change is the one line marked below.
CREATE OR REPLACE FUNCTION public.run_news_podcast_artwork_fill(p_batch int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n int;
BEGIN
  -- Batched: news_articles carries a search sync trigger, so an unbounded
  -- UPDATE risks a statement timeout, and a timeout is a full rollback.
  WITH batch AS (
    SELECT a.id, s.artwork_url
    FROM public.news_articles a
    JOIN public.news_sources s ON s.id = a.source_id
    WHERE a.media_type = 'podcast'
      AND (a.image_url IS NULL OR btrim(a.image_url) = '')
      AND s.artwork_url IS NOT NULL
      AND btrim(s.artwork_url) <> ''
      -- Never re-introduce the defect this exists to clean up. The trigger
      -- would null it anyway; refusing here means the row is not counted as
      -- filled when it was not.
      AND NOT public.is_non_image_url(s.artwork_url)
    LIMIT greatest(p_batch, 0)
  )
  UPDATE public.news_articles a
     SET image_url = b.artwork_url
    FROM batch b WHERE a.id = b.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'filled', v_n,
    'remaining', (
      SELECT count(*) FROM public.news_articles a
      JOIN public.news_sources s ON s.id = a.source_id
      WHERE a.media_type = 'podcast'
        AND (a.image_url IS NULL OR btrim(a.image_url) = '')
        AND s.artwork_url IS NOT NULL
        AND btrim(s.artwork_url) <> ''      -- <<< the fix: same gate as `batch`
        AND NOT public.is_non_image_url(s.artwork_url)
    ),
    'sources_with_artwork', (
      SELECT count(*) FROM public.news_sources
      WHERE feed_type = 'podcast' AND artwork_url IS NOT NULL
        AND btrim(artwork_url) <> ''
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.run_news_podcast_artwork_fill(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_news_podcast_artwork_fill(int) TO service_role;

-- The sentinel must answer before anything depends on it. An absent key and a
-- zero count look identical to a caller that only reads numbers, which is why
-- check-pipeline-health.mjs reports them separately — but the function still
-- has to exist for that distinction to mean anything.
DO $$
DECLARE v jsonb;
BEGIN
  v := public.news_podcast_signals();
  IF NOT (v ? 'stranded_as_article' AND v ? 'episodes_staged_7d' AND v ? 'episodes_committed_7d') THEN
    RAISE EXCEPTION 'news_podcast_signals() is missing a required key: %', v;
  END IF;
END $$;
