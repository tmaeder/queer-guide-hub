-- Backfill ingestion_sources for all scrape_sources that lack them
INSERT INTO public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled)
SELECT
  ss.name,
  ss.slug,
  'scraper' as source_type,
  ss.target_table,
  'scrape-web-sources' as edge_function,
  ss.is_enabled
FROM public.scrape_sources ss
LEFT JOIN public.ingestion_sources ingr ON ingr.slug = ss.slug
WHERE ingr.id IS NULL
ON CONFLICT (slug) DO NOTHING;

-- Clear stale FK error from gaycities-events and any others
UPDATE public.scrape_sources
SET consecutive_failures = 0, last_error = NULL
WHERE last_error LIKE '%import_jobs_enhanced%';
