-- Fix increment_article_views: it updated a non-existent `view_count` column.
-- The real column is `views_count` (plural), so every news article view raised
-- "column view_count does not exist" → PostgREST 400, and no view was ever
-- counted. Correct the column name; behaviour is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.news_articles
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = increment_article_views.article_id;
END;
$function$;
