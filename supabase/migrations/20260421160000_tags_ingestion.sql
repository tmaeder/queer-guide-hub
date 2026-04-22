-- Tags Ingestion Pipeline
-- Weekly pipeline: extracts tags from venues/events/personalities
-- → normalize → validate → deduplicate → commit to unified_tags

INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, icon, color, edge_function, is_enabled)
VALUES
  ('source-tags-extract', 'source', 'Tags Extract',
   'Extracts unique tags from existing venues, events, and personalities',
   'Tag', '#8b5cf6', 'source-tags-extract', true),
  ('source-csv-upload', 'source', 'CSV Upload',
   'Generic CSV file upload adapter for all entity types',
   'Upload', '#6366f1', 'source-csv-upload', true)
ON CONFLICT (slug) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  edge_function = EXCLUDED.edge_function,
  category      = EXCLUDED.category,
  icon          = EXCLUDED.icon,
  color         = EXCLUDED.color,
  is_enabled    = EXCLUDED.is_enabled;

INSERT INTO public.pipeline_definitions
  (name, description, nodes, edges, schedule, is_template, is_enabled,
   max_concurrency, timeout_seconds)
VALUES (
  'tags-ingestion',
  'Weekly tags sync: extract from venues/events → normalize → validate → dedupe → commit to unified_tags.',
  $$[
    {"id":"src-extract","type":"source-tags-extract","position":{"x":40,"y":40},  "data":{"label":"Extract Tags","config":{"entity_type":"tag","batch_size":500}}},
    {"id":"src-csv",    "type":"source-csv-upload",  "position":{"x":40,"y":160}, "data":{"label":"CSV Upload",  "config":{"entity_type":"tag","batch_size":500}}},
    {"id":"normalize",  "type":"pipeline-normalize",  "position":{"x":320,"y":100},"data":{"label":"Normalize",   "config":{"entityType":"tag","batch_size":500}}},
    {"id":"validate",   "type":"pipeline-validate",   "position":{"x":580,"y":100},"data":{"label":"Validate",    "config":{"entityType":"tag"}}},
    {"id":"dedupe",     "type":"pipeline-deduplicate","position":{"x":840,"y":100},"data":{"label":"Deduplicate", "config":{"auto_merge_min":0.95,"review_min":0.85,"batch_size":500}}},
    {"id":"commit",     "type":"pipeline-commit",     "position":{"x":1100,"y":100},"data":{"label":"Commit",     "config":{"targetTable":"unified_tags","strategy":"upsert","conflictKey":"slug"}}}
  ]$$::jsonb,
  $$[
    {"id":"e1","source":"src-extract","target":"normalize"},
    {"id":"e2","source":"src-csv",    "target":"normalize"},
    {"id":"e3","source":"normalize",  "target":"validate"},
    {"id":"e4","source":"validate",   "target":"dedupe"},
    {"id":"e5","source":"dedupe",     "target":"commit"}
  ]$$::jsonb,
  '0 5 * * 0',  -- Sunday 05:00 UTC
  false,
  true,
  1,
  900
)
ON CONFLICT (name) DO UPDATE SET
  description     = EXCLUDED.description,
  nodes           = EXCLUDED.nodes,
  edges           = EXCLUDED.edges,
  schedule        = EXCLUDED.schedule,
  is_template     = EXCLUDED.is_template,
  is_enabled      = EXCLUDED.is_enabled,
  max_concurrency = EXCLUDED.max_concurrency,
  timeout_seconds = EXCLUDED.timeout_seconds,
  updated_at      = now();

-- Schedule weekly pg_cron
DO $$
BEGIN
  PERFORM cron.unschedule('pipeline-tags-ingestion')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pipeline-tags-ingestion');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'pipeline-tags-ingestion',
  '0 5 * * 0',
  $cron$
    SELECT pgmq.send(
      'pipeline_steps',
      jsonb_build_object(
        'workflow',       'pipeline-executor',
        'action',         'start',
        'pipeline_name',  'tags-ingestion',
        'triggered_by',   'cron'
      )
    );
  $cron$
);
