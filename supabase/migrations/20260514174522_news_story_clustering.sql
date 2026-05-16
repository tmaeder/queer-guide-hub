-- News story clustering: group articles covering the same event.
-- Embeddings live in content_embeddings (content_type='news', vector(1024)).

CREATE TABLE IF NOT EXISTS public.news_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  summary text,
  hero_article_id uuid REFERENCES public.news_articles(id) ON DELETE SET NULL,
  article_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  top_tags text[] NOT NULL DEFAULT '{}',
  country_ids uuid[] NOT NULL DEFAULT '{}',
  embedding extensions.vector(1024),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.news_story_articles (
  story_id uuid NOT NULL REFERENCES public.news_stories(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  similarity real,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, article_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS news_story_articles_article_unique ON public.news_story_articles(article_id);

CREATE INDEX IF NOT EXISTS news_stories_last_updated_idx ON public.news_stories(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS news_stories_country_gin_idx ON public.news_stories USING gin(country_ids);
CREATE INDEX IF NOT EXISTS news_stories_embedding_idx ON public.news_stories USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.news_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_story_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read news_stories" ON public.news_stories;
DROP POLICY IF EXISTS "public read news_story_articles" ON public.news_story_articles;
CREATE POLICY "public read news_stories" ON public.news_stories FOR SELECT USING (true);
CREATE POLICY "public read news_story_articles" ON public.news_story_articles FOR SELECT USING (true);

GRANT SELECT ON public.news_stories TO anon, authenticated;
GRANT SELECT ON public.news_story_articles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cluster_news_article(p_article_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_embedding extensions.vector(1024);
  v_country_ids uuid[];
  v_title text;
  v_published_at timestamptz;
  v_story_id uuid;
  v_existing_story uuid;
  v_sim real;
  v_threshold constant real := 0.82;
  v_window constant interval := '7 days';
  v_slug text;
BEGIN
  SELECT story_id INTO v_existing_story FROM public.news_story_articles WHERE article_id = p_article_id;
  IF FOUND THEN RETURN v_existing_story; END IF;

  SELECT na.country_ids, na.title, na.published_at, ce.embedding
    INTO v_country_ids, v_title, v_published_at, v_embedding
  FROM public.news_articles na
  LEFT JOIN public.content_embeddings ce
    ON ce.content_type = 'news' AND ce.content_id = na.id
  WHERE na.id = p_article_id;

  IF v_embedding IS NULL OR v_title IS NULL THEN RETURN NULL; END IF;
  v_published_at := COALESCE(v_published_at, now());

  SELECT s.id, (1 - (s.embedding <=> v_embedding))::real
    INTO v_story_id, v_sim
  FROM public.news_stories s
  WHERE s.last_updated_at >= v_published_at - v_window
    AND s.last_updated_at <= v_published_at + v_window
    AND (
      cardinality(v_country_ids) = 0
      OR cardinality(s.country_ids) = 0
      OR v_country_ids && s.country_ids
    )
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> v_embedding) >= v_threshold
  ORDER BY s.embedding <=> v_embedding ASC
  LIMIT 1;

  IF v_story_id IS NOT NULL THEN
    INSERT INTO public.news_story_articles (story_id, article_id, similarity)
    VALUES (v_story_id, p_article_id, v_sim)
    ON CONFLICT DO NOTHING;

    UPDATE public.news_stories s SET
      article_count = (SELECT count(*) FROM public.news_story_articles WHERE story_id = s.id),
      last_updated_at = GREATEST(s.last_updated_at, v_published_at),
      country_ids = (
        SELECT COALESCE(array_agg(DISTINCT cid) FILTER (WHERE cid IS NOT NULL), '{}'::uuid[])
        FROM (
          SELECT unnest(s.country_ids) AS cid
          UNION
          SELECT unnest(v_country_ids) AS cid
        ) u
      ),
      embedding = (
        SELECT (avg(ce.embedding))::extensions.vector
        FROM public.news_story_articles sa
        JOIN public.content_embeddings ce
          ON ce.content_type = 'news' AND ce.content_id = sa.article_id
        WHERE sa.story_id = s.id
      )
    WHERE s.id = v_story_id;
  ELSE
    v_slug := regexp_replace(lower(substring(v_title, 1, 80)), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' OR v_slug IS NULL THEN v_slug := 'story'; END IF;
    v_slug := v_slug || '-' || substring(p_article_id::text, 1, 8);

    INSERT INTO public.news_stories (
      slug, title, hero_article_id, article_count,
      first_seen_at, last_updated_at, country_ids, embedding
    )
    VALUES (
      v_slug, v_title, p_article_id, 1,
      v_published_at, v_published_at,
      COALESCE(v_country_ids, '{}'::uuid[]), v_embedding
    )
    RETURNING id INTO v_story_id;

    INSERT INTO public.news_story_articles (story_id, article_id, similarity)
    VALUES (v_story_id, p_article_id, 1.0);
  END IF;

  RETURN v_story_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cluster_news_backfill(p_limit int DEFAULT 200, p_days int DEFAULT 60)
RETURNS TABLE(clustered int, skipped int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  r record;
  v_clustered int := 0;
  v_skipped int := 0;
  v_story uuid;
BEGIN
  FOR r IN
    SELECT na.id
    FROM public.news_articles na
    LEFT JOIN public.news_story_articles sa ON sa.article_id = na.id
    JOIN public.content_embeddings ce ON ce.content_type='news' AND ce.content_id=na.id
    WHERE sa.article_id IS NULL
      AND na.published_at >= now() - make_interval(days => p_days)
    ORDER BY na.published_at DESC
    LIMIT p_limit
  LOOP
    v_story := public.cluster_news_article(r.id);
    IF v_story IS NULL THEN v_skipped := v_skipped + 1;
    ELSE v_clustered := v_clustered + 1;
    END IF;
  END LOOP;
  clustered := v_clustered;
  skipped := v_skipped;
  RETURN NEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.cluster_news_article(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cluster_news_backfill(int, int) TO authenticated, service_role;

-- Incremental clustering every 10 minutes (newest articles within 14d window).
SELECT cron.schedule(
  'cluster-news-stories',
  '*/10 * * * *',
  $$SELECT public.cluster_news_backfill(200, 14)$$
);
