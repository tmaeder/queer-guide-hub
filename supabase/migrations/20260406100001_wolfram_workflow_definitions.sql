-- Register Wolfram Alpha enrichment workflows (one per content type)

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name,
   default_payload, max_retries, retry_backoff_base, max_concurrency,
   timeout_seconds, is_enabled, priority, tags)
VALUES
  ('enrich-wolfram-countries', 'Enrich Countries (Wolfram)',
   'Fill empty country fields (GDP, HDI, life expectancy, etc.) from Wolfram Alpha',
   'enrich-wolfram', 'import_jobs',
   '{"content_type": "country", "limit": 20}'::jsonb,
   3, 60, 1, 300, true, 5, ARRAY['enrichment', 'wolfram']),

  ('enrich-wolfram-cities', 'Enrich Cities (Wolfram)',
   'Fill empty city fields (area, elevation, climate) from Wolfram Alpha',
   'enrich-wolfram', 'import_jobs',
   '{"content_type": "city", "limit": 30}'::jsonb,
   3, 60, 1, 300, true, 5, ARRAY['enrichment', 'wolfram']),

  ('enrich-wolfram-tags', 'Enrich Tags (Wolfram)',
   'Add scientific definitions to health/science tags from Wolfram Alpha',
   'enrich-wolfram', 'import_jobs',
   '{"content_type": "tag", "limit": 30}'::jsonb,
   3, 60, 1, 300, true, 5, ARRAY['enrichment', 'wolfram'])
ON CONFLICT (name) DO NOTHING;
