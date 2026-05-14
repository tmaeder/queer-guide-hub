-- Country Ingestion v2
-- Rebuilds a canonical country-ingestion pipeline (REST Countries → normalize
-- → validate → dedupe → commit), schedules it weekly. Public API, no
-- credentials needed, so this should never fail on creds.

-- Register source-rest-countries node type so pipeline-executor can resolve it.
INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, icon, color, edge_function, is_enabled)
VALUES
  ('source-rest-countries', 'source', 'REST Countries',
   'Public REST Countries API adapter (no credentials required)',
   'Globe', '#0ea5e9', 'source-rest-countries', true)
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
  'country-ingestion',
  'Weekly REST Countries sync → normalize → validate → dedupe → commit. '
  || 'Public API, no credentials.',
  $$[
    {"id":"src-rc",    "type":"source-rest-countries","position":{"x":40,"y":40},  "data":{"label":"REST Countries","config":{"entity_type":"country","batch_size":250}}},
    {"id":"normalize", "type":"pipeline-normalize",   "position":{"x":320,"y":40}, "data":{"label":"Normalize","config":{"entityType":"country","batch_size":250}}},
    {"id":"validate",  "type":"pipeline-validate",    "position":{"x":580,"y":40}, "data":{"label":"Validate","config":{"entityType":"country"}}},
    {"id":"dedupe",    "type":"pipeline-deduplicate", "position":{"x":840,"y":40}, "data":{"label":"Deduplicate","config":{"auto_merge_min":0.95,"review_min":0.85,"batch_size":250}}},
    {"id":"commit",    "type":"pipeline-commit",      "position":{"x":1100,"y":40},"data":{"label":"Commit","config":{"targetTable":"countries","strategy":"upsert","conflictKey":"code"}}}
  ]$$::jsonb,
  $$[
    {"id":"e1","source":"src-rc",   "target":"normalize"},
    {"id":"e2","source":"normalize","target":"validate"},
    {"id":"e3","source":"validate", "target":"dedupe"},
    {"id":"e4","source":"dedupe",   "target":"commit"}
  ]$$::jsonb,
  '0 3 * * 0',      -- Sunday 03:00 UTC
  false,            -- not a template
  true,             -- enabled
  1,                -- singleton
  600               -- 10 min
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  nodes       = EXCLUDED.nodes,
  edges       = EXCLUDED.edges,
  schedule    = EXCLUDED.schedule,
  is_template = EXCLUDED.is_template,
  is_enabled  = EXCLUDED.is_enabled,
  max_concurrency  = EXCLUDED.max_concurrency,
  timeout_seconds  = EXCLUDED.timeout_seconds,
  updated_at  = now();

-- Schedule a pg_cron job that dispatches the pipeline via workflow-dispatcher.
-- Job name matches the "wf-*" convention used by existing pipelines.
DO $$
BEGIN
  PERFORM cron.unschedule('wf-country-ingestion')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wf-country-ingestion');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Dispatch weekly via pgmq → workflow-dispatcher. Use the same payload shape
-- other wf-* jobs use (pipeline name + triggered_by=cron).
SELECT cron.schedule(
  'wf-country-ingestion',
  '0 3 * * 0',
  $cron$
    SELECT pgmq.send(
      'scheduled_jobs',
      jsonb_build_object(
        'workflow',     'country-ingestion',
        'pipeline',     'country-ingestion',
        'triggered_by', 'cron',
        'scheduled_at', now()
      )
    );
  $cron$
);

-- Retire the orphan "import-rest-countries-daily" workflow if present.
-- It has 0 runs historically (no pg_cron job was ever created for it).
UPDATE public.workflow_definitions
SET is_enabled = false,
    description = COALESCE(description, '') ||
      E'\n[2026-04-21] Superseded by country-ingestion pipeline ' ||
      '(weekly cron wf-country-ingestion).',
    updated_at = now()
WHERE name = 'import-rest-countries-daily';
