-- Continue tightening permissive policies safely
DO $$
BEGIN
  -- 1) Conversation participants: prevent arbitrary self-join via client
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants';
  EXCEPTION WHEN others THEN NULL; END;
END$$;

DO $$
BEGIN
  -- 2) News articles: restrict management to admins/moderators, public read only for published
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage news articles" ON public.news_articles';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "News articles are viewable by everyone" ON public.news_articles';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Public can view all published news articles" ON public.news_articles';
  EXCEPTION WHEN others THEN NULL; END;
  -- Ensure a safe read policy exists (published_at IS NOT NULL)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_articles' AND policyname='Public can view published news articles'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can view published news articles" ON public.news_articles FOR SELECT USING (published_at IS NOT NULL)';
  END IF;
END$$;

DO $$
BEGIN
  -- 3) News sources: admin-only manage; public read only active sources
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage news sources" ON public.news_sources';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "News sources are viewable by everyone" ON public.news_sources';
  EXCEPTION WHEN others THEN NULL; END;
  -- Ensure an active-only read policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_sources' AND policyname IN ('Public can view active news sources','Public can view news sources')
  ) THEN
    EXECUTE 'CREATE POLICY "Public can view active news sources" ON public.news_sources FOR SELECT USING (is_active = true)';
  END IF;
END$$;

DO $$
BEGIN
  -- 4) User photos: remove open read policy; restrict to owner (until a richer visibility model is added)
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view public photos" ON public.user_photos';
  EXCEPTION WHEN others THEN NULL; END;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_photos' AND policyname='user_photos read own'
  ) THEN
    EXECUTE 'CREATE POLICY "user_photos read own" ON public.user_photos FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END$$;