-- Give a podcast SHOW a public identity, and stop news_sources leaking its
-- operational columns to anonymous readers.
--
-- ── The show entity ─────────────────────────────────────────────────────────
-- A podcast episode is a news_articles row; the SHOW it belongs to is a
-- news_sources row with feed_type='podcast'. 265 of them, holding 8,332
-- episodes, and until now with no slug, no blurb and no public page — the only
-- route to any of it was a "Podcasts only" switch inside the filter sheet on
-- /news/all, on a page where that filter component is not even mounted.
--
-- description and website_url are left NULL here ON PURPOSE. They are filled by
-- source-rss-news from the feed's channel header on the next successful fetch,
-- exactly as artwork_url is. A one-shot backfill in this migration would update
-- zero rows and report success — the ordering trap 20361118143800 records.
--
-- ── The leak ────────────────────────────────────────────────────────────────
-- RLS on news_sources has a `Public can view active news sources` policy with
-- USING (is_active = true), and anon holds a TABLE-wide SELECT grant. RLS
-- filters ROWS, not COLUMNS — so `select=*` as anon returns last_error,
-- keywords, auto_paused_reason, reliability_score, consecutive_failures,
-- auto_publish and organization_id. It is not theoretical: useNews.tsx has been
-- issuing exactly that select on every anonymous /news load.
--
-- Same class as the profiles finding, and the same remedy as
-- 20260816120000_profiles_anon_column_grants.sql: revoke the table grant,
-- re-grant an enumerated column list. It is fail-closed — every future ADD
-- COLUMN is invisible to anon until someone adds it here on purpose.
--
-- Scoped to anon ONLY. A column grant is per-ROLE, and `authenticated` is one
-- role shared by the admin console (useNewsSources reads select('*') with an
-- admin JWT) and every free signup. Narrowing that is a separate change with
-- its own blast radius, exactly as the profiles migration deferred it.
--
-- The anon INSERT/UPDATE/DELETE grants on this table are left alone: there is
-- no anon-applicable RLS policy for those commands, so they cannot execute.
-- SELECT is the live issue and the only one this touches.

BEGIN;

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS slug          text,
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS website_url   text,
  ADD COLUMN IF NOT EXISTS episode_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.news_sources.slug IS
  'Public URL segment for /podcasts/:slug. Derived from name on insert by auto_slug_from_name.';
COMMENT ON COLUMN public.news_sources.description IS
  'Show blurb, read from the feed channel header by source-rss-news. Never hand-maintained.';
COMMENT ON COLUMN public.news_sources.website_url IS
  'The show''s own site (channel <link>), NOT the feed URL — that is news_sources.url.';
COMMENT ON COLUMN public.news_sources.episode_count IS
  'Denormalised count of committed articles, refreshed nightly by news_source_episode_count. Gates a show out of the public hub and the sitemap: a show with no episodes is a thin page.';

-- Backfill through the shared helper rather than a hand-rolled slugifier.
-- Measured: 314 sources produce 313 distinct generate_slug(name) values — the
-- single collision is precisely what generate_unique_slug is for.
UPDATE public.news_sources s
   SET slug = public.generate_unique_slug('news_sources', public.generate_slug(s.name), s.id)
 WHERE s.slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS news_sources_slug_key
  ON public.news_sources (slug) WHERE slug IS NOT NULL;

-- The same generic trigger already attached to cities, countries, personalities
-- and venues. It keys on TG_TABLE_NAME, so there is no new function here.
DROP TRIGGER IF EXISTS trg_news_sources_slug ON public.news_sources;
CREATE TRIGGER trg_news_sources_slug
  BEFORE INSERT ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_name();

-- ── episode_count ────────────────────────────────────────────────────────────
-- Denormalised because the hub, the crawler body and the sitemap all need it as
-- a FILTER, and a correlated count over 47k news_articles per source is not
-- that. Refreshed nightly; 265 rows, one statement.
CREATE OR REPLACE FUNCTION public.run_news_source_episode_count()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n int;
BEGIN
  WITH counts AS (
    SELECT s.id, count(a.id) AS n
      FROM public.news_sources s
      LEFT JOIN public.news_articles a
             ON a.source_id = s.id
            AND a.duplicate_of_id IS NULL
            AND a.archived_at IS NULL
     GROUP BY s.id
  )
  UPDATE public.news_sources s
     SET episode_count = c.n
    FROM counts c
   WHERE c.id = s.id
     -- IS DISTINCT FROM, so a nightly no-op does not rewrite 314 rows and does
     -- not wake anything watching this table.
     AND s.episode_count IS DISTINCT FROM c.n;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_n);
END $$;

REVOKE ALL ON FUNCTION public.run_news_source_episode_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_news_source_episode_count() TO service_role;

SELECT public.run_news_source_episode_count();

INSERT INTO public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
VALUES (
  'news_source_episode_count',
  'News source episode count',
  'Refreshes news_sources.episode_count, which gates a podcast show out of /podcasts, the crawler hub body and sitemap-podcasts.xml when it has no episodes.',
  '45 4 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_news_source_episode_count',
    'command', 'SELECT public.run_news_source_episode_count();',
    'jobname', 'news_source_episode_count'
  ),
  true,
  3
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = excluded.schedule, action = excluded.action, enabled = true;

SELECT cron.schedule(
  'news_source_episode_count',
  '45 4 * * *',
  'SELECT public.run_news_source_episode_count();'
);

-- ── Close the column leak ────────────────────────────────────────────────────
REVOKE SELECT ON TABLE public.news_sources FROM anon;
REVOKE SELECT ON TABLE public.news_sources FROM PUBLIC;

-- is_active is granted because the CLIENT selects and filters on it, not
-- because the RLS policy reads it — a USING clause needs no column privilege.
GRANT SELECT (
  id, name, slug, description, url, website_url, category,
  feed_type, artwork_url, is_active, is_aggregator,
  organization_id, episode_count
) ON public.news_sources TO anon;

-- ── Postconditions ───────────────────────────────────────────────────────────
DO $$
DECLARE v_nullslug int; v_dupes int; v_leaked text[];
BEGIN
  SELECT count(*) INTO v_nullslug FROM public.news_sources WHERE slug IS NULL;
  IF v_nullslug > 0 THEN
    RAISE EXCEPTION 'news_sources: % rows still have no slug', v_nullslug;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT slug FROM public.news_sources GROUP BY slug HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'news_sources: % duplicate slugs', v_dupes;
  END IF;

  -- The point of the whole grant block: assert the leak is CLOSED by naming the
  -- columns that must not be reachable, rather than trusting the GRANT above to
  -- have been written correctly.
  SELECT array_agg(column_name ORDER BY column_name) INTO v_leaked
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'news_sources'
     AND grantee = 'anon' AND privilege_type = 'SELECT'
     AND column_name IN ('last_error','keywords','auto_paused_reason','reliability_score',
                         'consecutive_failures','auto_publish','backoff_until',
                         'consecutive_empty_fetches','avg_articles_per_fetch');
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'news_sources still exposes operational columns to anon: %', v_leaked;
  END IF;
END $$;

COMMIT;
