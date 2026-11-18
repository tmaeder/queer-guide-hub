-- Enabled after parser/corpus, transactional and live nine-node pilot checks passed.
UPDATE public.ingestion_sources SET is_enabled=true,updated_at=now() WHERE slug='lavenderatlas';
UPDATE public.pipeline_definitions SET is_enabled=true,updated_at=now() WHERE name='lavenderatlas-weekly-sync';
UPDATE public.admin_automations SET enabled=true WHERE slug IN ('lavenderatlas_weekly_sync','lavenderatlas_pipeline_recovery');
SELECT public.sync_automations_to_cron(true);
