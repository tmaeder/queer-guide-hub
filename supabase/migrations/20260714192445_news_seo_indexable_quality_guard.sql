-- Root cause of the news sitemap leak (2026-07-14): news_articles.seo_indexable
-- DEFAULTs to true, and the commit RPC never sets it, so every committed article
-- — including LLM-rejected and review-held ones — was born indexable and emitted
-- into functions/sitemap-news.xml.ts (which gates ONLY on seo_indexable),
-- producing soft-404s (the news detail page hides rejected/review articles).
--
-- Defense-in-depth: a cheap one-directional BEFORE trigger forces
-- seo_indexable=false whenever quality_status is rejected/review — from ANY
-- write path (batch commit, human commit, quality recompute, admin edit,
-- direct RPC). It NEVER forces indexable=true, so an admin de-indexing a
-- legitimately-passed article is respected. Row-level, no queries, no search
-- writes of its own -> no trigger storm.
CREATE OR REPLACE FUNCTION public.news_enforce_seo_indexable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.quality_status IN ('rejected','review') AND NEW.seo_indexable IS DISTINCT FROM false THEN
    NEW.seo_indexable := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_news_enforce_seo_indexable ON public.news_articles;
CREATE TRIGGER trg_news_enforce_seo_indexable
  BEFORE INSERT OR UPDATE OF quality_status, seo_indexable ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.news_enforce_seo_indexable();

-- Sweep the lone straggler that a concurrent run re-indexed after the manual pass.
UPDATE public.news_articles
   SET seo_indexable = false
 WHERE quality_status IN ('rejected','review') AND seo_indexable = true;
