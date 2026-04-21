-- Admin-only RPC that returns true platform counts, bypassing RLS
CREATE OR REPLACE FUNCTION public.get_admin_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'totalUsers',       (SELECT count(*) FROM profiles),
    'totalVenues',      (SELECT count(*) FROM venues),
    'totalEvents',      (SELECT count(*) FROM events),
    'totalGroups',      (SELECT count(*) FROM community_groups),
    'marketplaceItems', (SELECT count(*) FROM marketplace_listings),
    'newsArticles',     (SELECT count(*) FROM news_articles)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_platform_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_stats() TO authenticated;
