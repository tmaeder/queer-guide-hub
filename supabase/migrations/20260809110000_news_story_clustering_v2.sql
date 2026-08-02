-- News story clustering v2: stop the drift, then widen.
--
-- news_stories is where multi-outlet coverage of one event consolidates -- it is
-- the real answer to "the same story appears five times in the feed", and the
-- dedup sweep must never merge those articles (see 20260809100000). It was both
-- badly behind and quietly broken.
--
-- BROKEN: stories walk forward forever.
--   cluster_news_article matched within +/-7 days of s.last_updated_at, and
--   last_updated_at is bumped to each new member. So a story advances a week at
--   a time, indefinitely, while its averaged centroid goes generic and turns it
--   into an attractor. Live evidence before this migration:
--     40 articles / 54 days  "Results"        -> i570, SD 518, Charli XCX
--     94 articles / 44 days  "I'm Genuinely Curious How Many Of These LGBTQ+
--                             Artists..."     -> "México City's 48th Pride March"
--     37 articles / 45 days  "3 Giants players attacked the LGBTQ community"
--   Every runaway sits at avg similarity 0.847-0.856, barely over the 0.82 bar.
--   The correct stories (Jason Collins, SCOTUS trans athletes, Barney Frank,
--   Queerty Crossword) sit at 0.87-0.95. Drift, not the threshold, is what
--   builds junk drawers -- which is why the threshold change below is safe only
--   together with the drift fix, never on its own.
--
-- BEHIND: 20,937 of 37,745 live articles had never been clustered, because the
--   cron is cluster_news_backfill(200, 14) and everything older than 14 days is
--   unreachable. 37,717 of 37,745 already have embeddings -- the data was there,
--   the sweep just could not see it.
--
-- CHANGES
--   1. Temporal anchor moves from last_updated_at to first_seen_at, plus a hard
--      14-day span cap. A story can no longer walk.
--   2. A candidate must also clear the bar against the story's HERO article
--      embedding, not just the averaged centroid, so centroid drift cannot
--      smuggle in a match the founding article would reject.
--   3. Threshold 0.82 -> 0.78, but the 0.78-0.82 band additionally requires at
--      least one shared dedup_core_tokens term between candidate and story
--      title. Measured on 250 recent singletons: 9 have a >=0.82 neighbour, 46
--      have a >=0.78 neighbour (~5x more grouping). Of the 37 newly caught
--      in-band, 27 (73%) share a title token and those pairs are genuinely the
--      same story (Madonna -> WorldPride 2026; the Berlin Pride shooting across
--      two outlets; Brighton Pride 2026; the Epstein sham wedding; the RuPaul
--      Guinness record). The 10 the guard drops are topical-only pairs. Note
--      dedup_core_tokens strips gay/lgbt/lgbtq/queer as stopwords, so the guard
--      is not satisfied by the vocabulary every headline in this corpus shares.
--   4. cluster_news_backfill gains p_days => NULL (no lower bound) and an
--      oldest-first mode, so the historical backlog can drain.
--   5. run_news_story_resplit dissolves any story past the span cap and
--      re-clusters its members under the new rule. Members that belong together
--      re-form (the earliest member founds the story, so the slug is normally
--      regenerated identically); the rest become singletons or join correct
--      stories. Registered daily, so this also self-heals going forward.
--
-- news_stories / news_story_articles carry no triggers and only one FK
-- (news_story_articles.story_id ON DELETE CASCADE), so none of this touches the
-- search_documents sync path. Batch sizes here are about runtime, not triggers.

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
  v_tokens text[];
  v_published_at timestamptz;
  v_story_id uuid;
  v_existing_story uuid;
  v_sim real;
  -- admit on embedding alone at or above _hi; between _lo and _hi a shared
  -- title token is also required.
  v_threshold_hi constant real := 0.82;
  v_threshold_lo constant real := 0.78;
  -- a story is one event, not a topic: 14 days end to end, hard.
  v_max_span constant interval := '14 days';
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
  v_tokens := public.dedup_core_tokens(v_title);

  SELECT cand.id, cand.sim
    INTO v_story_id, v_sim
  FROM (
    SELECT s.id, s.title, s.first_seen_at, s.last_updated_at, s.hero_article_id,
           (1 - (s.embedding <=> v_embedding))::real AS sim
    FROM public.news_stories s
    WHERE s.embedding IS NOT NULL
      -- sargable prefilter; the exact span cap is applied below
      AND s.first_seen_at >= v_published_at - v_max_span
      AND s.first_seen_at <= v_published_at + v_max_span
      AND (
        cardinality(v_country_ids) = 0
        OR cardinality(s.country_ids) = 0
        OR v_country_ids && s.country_ids
      )
      AND 1 - (s.embedding <=> v_embedding) >= v_threshold_lo
    ORDER BY s.embedding <=> v_embedding ASC
    LIMIT 20
  ) cand
  WHERE
    -- the story must still be one event once this article is in it
    GREATEST(cand.last_updated_at, v_published_at)
      - LEAST(cand.first_seen_at, v_published_at) <= v_max_span
    -- second signal required in the 0.78-0.82 band
    AND (
      cand.sim >= v_threshold_hi
      OR EXISTS (
        SELECT 1 FROM unnest(v_tokens) t
        WHERE t = ANY (public.dedup_core_tokens(cand.title))
      )
    )
    -- the founding article gets a veto: a drifted centroid cannot admit an
    -- article the hero itself would not match.
    AND NOT EXISTS (
      SELECT 1 FROM public.content_embeddings ce
      WHERE ce.content_type = 'news'
        AND ce.content_id = cand.hero_article_id
        AND 1 - (ce.embedding <=> v_embedding) < v_threshold_lo
    )
  ORDER BY cand.sim DESC
  LIMIT 1;

  IF v_story_id IS NOT NULL THEN
    INSERT INTO public.news_story_articles (story_id, article_id, similarity)
    VALUES (v_story_id, p_article_id, v_sim)
    ON CONFLICT DO NOTHING;

    UPDATE public.news_stories s SET
      article_count = (SELECT count(*) FROM public.news_story_articles WHERE story_id = s.id),
      last_updated_at = GREATEST(s.last_updated_at, v_published_at),
      first_seen_at = LEAST(s.first_seen_at, v_published_at),
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

