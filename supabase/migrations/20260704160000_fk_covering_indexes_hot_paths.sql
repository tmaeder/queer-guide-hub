-- Conservative slice of the 278 unindexed_foreign_keys INFO advisories:
-- covering indexes ONLY for FK columns on hot child tables, selected from a
-- 62-day pg_stat window (stats never reset since 2026-05-03):
--   news_articles.duplicate_of_id      764k seq scans / 12.4B tuples read
--     (search + dedup exclude duplicate_of_id IS NOT NULL on every query)
--   marketplace_listings.merchant_id   576k seq scans / 8.5B tuples read
--     (merchant pages filter by merchant)
--   events.festival_id                 642k seq scans (festival detail pages)
--   user_events.user_id                138k seq scans / 5B tuples read
--     (personalization reads per user)
--   news_article_countries.country_id  15k seq scans (country page news)
-- Partial where the column is mostly NULL. No CONCURRENTLY (runs in a
-- transaction per repo convention); tables are 4k-60k rows, lock is brief.
-- The unused_index advisories (117) were analyzed and deliberately NOT
-- dropped: every candidate is constraint-backed, feature-new, tiny, or
-- plausibly load-bearing for rare paths (PostGIS geo) — see PR notes.
-- Applied 2026-07-04 via MCP (repair --status applied) — CI will skip.

CREATE INDEX IF NOT EXISTS idx_news_articles_duplicate_of
  ON public.news_articles (duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_merchant
  ON public.marketplace_listings (merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_festival
  ON public.events (festival_id)
  WHERE festival_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_events_user
  ON public.user_events (user_id);

CREATE INDEX IF NOT EXISTS idx_news_article_countries_country
  ON public.news_article_countries (country_id);
