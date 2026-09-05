-- ============================================================================
-- news_sources_eligible: reliability must throttle a source, never exile it.
-- ----------------------------------------------------------------------------
-- The selector ordered `reliability_score DESC NULLS LAST, last_fetched_at ASC`
-- — reliability PRIMARY, staleness only a tiebreaker — and source-rss-news asks
-- for 15 rows per run (DEFAULT_MAX_FEEDS_PER_RUN, hard cap 30).
--
-- Measured on prod 2026-09-03: 293 live sources sit at reliability_score 1.000
-- and exactly TWO sit at 0.999 — NewsData.io and GNews.io. At rank ~294 they
-- cannot enter a 15-row window, or a 30-row one, ever. Neither has been fetched
-- since 2026-07-13 (52 days), and both read is_active=true, auto_paused=false,
-- consecutive_failures=0, last_error='' — every health column says healthy.
--
-- The 0.001 is not a rounding artifact. reliability_score is an EWMA toward the
-- editor accept-rate (20260530130000) stored numeric(4,3), so ONE editorial
-- rejection moves a source by the smallest representable step — and against a
-- fleet saturated at 1.000, that step is permanent exclusion. A ranking signal
-- became a kill switch at its finest granularity.
--
-- source-rss-news/index.ts:38 asserted the opposite in a comment — "Capped runs
-- lose nothing: last_fetched_at is stamped at claim time and
-- news_sources_eligible orders by it ASC, so the next run picks up the feeds
-- this one didn't touch." That is true only WITHIN a reliability tier. The
-- comment is corrected in the same change as this migration.
--
-- THE FIX INVERTS THE TWO KEYS AND MOVES RELIABILITY INTO THE INTERVAL.
-- Ordering by staleness makes starvation structurally impossible: a source that
-- waits longer becomes the oldest and is selected. Reliability still has teeth,
-- as a multiplier on the re-fetch interval (1.000 → ×1.0, 0.800 → ×1.2,
-- 0.0 → ×2.0), so a poor source is visited less often instead of never. That is
-- the property worth having — "how often" degrades gracefully, "whether" does
-- not.
--
-- Signature is unchanged (the adapter destructures these nine columns), so this
-- is a plain CREATE OR REPLACE with no DROP.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.news_sources_eligible(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, url text, source_type text, category text,
               fetch_frequency integer, last_fetched_at timestamp with time zone,
               keywords text[], feed_type text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.url, s.source_type, s.category,
         s.fetch_frequency, s.last_fetched_at, s.keywords, s.feed_type
    FROM public.news_sources s
   WHERE s.is_active = true
     AND s.auto_paused = false
     AND (s.backoff_until IS NULL OR s.backoff_until <= now())
     -- Reliability lengthens the wait rather than deciding eligibility.
     AND (s.last_fetched_at IS NULL
          OR s.last_fetched_at < now() - (
               GREATEST(1, round(
                 coalesce(s.fetch_frequency, 60)
                 * (2.0 - LEAST(1.0, GREATEST(0.0, coalesce(s.reliability_score, 1.0))))
               ))::int || ' minutes')::INTERVAL)
   -- Staleness first. Rotation is then guaranteed: nothing can be permanently
   -- outranked, because waiting is the thing that promotes you.
   ORDER BY s.last_fetched_at ASC NULLS FIRST, s.reliability_score DESC NULLS LAST
   LIMIT p_limit;
$function$;

-- ============================================================================
-- Sentinel: an active source the rotation is not reaching.
-- ----------------------------------------------------------------------------
-- Deliberately its OWN function rather than another key inside
-- pipeline_hygiene_stats(). That function is a single 6.8k-character
-- jsonb_build_object, so adding a key means restating the whole body, and this
-- repo has already had one restated stats function turn into a merge-collision
-- surface between concurrent sessions. A separate function composes instead.
--
-- The threshold is 7 days against fetch_frequency values measured in MINUTES —
-- two orders of magnitude of headroom, so this cannot fire on ordinary queue
-- depth. It fires on the shape that hid for 52 days: eligible, healthy by every
-- column, and never selected.
--
-- Reports the source rather than a bare count, because "which one" is the whole
-- question — a count of 2 would have been just as invisible as the silence was.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.news_source_starvation_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'starved', COALESCE((
      SELECT jsonb_object_agg(name, days) FROM (
        SELECT s.name,
               round(extract(epoch FROM now() - s.last_fetched_at) / 86400)::int AS days
        FROM public.news_sources s
        WHERE s.is_active = true
          AND s.auto_paused = false
          AND (s.backoff_until IS NULL OR s.backoff_until <= now())
          AND s.last_fetched_at IS NOT NULL
          AND s.last_fetched_at < now() - interval '7 days'
        ORDER BY s.last_fetched_at ASC
      ) s
    ), '{}'::jsonb),
    -- Context for a reader looking at a non-empty 'starved': if the fleet is
    -- saturated at one score, a lower one is an exile rather than a demotion.
    'distinct_reliability_scores', (
      SELECT count(DISTINCT reliability_score)
      FROM public.news_sources WHERE is_active AND NOT auto_paused
    ),
    'active_sources', (
      SELECT count(*) FROM public.news_sources WHERE is_active AND NOT auto_paused
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.news_source_starvation_stats() TO service_role;

-- ============================================================================
-- Retire the four news aggregators.
-- ----------------------------------------------------------------------------
-- NewsData.io, GNews.io, NewsAPI.org, TheNewsAPI.com. All four are already
-- dead in practice and the fleet did not notice:
--
--   NewsData.io    last fetch 2026-07-13  starved by the ordering above
--   GNews.io       last fetch 2026-07-13  starved by the ordering above
--   NewsAPI.org    last fetch 2026-05-23  auto-paused, 8 consecutive empty fetches
--   TheNewsAPI.com last fetch 2026-04-16  is_active=false already
--
-- WHY RETIRE RATHER THAN REVIVE, now that the ordering fix would make them
-- selectable again:
--
--   1. The quality gate rejected 8,338 of their 14,838 articles — 56%, with 0
--      of the rejected indexable. They cost API quota and LLM enrichment spend
--      to produce a corpus the gate then threw away.
--   2. Volume does not need them. Aggregator output went 2,917/month (Feb) →
--      1,100 (Jul) → 0 (Aug and Sep), while the total ROSE: August was 7,124
--      articles, every one from the 293-feed RSS fleet.
--   3. Their query is broken in two ways that retirement disposes of. Each row
--      carries a curated `keywords` array (NewsData's names "Sexual
--      Orientation" and "Christopher Street Day"; NewsAPI's names "hiv" and
--      "aids"), news_sources_eligible RETURNS that column, and the NewsSource
--      interface in source-rss-news/index.ts omits it — so it is discarded at
--      the type boundary and no fetcher has ever read it. What they send
--      instead is a module-level constant sliced to five terms,
--      `lgbtq OR lgbt OR gay OR lesbian OR trans`, identical for all four:
--      loose enough that bare "gay" and "trans" match namesakes and prefixes,
--      narrow enough to omit queer — this site's own name — plus pride,
--      nonbinary, bisexual, drag, rainbow and same-sex.
--
-- is_active=false is what the selector reads; status='retired' is for a human
-- reading the row (nothing in the app reads `status` — verified). The 14,838
-- articles they already produced are NOT touched: they carry verdicts, 3,757
-- are live and indexable, and retiring a source is not a reason to unpublish
-- what it correctly contributed.
--
-- REVERSIBLE, and that is a real risk worth naming: the admin UI at
-- NewsSourcesManager.tsx toggles is_active directly, so one click revives a
-- source whose query is still broken. The fetcher code is left in place and
-- carries a comment naming both defects, so whoever flips it back finds them.
-- ============================================================================

UPDATE public.news_sources
   SET is_active = false,
       status = 'retired',
       updated_at = now()
 WHERE is_aggregator = true
   AND name IN ('NewsData.io', 'GNews.io', 'NewsAPI.org', 'TheNewsAPI.com');

-- ============================================================================
-- Re-assert what this migration exists to do, against the live rows.
-- ----------------------------------------------------------------------------
-- Both guards below are scoped to THIS migration's own effect. An assertion
-- about ambient state — "no aggregator anywhere is active", "no source anywhere
-- is starved" — aborts `db push` on data this file never touched, and an
-- aborted push strands every later migration behind it.
-- ============================================================================
DO $verify$
DECLARE
  v_live_aggregators int;
  v_starved int;
BEGIN
  -- Predicate matches the UPDATE above exactly, so this asserts the rows THIS
  -- migration wrote and nothing else. Counting every `is_aggregator AND
  -- is_active` row would make it abort on an unrelated aggregator an admin
  -- toggled on by hand — NewsSourcesManager.tsx edits is_active directly —
  -- which says nothing about whether the retirement took.
  SELECT count(*) INTO v_live_aggregators
    FROM public.news_sources
   WHERE is_aggregator = true
     AND name IN ('NewsData.io', 'GNews.io', 'NewsAPI.org', 'TheNewsAPI.com')
     AND is_active = true;
  IF v_live_aggregators <> 0 THEN
    RAISE EXCEPTION 'retirement did not take: % of the four retired aggregator(s) still active',
      v_live_aggregators;
  END IF;

  -- WARNING, not EXCEPTION. Starvation is pre-existing data this migration
  -- cannot repair: last_fetched_at only moves when the cron runs, so a source
  -- starved by the OLD ordering is still starved the instant the new ordering
  -- is installed — the fix takes effect on the next fetch, not at apply time.
  -- Under the live ordering a single editorial rejection knocks a source off
  -- the saturated 1.000 tier and starves it immediately, so a third starved
  -- source at apply time is entirely plausible and would abort the push that
  -- delivers the cure. The condition is still enforced: the same PR adds a
  -- news-source-rotation sentinel to scripts/check-pipeline-health.mjs that
  -- hard-fails CI on any starved source. Measurement and message are unchanged.
  SELECT count(*) INTO v_starved
    FROM jsonb_object_keys((public.news_source_starvation_stats()->'starved')) k;
  IF v_starved <> 0 THEN
    RAISE WARNING 'sentinel reports % starved source(s) after the fix: %',
      v_starved, public.news_source_starvation_stats()->'starved';
  END IF;
END
$verify$;
