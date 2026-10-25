SET lock_timeout = '15s';
ALTER POLICY "Public can view published news articles" ON public.news_articles USING (
 published_at IS NOT NULL AND (
  archived_at IS NULL OR (SELECT api_private.has_any_role_jwt(ARRAY['admin','moderator','editor']::public.app_role[]))
 )
);;
