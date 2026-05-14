-- Delete old disabled template pipeline definitions (no longer needed)
-- pipeline_runs history is preserved (pipeline_id is not FK-constrained)
DELETE FROM pipeline_definitions
WHERE is_template = true
  AND is_enabled = false
  AND name IN (
    'csv-upload-pipeline',
    'event-ingestion-unified',
    'event-scrape-pipeline',
    'news-ingestion-pipeline',
    'reference-data-pipeline',
    'venue-import-pipeline'
  );
