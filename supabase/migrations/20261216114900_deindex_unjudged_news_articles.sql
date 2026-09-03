-- ============================================================================
-- Deindex the news articles that were published without a quality verdict.
-- ----------------------------------------------------------------------------
-- Cleanup half of the defect whose producer is fixed in the verdict gate
-- (20261216114700). news_commit_staging_batch gated on
--   quality_status NOT IN ('rejected','review')
-- which tests "the verdict is not bad", NOT "a verdict exists". Because
-- news_articles.seo_indexable is NOT NULL DEFAULT true and the commit INSERT
-- never names the column, a staging row with no verdict published an article
-- that was INDEXABLE with quality_status NULL — and run_news_safe_publish_sweep
-- only ever promotes rows whose quality_status = 'review', so a NULL one was
-- never revisited by anything.
--
-- Measured on prod 2026-09-02: 346 such articles live, first on 2026-07-24 and
-- still accruing at the time (9 that day, 10 the day before, 74 on 08-28).
--
-- PREDICATE-DRIVEN, NOT A FROZEN ID LIST. The 346 was measured a day before this
-- migration was written and the producer kept running in between, so a frozen
-- list would be wrong on both sides: it would miss rows published since, and it
-- would name rows a concurrent session may have already dispositioned. The
-- predicate is the definition; the count is only an observation.
--
-- WHY quality_status ALSO MOVES TO 'review', when the request was "deindex".
-- Setting seo_indexable=false alone would leave the row at quality_status NULL,
-- and NULL is exactly the state nothing revisits — the same trap this migration
-- exists to clean up, just inverted from "silently published" to "silently
-- buried". 'review' is the existing vocabulary for "not cleared for publication,
-- awaiting judgement" and is what run_news_safe_publish_sweep already looks for,
-- so the row becomes visible to the machinery instead of invisible to it.
--
-- That makes the deindex REVERSIBLE BY THE NORMAL PATH rather than by a human
-- remembering this migration: run_news_safe_publish_sweep promotes a 'review'
-- row back to quality_status='passed' + seo_indexable=true once it clears the
-- relevance/quality/content bars. NOTE the honest caveat — these rows were
-- committed without ever being scored, so quality_score and relevance_score are
-- expected to be NULL on many of them, and the sweep's coalesce(...,0) floors
-- mean those stay deindexed until something scores them. This migration does not
-- assert they will all come back; it asserts they are no longer published as
-- unjudged, and are now in a state a scorer can find.
--
-- Rows already at seo_indexable=false are untouched: the WHERE requires
-- seo_indexable, so re-running is a no-op and the audit cannot double-count.
-- duplicate_of_id IS NOT NULL rows are excluded — a merged duplicate is not
-- separately indexable and rewriting it would fight the merge.
--
-- NOT PRE-VERIFIED ON PROD IN A ROLLED-BACK TRANSACTION, unlike the migrations
-- it follows: the Supabase MCP connection was unavailable when this was written.
-- The batch loop, audit shape and predicate mirror 20261206100200, which was
-- verified that way. Re-check the counts in the RAISE NOTICE against
-- news_unjudged_deindex_audit after apply rather than assuming.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.news_unjudged_deindex_audit (
  article_id          uuid PRIMARY KEY REFERENCES public.news_articles(id) ON DELETE CASCADE,
  prev_seo_indexable  boolean NOT NULL,
  prev_quality_status text,
  deindexed_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.news_unjudged_deindex_audit IS
  'One row per news article deindexed by 20261216114900 for having been committed with no quality verdict. PRIMARY KEY on article_id makes the sweep idempotent per row and is the only record of the previous seo_indexable/quality_status pair.';

ALTER TABLE public.news_unjudged_deindex_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.news_unjudged_deindex_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.news_unjudged_deindex_audit TO service_role;

DO $$
DECLARE
  v_ids   uuid[];
  v_n     integer;
  v_total integer := 0;
BEGIN
  LOOP
    -- Batched for lock hygiene: an UPDATE on news_articles fires
    -- trg_search_documents_news, which since the pipeline overhaul ENQUEUES into
    -- search_reindex_queue rather than indexing inline — cheap per row, but the
    -- chain is still per-row, so the batch cap stays.
    SELECT array_agg(id) INTO v_ids
    FROM (
      SELECT id
      FROM public.news_articles
      WHERE quality_status IS NULL
        AND seo_indexable
        AND duplicate_of_id IS NULL
      ORDER BY id
      LIMIT 200
    ) q;

    v_n := coalesce(cardinality(v_ids), 0);
    EXIT WHEN v_n = 0;

    -- Audit BEFORE the write, so the previous values survive even if a later
    -- statement in this batch fails. DO NOTHING keeps the first observation.
    INSERT INTO public.news_unjudged_deindex_audit
      (article_id, prev_seo_indexable, prev_quality_status)
    SELECT a.id, a.seo_indexable, a.quality_status
    FROM public.news_articles a
    WHERE a.id = ANY(v_ids)
    ON CONFLICT (article_id) DO NOTHING;

    UPDATE public.news_articles
       SET seo_indexable  = false,
           quality_status = 'review'
     WHERE id = ANY(v_ids);

    v_total := v_total + v_n;
    EXIT WHEN v_n < 200;
  END LOOP;

  RAISE NOTICE 'deindex_unjudged_news_articles: % article(s) deindexed and queued for judgement', v_total;
END;
$$;
