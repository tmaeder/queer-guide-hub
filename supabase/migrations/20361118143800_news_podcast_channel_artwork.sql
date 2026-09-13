-- Podcast episodes get their SHOW's artwork instead of nothing.
--
-- Companion to 20361118143700, which cleared audio URLs out of image_url. That
-- left ~5,599 episodes with no image at all, rendering the placeholder. They
-- are not unillustrated: essentially every podcast declares <itunes:image> in
-- its CHANNEL header, and source-rss-news never read it — it only ever looked
-- for per-item artwork, which most shows do not publish. That gap is exactly
-- why extractMediaUrl's untyped enclosure fallback fired on the whole podcast
-- corpus: for most episodes there was nothing else for it to find.
--
-- The parser now uses channel artwork as the podcast fallback, so NEW episodes
-- are covered at ingest. This migration covers the ones already stored.
--
-- Cached on the SOURCE, not re-derived per article: it is a property of the
-- show. source-rss-news writes it on every successful podcast fetch (and never
-- clobbers a stored value with null, so a feed that transiently omits its
-- header does not erase artwork every episode depends on).
--
-- 265 podcast sources on prod, 262 active — so the whole backfill costs 265
-- feed reads amortised across the existing hourly news cron, not 5,599.

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS artwork_url text;

COMMENT ON COLUMN public.news_sources.artwork_url IS
  'Show-level <itunes:image> from the channel header, refreshed by source-rss-news on each successful podcast fetch. Fallback artwork for episodes that publish none of their own.';

-- Deliberately NOT a one-shot in this migration. artwork_url is empty until
-- each source next runs, so a one-shot here would execute against an empty
-- column, update zero rows and report success — the ordering trap that makes a
-- repair look done when it has not started.
--
-- The work list is self-limiting: a source with no artwork is never selected,
-- so there is no re-offer loop and no terminal stamp to maintain. It drains to
-- zero and stays there.
CREATE OR REPLACE FUNCTION public.run_news_podcast_artwork_fill(p_batch int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n int;
BEGIN
  -- Batched: news_articles carries a search sync trigger, so an unbounded
  -- UPDATE risks a statement timeout, and a timeout is a full rollback.
  WITH batch AS (
    SELECT a.id, s.artwork_url
    FROM public.news_articles a
    JOIN public.news_sources s ON s.id = a.source_id
    WHERE a.media_type = 'podcast'
      AND (a.image_url IS NULL OR btrim(a.image_url) = '')
      AND s.artwork_url IS NOT NULL
      AND btrim(s.artwork_url) <> ''
      -- Never re-introduce the defect this exists to clean up. The trigger
      -- would null it anyway; refusing here means the row is not counted as
      -- filled when it was not.
      AND NOT public.is_non_image_url(s.artwork_url)
    LIMIT greatest(p_batch, 0)
  )
  UPDATE public.news_articles a
     SET image_url = b.artwork_url
    FROM batch b WHERE a.id = b.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'filled', v_n,
    'remaining', (
      SELECT count(*) FROM public.news_articles a
      JOIN public.news_sources s ON s.id = a.source_id
      WHERE a.media_type = 'podcast'
        AND (a.image_url IS NULL OR btrim(a.image_url) = '')
        AND s.artwork_url IS NOT NULL
        AND NOT public.is_non_image_url(s.artwork_url)
    ),
    'sources_with_artwork', (
      SELECT count(*) FROM public.news_sources
      WHERE feed_type = 'podcast' AND artwork_url IS NOT NULL
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.run_news_podcast_artwork_fill(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_news_podcast_artwork_fill(int) TO service_role;

INSERT INTO public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
VALUES (
  'news_podcast_artwork_fill',
  'News podcast artwork fill',
  'Fills podcast episodes that carry no artwork of their own from their show''s channel-level <itunes:image>, cached on news_sources.artwork_url by source-rss-news.',
  '25 3 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_news_podcast_artwork_fill',
    'command', 'SELECT public.run_news_podcast_artwork_fill(300);',
    'jobname', 'news_podcast_artwork_fill'
  ),
  true,
  3
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = excluded.schedule,
      action   = excluded.action,
      enabled  = true;

SELECT cron.schedule(
  'news_podcast_artwork_fill',
  '25 3 * * *',
  'SELECT public.run_news_podcast_artwork_fill(300);'
);

DO $$
BEGIN
  -- The function must run cleanly against today's empty column. It will fill
  -- nothing (artwork_url is null everywhere until source-rss-news next runs),
  -- and that is the expected first result — asserting a non-zero fill here
  -- would be asserting a race with the news cron.
  PERFORM public.run_news_podcast_artwork_fill(1);

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'news_podcast_artwork_fill') THEN
    RAISE EXCEPTION 'news_podcast_artwork_fill cron was not scheduled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_automations
    WHERE slug = 'news_podcast_artwork_fill' AND enabled
  ) THEN
    RAISE EXCEPTION 'news_podcast_artwork_fill is not registered and enabled';
  END IF;
END $$;
