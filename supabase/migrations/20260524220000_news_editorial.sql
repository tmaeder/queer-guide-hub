-- News editorial rebuild — schema foundation.
--
-- 1. news_articles: is_editors_pick flag + editorial_note ("why this matters")
-- 2. user_news_reads: lightweight reading history for streak + challenge progress
-- 3. news_challenges: weekly editorial brief (admin-curated)
-- 4. rpc news_reading_streak(p_user) returning {current_streak, longest_streak, last_read_date}

-- ---------------------------------------------------------------------------
-- 1. Editorial flags on news_articles
-- ---------------------------------------------------------------------------
ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS is_editors_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editorial_note text;

CREATE INDEX IF NOT EXISTS idx_news_articles_editors_pick
  ON public.news_articles (published_at DESC)
  WHERE is_editors_pick;

-- ---------------------------------------------------------------------------
-- 2. user_news_reads — one row per (user, article) when first read
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_news_reads (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.news_articles(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_user_news_reads_user_day
  ON public.user_news_reads (user_id, ((read_at AT TIME ZONE 'UTC')::date));
CREATE INDEX IF NOT EXISTS idx_user_news_reads_user_read_at
  ON public.user_news_reads (user_id, read_at DESC);

ALTER TABLE public.user_news_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_news_reads_self_select ON public.user_news_reads;
CREATE POLICY user_news_reads_self_select ON public.user_news_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_news_reads_self_insert ON public.user_news_reads;
CREATE POLICY user_news_reads_self_insert ON public.user_news_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_news_reads_self_delete ON public.user_news_reads;
CREATE POLICY user_news_reads_self_delete ON public.user_news_reads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. news_challenges — one row per Monday
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_challenges (
  week_starting date PRIMARY KEY,
  title         text NOT NULL,
  description   text,
  rule_kind     text NOT NULL CHECK (rule_kind IN ('distinct_countries','distinct_categories','count')),
  target        integer NOT NULL CHECK (target > 0),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.news_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_challenges_public_select ON public.news_challenges;
CREATE POLICY news_challenges_public_select ON public.news_challenges
  FOR SELECT TO anon, authenticated USING (true);

-- Admin write paths reuse existing has_admin_role helper if present; otherwise
-- challenges can be inserted via the service role only (Edge functions / SQL).
-- Intentionally not granting INSERT/UPDATE/DELETE to authenticated here — the
-- admin form will go through an Edge function with the service role.

-- ---------------------------------------------------------------------------
-- 4. RPC: reading streak
-- Returns the current streak (consecutive UTC days with ≥ 1 read ending today
-- or yesterday) and the longest streak ever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.news_reading_streak(p_user uuid)
RETURNS TABLE (current_streak int, longest_streak int, last_read_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() at time zone 'UTC')::date;
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT DISTINCT (read_at at time zone 'UTC')::date AS d
    FROM public.user_news_reads
    WHERE user_id = p_user
  ),
  numbered AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp
    FROM days
  ),
  runs AS (
    SELECT MIN(d) AS run_start, MAX(d) AS run_end, COUNT(*)::int AS run_len
    FROM numbered
    GROUP BY grp
  ),
  cur AS (
    SELECT run_len
    FROM runs
    WHERE run_end >= v_today - 1   -- still alive if read today or yesterday
    ORDER BY run_end DESC
    LIMIT 1
  ),
  longest AS (
    SELECT COALESCE(MAX(run_len), 0) AS run_len FROM runs
  ),
  last AS (
    SELECT MAX(d) AS d FROM days
  )
  SELECT
    COALESCE((SELECT run_len FROM cur), 0)::int,
    (SELECT run_len FROM longest)::int,
    (SELECT d FROM last);
END $$;

REVOKE ALL ON FUNCTION public.news_reading_streak(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.news_reading_streak(uuid) TO authenticated;

COMMENT ON FUNCTION public.news_reading_streak(uuid) IS
  'Days-in-a-row a user has read at least one news article (UTC). Returns 0 if no read today or yesterday. Used by /news ReaderRail.';
