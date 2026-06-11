-- geo-link-content news sweep head-stall fix.
-- Articles with no detectable geo signal stayed unlinked and recycled at the
-- head of every batch_all sweep. Persist a "checked, no signal" marker and
-- serve the work-list from one RPC (NOT EXISTS instead of fetching the whole
-- news_article_countries table into the edge function).

CREATE TABLE IF NOT EXISTS public.news_geo_checked (
  article_id uuid PRIMARY KEY REFERENCES public.news_articles(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role worktable: RLS on, no policies (deny-all for client roles).
ALTER TABLE public.news_geo_checked ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.news_geo_checked FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.news_articles_unlinked_geo(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, title text, excerpt text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.title, n.excerpt
  FROM news_articles n
  WHERE n.duplicate_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM news_article_countries c WHERE c.article_id = n.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM news_geo_checked g WHERE g.article_id = n.id
    )
  ORDER BY n.published_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

REVOKE ALL ON FUNCTION public.news_articles_unlinked_geo(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_articles_unlinked_geo(integer) TO service_role;
