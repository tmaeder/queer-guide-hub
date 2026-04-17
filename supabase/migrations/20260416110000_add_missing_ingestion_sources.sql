-- Add missing ingestion_sources entries so scrape_sources can create import_jobs_enhanced
-- These sources exist in scrape_sources but had no matching ingestion_sources entry,
-- causing FK constraint violations on import_jobs_enhanced.source_id

INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled)
VALUES
  ('Eventfrog LGBTIQ', 'eventfrog-lgbtiq', 'scraper', 'events', 'scrape-web-sources', true),
  ('World Naked Bike Ride', 'wnbr-events', 'scraper', 'events', 'scrape-web-sources', true),
  ('Equaldex Timeline', 'equaldex-timeline', 'scraper', 'news_articles', 'scrape-web-sources', true),
  ('Display Magazin Agenda', 'display-magazin', 'scraper', 'events', 'scrape-web-sources', false)
ON CONFLICT (slug) DO NOTHING;

-- Reset consecutive_failures for sources that were failing due to FK issue
UPDATE public.scrape_sources
SET consecutive_failures = 0, last_error = NULL
WHERE slug IN ('eventfrog-lgbtiq', 'wnbr-events', 'equaldex-timeline')
  AND last_error LIKE '%import_jobs_enhanced%';
