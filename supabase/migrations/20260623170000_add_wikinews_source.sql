-- Add Wikinews (English) LGBT category as a news source.
--
-- Wikinews has no usable per-category RSS feed (the RecentChangesLinked feed for
-- Category:LGBT comes back empty), so it is fetched via the MediaWiki Action API
-- instead of the RSS path. The source-rss-news edge function detects the
-- wikinews.org host and routes to the MediaWiki branch (see
-- supabase/functions/_shared/wikinews.ts); the URL below is the human category
-- page, from which the function derives the API endpoint + category title.
--
-- source_type='wikimedia' is descriptive (the loop branches on the host, not the
-- type). Content is human-curated LGBT news, so this source is set
-- auto_publish=true — genuine articles flow live through the normal quality gate
-- (quality_status='passed'); only low-quality/borderline items get held for
-- review. fetch_frequency is 6h: the category updates slowly.
--
-- Historical archive (~hundreds of articles back to ~2005) is imported via
-- scripts/import-wikinews-history.mjs, which drives the function's backfill mode.
-- Idempotent on URL: re-running is a no-op.

INSERT INTO public.news_sources (name, url, source_type, category, is_active, fetch_frequency, auto_publish)
SELECT 'Wikinews', 'https://en.wikinews.org/wiki/Category:LGBT', 'wikimedia', 'news', true, 360, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = 'https://en.wikinews.org/wiki/Category:LGBT'
);
