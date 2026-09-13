-- A sentinel for the verdict stage, which is where news rows actually die.
--
-- WHY THIS SHAPE. The starvation it watches was invisible for four months and
-- every existing signal was green throughout:
--
--   * `pipeline-enrich-news` ran every hour, exactly on schedule.
--   * Every circuit breaker was `closed` with `failure_count = 0`.
--   * `llm_budget` showed headroom (159 of 600 spent).
--   * `disposition='pending'` reads as "in flight".
--   * `pipeline_hygiene_stats().stale_pending_by_entity` warns at 3,500 rows
--     per target_table, and this sat at ~2,300 for months — UNDER the floor.
--
-- Nothing was broken. The stage simply ran 480 times a day against an inflow
-- of ~4,200, and no signal anywhere compared those two numbers.
--
-- So this reports the RATIO OF CAPACITY TO INFLOW, and the AGE of the head of
-- the queue. A depth alone would not have fired either — a deep queue during a
-- back-catalogue import is legitimate, and a shallow one that never drains is
-- not. Age is what separates them.
--
-- Standalone, not a new pipeline_hygiene_stats() key: that body is restated in
-- full by every migration that touches it, which makes it a merge-collision
-- surface. Same call as news_podcast_signals / event_dup_signals.

CREATE OR REPLACE FUNCTION public.news_enrichment_signals()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pend AS (
    SELECT * FROM public.ingestion_staging
     WHERE target_table = 'news_articles' AND disposition = 'pending'
  )
  SELECT jsonb_build_object(
    -- THE TWO NUMBERS THAT MATTER, reported as a pair and never as a ratio:
    -- a ratio hides its denominator, and "nothing arrived" and "nothing was
    -- judged" call for opposite responses.
    'staged_24h', (
      SELECT count(*) FROM public.ingestion_staging
       WHERE target_table = 'news_articles' AND created_at > now() - interval '24 hours'
    ),
    'verdicts_24h', (
      SELECT count(*) FROM public.ingestion_staging
       WHERE target_table = 'news_articles'
         AND coalesce(enriched_data->>'quality_status','') <> ''
         AND updated_at > now() - interval '24 hours'
    ),
    -- Awaiting a verdict. Cannot commit until they have one.
    'awaiting_verdict', (
      SELECT count(*) FROM pend WHERE coalesce(enriched_data->>'quality_status','') = ''
    ),
    -- AGE is the discriminator. A deep queue draining in hours is a healthy
    -- import; a queue whose head is days old is starvation regardless of depth.
    'oldest_awaiting_verdict_hours', (
      SELECT round(extract(epoch FROM (now() - min(created_at)))/3600)::int
        FROM pend WHERE coalesce(enriched_data->>'quality_status','') = ''
    ),
    -- A failed enrichment is terminal by default: nothing re-examines it, and
    -- it can never earn the verdict commit requires. Split by whether the row
    -- has real content, because those need OPPOSITE treatment — thin ones are
    -- unpublishable, substantial ones are a retry.
    'failed_with_content', (
      SELECT count(*) FROM pend
       WHERE enrichment_status = 'failed'
         AND coalesce(length(normalized_data->>'content'), 0) >= 200
    ),
    'failed_thin', (
      SELECT count(*) FROM pend
       WHERE enrichment_status = 'failed'
         AND coalesce(length(normalized_data->>'content'), 0) < 200
    ),
    -- Rows whose stored error no longer describes them: labelled a
    -- content-less stub while carrying real content, because
    -- news_fulltext_backfill filled them in after the failure. 309 of these
    -- existed when this was written, all 309 with updated_at > processed_at.
    -- An error message is a record of the past, not a property of the row.
    'stale_failure_label', (
      SELECT count(*) FROM pend
       WHERE enrichment_status = 'failed'
         AND error_message LIKE '%content-less stub%'
         AND coalesce(length(normalized_data->>'content'), 0) >= 200
    ),
    -- Podcasts should no longer wait on the LLM at all. Anything here means
    -- run_podcast_deterministic_verdict is not keeping up or not running.
    'podcasts_awaiting_verdict', (
      SELECT count(*) FROM pend
       WHERE normalized_data->'metadata'->>'media_type' = 'podcast'
         AND coalesce(enriched_data->>'quality_status','') = ''
    )
  );
$$;

REVOKE ALL ON FUNCTION public.news_enrichment_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_enrichment_signals() TO service_role;

DO $$
DECLARE v jsonb;
BEGIN
  v := public.news_enrichment_signals();
  IF NOT (v ? 'staged_24h' AND v ? 'verdicts_24h' AND v ? 'awaiting_verdict'
          AND v ? 'oldest_awaiting_verdict_hours') THEN
    RAISE EXCEPTION 'news_enrichment_signals() is missing a required key: %', v;
  END IF;
  RAISE NOTICE 'news_enrichment_signals: %', v;
END $$;
