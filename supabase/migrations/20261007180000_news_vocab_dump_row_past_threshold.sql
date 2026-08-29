-- One more news_articles.tags vocabulary dump, sitting just past the rank-100
-- threshold that 20261007100000_news_tag_vocabulary_dump_retraction.sql used.
--
-- That migration retracted 368 rows whose every tag fell inside the first 100 slugs
-- of the alphabetically-ordered vocabulary -- the signature of an LLM handed a page of
-- `unified_tags` instead of a relevant pool (writer fixed in the same PR, #3113).
-- The measured distribution had a cliff there: 368 rows in ranks 1-100, then 2 in
-- 101-250, 6 in 251-600, 1,254 spread.
--
-- Those 8 tail rows were then read too, rather than assumed clean, and exactly ONE is
-- the same defect reaching one slug further: "Florence Huntington-Whiteley on Gender &
-- Energy" (rank 116) tagged accessibility / ace / aceflux / acolyte / advocacy -- the
-- identical ab*/ac* block, on a podcast episode about none of it.
--
-- The other seven are CORRECT and are deliberately left alone, which is the half of
-- the check that carries information: Ann Northrop and Avram Finkelstein really are
-- ACT UP, a David Zwirner signing really is art, and three are genuine asexuality
-- coverage that legitimately carries ace/acespec. A threshold only ever tested from
-- the inside is not a threshold.
--
-- Reversible through the SAME audit table as its parent, so there is one place to look
-- and one rollback for the whole retraction:
--   UPDATE news_articles n SET tags = a.tags_before
--   FROM news_tag_vocab_dump_audit_20261007 a WHERE n.id = a.article_id;

DO $$
DECLARE
  v_article  uuid := 'e70a1f31-923a-41d5-b14e-487037f162e8';
  v_expected text[] := ARRAY['accessibility','ace','aceflux','acolyte','advocacy'];
  v_actual   text[];
  v_edges    int;
BEGIN
  SELECT tags INTO v_actual FROM public.news_articles WHERE id = v_article;

  IF NOT FOUND THEN
    RAISE NOTICE 'row-past-threshold retraction: article % no longer exists, nothing to do', v_article;
    RETURN;
  END IF;

  -- Already retracted (re-run, or a human got there first): stop, do not re-empty a
  -- row somebody may have since re-tagged correctly.
  IF EXISTS (SELECT 1 FROM public.news_tag_vocab_dump_audit_20261007 WHERE article_id = v_article) THEN
    RAISE NOTICE 'row-past-threshold retraction: already audited, skipping';
    RETURN;
  END IF;

  -- Abort rather than guess if the row moved. The parent migration takes the same
  -- stance: a tag array that no longer matches what was reviewed is a newer decision,
  -- and overwriting it would discard a human's work.
  IF v_actual IS DISTINCT FROM public.normalize_news_tags(v_expected) THEN
    RAISE EXCEPTION 'row-past-threshold retraction: article % drifted (have %, reviewed %)',
      v_article, v_actual, public.normalize_news_tags(v_expected);
  END IF;

  INSERT INTO public.news_tag_vocab_dump_audit_20261007 (article_id, tags_before, tags_after, verdict)
  VALUES (v_article, v_actual, '{}'::text[], 'junk');

  UPDATE public.news_articles SET tags = '{}'::text[] WHERE id = v_article;

  -- run_tag_assignment_reconcile is INSERT-only (ON CONFLICT DO NOTHING) and never
  -- deletes, so clearing the text does not retract the edges it already minted. With
  -- tags_after empty every edge for this article is orphaned by definition.
  DELETE FROM public.unified_tag_assignments
   WHERE entity_type = 'news' AND entity_id = v_article;
  GET DIAGNOSTICS v_edges = ROW_COUNT;

  RAISE NOTICE 'row-past-threshold retraction: emptied 1 article, deleted % tag assignments', v_edges;
END $$;

-- Same recompute run_tag_assignment_reconcile performs, so usage_count is correct
-- immediately rather than only after the nightly pass.
WITH counts AS (
  SELECT tag_id, count(*) AS n
    FROM public.unified_tag_assignments
   WHERE entity_type <> 'tag'
   GROUP BY tag_id
)
UPDATE public.unified_tags t
   SET usage_count = coalesce(c.n, 0)
  FROM (SELECT t2.id, c2.n FROM public.unified_tags t2
          LEFT JOIN counts c2 ON c2.tag_id = t2.id) c
 WHERE t.id = c.id AND t.usage_count IS DISTINCT FROM coalesce(c.n, 0);

DO $$
DECLARE v_tags int; v_edges int;
BEGIN
  SELECT cardinality(tags) INTO v_tags
    FROM public.news_articles WHERE id = 'e70a1f31-923a-41d5-b14e-487037f162e8';
  SELECT count(*) INTO v_edges FROM public.unified_tag_assignments
   WHERE entity_type = 'news' AND entity_id = 'e70a1f31-923a-41d5-b14e-487037f162e8';
  IF coalesce(v_tags, 0) <> 0 OR v_edges <> 0 THEN
    RAISE EXCEPTION 'row-past-threshold retraction incomplete: % tags, % assignments', v_tags, v_edges;
  END IF;
END $$;
