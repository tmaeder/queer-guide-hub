-- Track consecutive empty fetches on news_sources to catch silent-zero APIs.
--
-- Background: NewsAPI.org and ILGA World Monitor were fetching successfully
-- (HTTP 200) but returning zero articles. The fetch path marked them healthy,
-- so they never tripped the consecutive_failures / auto_paused logic and
-- silently produced no content for weeks.
--
-- This adds a parallel counter that gets reset on any non-empty fetch and
-- triggers auto_paused at 8 consecutive empties (mirrors the failure ladder).

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS consecutive_empty_fetches integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.news_sources.consecutive_empty_fetches IS
  'Count of consecutive fetches that returned zero items despite HTTP 200. '
  'Auto-paused at 8. Reset on the next fetch that returns >= 1 item.';
