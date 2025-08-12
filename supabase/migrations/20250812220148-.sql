-- Secure RLS for news-related tables with robust existence checks

-- news_articles: public read (published only), admins/moderators manage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public' AND tablename = 'news_articles'
  ) THEN
    -- Enable RLS (idempotent)
    EXECUTE 'ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies to avoid duplicates
    EXECUTE 'DROP POLICY IF EXISTS "Public can view published news articles" ON public.news_articles';
    EXECUTE 'DROP POLICY IF EXISTS "Admins and moderators can manage news articles" ON public.news_articles';

    -- Public can read published articles only
    EXECUTE $$
      CREATE POLICY "Public can view published news articles"
      ON public.news_articles
      FOR SELECT
      USING (published_at IS NOT NULL)
    $$;

    -- Admins and moderators can perform all actions
    EXECUTE $$
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
      )
    $$;
  END IF;
END $$;

-- news_sources: public read active rows, admins/moderators manage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public' AND tablename = 'news_sources'
  ) THEN
    EXECUTE 'ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Public can view active news sources" ON public.news_sources';
    EXECUTE 'DROP POLICY IF EXISTS "Admins and moderators can manage news sources" ON public.news_sources';

    -- Public can read only active sources (assumes no sensitive secrets stored in table)
    EXECUTE $$
      CREATE POLICY "Public can view active news sources"
      ON public.news_sources
      FOR SELECT
      USING (is_active = true)
    $$;

    -- Admins and moderators manage
    EXECUTE $$
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
      )
    $$;
  END IF;
END $$;

-- news_favorites: users manage their own favorites only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public' AND tablename = 'news_favorites'
  ) THEN
    EXECUTE 'ALTER TABLE public.news_favorites ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own news favorites" ON public.news_favorites';

    EXECUTE $$
      CREATE POLICY "Users can manage their own news favorites"
      ON public.news_favorites
      FOR ALL
      USING ((SELECT auth.uid() AS uid) = user_id)
      WITH CHECK ((SELECT auth.uid() AS uid) = user_id)
    $$;
  END IF;
END $$;