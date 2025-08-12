-- Secure RLS for news-related tables (direct statements)

-- news_articles: public read (published only), admins/moderators manage
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view published news articles" ON public.news_articles;
DROP POLICY IF EXISTS "Admins and moderators can manage news articles" ON public.news_articles;
CREATE POLICY "Public can view published news articles"
  ON public.news_articles
  FOR SELECT
  USING (published_at IS NOT NULL);
CREATE POLICY "Admins and moderators can manage news articles"
  ON public.news_articles
  FOR ALL
  USING (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  );

-- news_sources: public read active rows, admins/moderators manage
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Admins and moderators can manage news sources" ON public.news_sources;
CREATE POLICY "Public can view active news sources"
  ON public.news_sources
  FOR SELECT
  USING (is_active = true);
CREATE POLICY "Admins and moderators can manage news sources"
  ON public.news_sources
  FOR ALL
  USING (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid() AS uid), 'admin'::app_role) OR 
    has_role((SELECT auth.uid() AS uid), 'moderator'::app_role)
  );

-- news_favorites: users manage their own favorites only
ALTER TABLE public.news_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own news favorites" ON public.news_favorites;
CREATE POLICY "Users can manage their own news favorites"
  ON public.news_favorites
  FOR ALL
  USING ((SELECT auth.uid() AS uid) = user_id)
  WITH CHECK ((SELECT auth.uid() AS uid) = user_id);
