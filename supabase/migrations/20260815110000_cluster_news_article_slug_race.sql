-- ============================================================================
-- cluster_news_article: two cron jobs race for the same article and one dies
-- ----------------------------------------------------------------------------
-- 15 cron runs failed with:
--   ERROR: duplicate key value violates unique constraint "news_stories_slug_key"
-- across BOTH clustering jobs (news_story_backfill 8, cluster-news-stories 7).
-- A failure rolls back the whole 200-article batch, so the work is lost, not
-- just delayed.
--
-- It is NOT a title collision. The slug already ends in the article's own UUID
-- prefix:
--   slugify(title[1..80]) || '-' || substring(article_id::text, 1, 8)
-- so two DIFFERENT articles essentially cannot collide. Producing this error
-- requires the SAME article to be clustered twice concurrently.
--
-- Which is exactly what is scheduled. Both jobs run on `*/10 * * * *` — the
-- identical minute — and their candidate sets overlap:
--
--   cluster-news-stories  cluster_news_backfill(200, 14)          last 14 days, newest first
--   news_story_backfill   cluster_news_backfill(200, NULL, true)  NO lower bound, oldest first
--
-- `p_days => NULL` means no lower bound, so the drain's candidate set contains
-- the live job's. Both workers pass this function's opening guard —
--   SELECT story_id ... IF FOUND THEN RETURN
-- — which is a check-then-act with no lock, both mint the identical
-- deterministic slug, and the second INSERT raises.
--
-- This gets WORSE as the ~21k-article backlog drains and the two candidate
-- sets converge.
--
-- FIX: make the story INSERT idempotent. ON CONFLICT (slug) blocks on the
-- concurrent uncommitted insert, then does nothing; we re-read the winner's row
-- and proceed as the loser. The article-join INSERT below already carried
-- ON CONFLICT DO NOTHING, so it needed no change.
--
-- DELIBERATELY NOT AN ADVISORY LOCK. The obvious `pg_advisory_xact_lock` on the
-- article id would deadlock: the two jobs walk the SAME rows in OPPOSITE orders
-- (oldest-first vs newest-first), so A holding article 1 and waiting on 2 while
-- B holds 2 and waits on 1 is reachable — and xact locks are held for the whole
-- 200-row batch. The idempotent insert needs no lock ordering at all.
--
-- Body transcribed from the LIVE pg_proc.prosrc (not from a repo file), so this
-- CREATE OR REPLACE cannot silently revert a fix that only exists in the DB.
-- The ONLY change from the live body is the ELSE branch's INSERT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cluster_news_article(p_article_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

    -- CHANGED: idempotent. A concurrent worker clustering this same article
    -- mints the identical slug; ON CONFLICT waits for it to commit and yields
    -- no row, and we adopt the story it created instead of raising and losing
    -- the whole batch.
    INSERT INTO public.news_stories (
      slug, title, hero_article_id, article_count,
      first_seen_at, last_updated_at, country_ids, embedding
    )
    VALUES (
      v_slug, v_title, p_article_id, 1,
      v_published_at, v_published_at,
      COALESCE(v_country_ids, '{}'::uuid[]), v_embedding
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_story_id;

    IF v_story_id IS NULL THEN
      SELECT id INTO v_story_id FROM public.news_stories WHERE slug = v_slug;
      -- The winner already inserted its own join row; ours is a no-op below.
    END IF;

    IF v_story_id IS NULL THEN RETURN NULL; END IF;

    INSERT INTO public.news_story_articles (story_id, article_id, similarity)
    VALUES (v_story_id, p_article_id, 1.0)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_story_id;
END;
$function$;

-- Reduce the contention that surfaced this at all: the two jobs fired on the
-- SAME minute. Staggering is not the fix (the race is real whenever the sets
-- overlap, and the idempotent insert above is what closes it) but there is no
-- reason to schedule a guaranteed collision every ten minutes.
SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'news_story_backfill'),
  schedule := '5-55/10 * * * *'
);

UPDATE public.admin_automations
   SET schedule = '5-55/10 * * * *'
 WHERE slug = 'news_story_backfill';
