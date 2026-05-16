-- Story metadata refresher: derives top_tags from member articles + falls back
-- summary to hero article excerpt. Re-runnable; idempotent.

CREATE OR REPLACE FUNCTION public.refresh_story_metadata(p_story_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count int := 0;
BEGIN
  WITH tag_counts AS (
    SELECT sa.story_id,
           tg.name AS tag,
           count(*) AS n
    FROM public.news_story_articles sa
    JOIN public.unified_tag_assignments uta
      ON uta.entity_id = sa.article_id AND uta.entity_type = 'news_article'
    JOIN public.unified_tags tg ON tg.id = uta.tag_id
    WHERE p_story_id IS NULL OR sa.story_id = p_story_id
    GROUP BY sa.story_id, tg.name
  ),
  ranked AS (
    SELECT story_id, tag, n,
           row_number() OVER (PARTITION BY story_id ORDER BY n DESC, tag ASC) AS r
    FROM tag_counts
  ),
  top_5 AS (
    SELECT story_id,
           array_agg(tag ORDER BY r ASC) FILTER (WHERE r <= 5) AS tags
    FROM ranked
    GROUP BY story_id
  ),
  hero_excerpt AS (
    SELECT s.id AS story_id, na.excerpt
    FROM public.news_stories s
    LEFT JOIN public.news_articles na ON na.id = s.hero_article_id
    WHERE p_story_id IS NULL OR s.id = p_story_id
  )
  UPDATE public.news_stories s SET
    top_tags = COALESCE(t.tags, '{}'::text[]),
    summary  = CASE WHEN s.summary IS NULL OR s.summary = '' THEN h.excerpt ELSE s.summary END
  FROM hero_excerpt h
  LEFT JOIN top_5 t ON t.story_id = h.story_id
  WHERE s.id = h.story_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.refresh_story_metadata(uuid) TO authenticated, service_role;