-- p_days => NULL means no lower bound (the historical drain); p_oldest_first
-- walks the backlog from the far end so it actually converges instead of
-- re-reading the same recent window.
--
-- The old 2-arg signature MUST be dropped, not left alongside: adding a third
-- defaulted parameter creates an overload rather than replacing, and the
-- existing cron call `cluster_news_backfill(200, 14)` would then match both
-- candidates and fail with 42725 (ambiguous function call) every 10 minutes.
DROP FUNCTION IF EXISTS public.cluster_news_backfill(int, int);

CREATE OR REPLACE FUNCTION public.cluster_news_backfill(
  p_limit int DEFAULT 200,
  p_days int DEFAULT 60,
  p_oldest_first boolean DEFAULT false)
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
      AND na.duplicate_of_id IS NULL
      AND (p_days IS NULL OR na.published_at >= now() - make_interval(days => p_days))
    ORDER BY
      CASE WHEN p_oldest_first THEN na.published_at END ASC NULLS LAST,
      CASE WHEN NOT p_oldest_first THEN na.published_at END DESC NULLS LAST
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

-- Dissolve stories that outgrew the span cap and re-cluster their members under
-- the new rule. Members are replayed oldest-first, so the earliest article
-- founds the replacement story -- which is what the original slug was derived
-- from, so the slug is normally regenerated byte-identical.
CREATE OR REPLACE FUNCTION public.run_news_story_resplit(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_max_span constant interval := '14 days';
  s record;
  a uuid;
  v_members uuid[];
  v_stories int := 0;
  v_articles int := 0;
BEGIN
  FOR s IN
    SELECT id FROM public.news_stories
    WHERE last_updated_at - first_seen_at > v_max_span
    ORDER BY (last_updated_at - first_seen_at) DESC
    LIMIT GREATEST(p_limit, 0)
  LOOP
    SELECT COALESCE(array_agg(sa.article_id ORDER BY na.published_at ASC NULLS LAST), '{}'::uuid[])
      INTO v_members
    FROM public.news_story_articles sa
    JOIN public.news_articles na ON na.id = sa.article_id
    WHERE sa.story_id = s.id;

    -- cascades news_story_articles; nothing else references news_stories
    DELETE FROM public.news_stories WHERE id = s.id;
    v_stories := v_stories + 1;

    FOREACH a IN ARRAY v_members LOOP
      PERFORM public.cluster_news_article(a);
      v_articles := v_articles + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('stories_dissolved', v_stories, 'articles_reclustered', v_articles);
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_news_story_resplit(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cluster_news_article(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cluster_news_backfill(int, int, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_news_story_resplit(int) TO service_role;

-- Historical drain: oldest-first, no lower bound, until the backlog is zero.
-- Runs alongside the existing cluster-news-stories cron, which keeps the live
-- edge fresh and is left untouched.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('news_story_backfill', 'News story backfill',
   'Drains the historical unclustered-article backlog oldest-first (200/run) into news_stories. Started at 20,937 of 37,745 articles never clustered, because the incremental cron only looks back 14 days.',
   'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
   '{"type":"rpc","fn":"cluster_news_backfill"}'::jsonb, '*/10 * * * *'),
  ('news_story_resplit', 'News story resplit',
   'Dissolves any news story whose span exceeds 14 days and re-clusters its members. Self-heals the junk-drawer stories that the pre-v2 walking window produced.',
   'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
   '{"type":"rpc","fn":"run_news_story_resplit"}'::jsonb, '40 3 * * *')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  action = EXCLUDED.action, trigger = EXCLUDED.trigger, schedule = EXCLUDED.schedule;

SELECT cron.unschedule('news_story_backfill') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'news_story_backfill');
SELECT cron.unschedule('news_story_resplit') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'news_story_resplit');

SELECT cron.schedule('news_story_backfill', '*/10 * * * *',
  $$SELECT public.cluster_news_backfill(200, NULL, true)$$);
SELECT cron.schedule('news_story_resplit', '40 3 * * *',
  $$SELECT public.run_news_story_resplit(50)$$);
