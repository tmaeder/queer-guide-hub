-- ============================================================
-- Social media ingestion pipeline
-- ------------------------------------------------------------
-- Drains community_submissions where platform IN (telegram, tiktok,
-- bluesky, whatsapp, instagram, facebook, x, fetlife, signal,
-- admin) → media-process → safety/relevance → validate → dedup
-- → review-gate (always pending_review for social) → commit.
--
-- Triggered on-demand by connectors (Telegram worker, source-tiktok-url,
-- admin import). No cron — connectors enqueue runs as items arrive.
-- ============================================================

INSERT INTO public.pipeline_definitions
  (name, description, nodes, edges, schedule, is_template, is_enabled,
   max_concurrency, timeout_seconds)
VALUES (
  'social-media-ingestion',
  'Multi-channel social ingestion: Telegram, TikTok, admin imports → media OCR/vision/transcript → safety + LGBTQ+ relevance scoring → review queue → existing commit pipeline. Always routes through human review.',
  -- DAG order rationale:
  -- media-process and safety-relevance operate directly on community_submissions
  -- rows while status='pending'. Once src-social drains them into ingestion_staging
  -- it flips status='processing' which would hide them from the media/safety
  -- pickup queries. So media + safety run FIRST (parallel against community_submissions),
  -- THEN src-social stages enriched rows for the standard validate→dedup→review→commit
  -- chain.
  $$[
    {"id":"media","type":"pipeline-media-process","position":{"x":40,"y":100},
      "data":{"label":"Media: OCR / Vision / Transcript","config":{"batch_size":20}}},
    {"id":"safety","type":"pipeline-safety-relevance","position":{"x":280,"y":100},
      "data":{"label":"Safety + relevance","config":{"batch_size":20,"min_confidence":0.6}}},
    {"id":"src-social","type":"source-community-submissions","position":{"x":520,"y":100},
      "data":{"label":"Social inbox → staging","config":{"batchLimit":50,"platform_in":["telegram","tiktok","bluesky","whatsapp","instagram","facebook","x","fetlife","signal","admin","manual"],"require_relevance_score":true}}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":760,"y":100},
      "data":{"label":"Normalize","config":{"batch_size":50}}},
    {"id":"validate","type":"pipeline-validate","position":{"x":1000,"y":100},
      "data":{"label":"Validate","config":{}}},
    {"id":"dedup","type":"pipeline-deduplicate","position":{"x":1240,"y":100},
      "data":{"label":"Deduplicate","config":{"branch":"social","review_min":0.7,"auto_merge_min":0.95}}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1480,"y":100},
      "data":{"label":"Review (forced pending)","config":{"force_review":true}}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1720,"y":100},
      "data":{"label":"Commit (post-approval)","config":{"requires_approval":true}}}
  ]$$::jsonb,
  $$[
    {"id":"e1","source":"media","target":"safety"},
    {"id":"e2","source":"safety","target":"src-social"},
    {"id":"e3","source":"src-social","target":"normalize"},
    {"id":"e4","source":"normalize","target":"validate"},
    {"id":"e5","source":"validate","target":"dedup"},
    {"id":"e6","source":"dedup","target":"review"},
    {"id":"e7","source":"review","target":"commit"}
  ]$$::jsonb,
  NULL,        -- no cron; on-demand
  false,
  true,
  4,
  1800
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

-- Register node types so they appear in the Pipeline Builder palette
INSERT INTO public.pipeline_node_types (slug, category, display_name, description, edge_function, config_schema)
VALUES
  ('pipeline-media-process', 'processor', 'Media Process',
   'OCR, vision summary, and audio transcript extraction via Cloudflare Workers AI.',
   'pipeline-media-process',
   '{"type":"object","properties":{"batch_size":{"type":"integer","default":20}}}'::jsonb),
  ('pipeline-safety-relevance', 'processor', 'Safety + Relevance',
   'Scores LGBTQ+ relevance and flags content risks (nsfw, hate, privacy, etc.).',
   'pipeline-safety-relevance',
   '{"type":"object","properties":{"batch_size":{"type":"integer","default":20},"min_confidence":{"type":"number","default":0.6}}}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  category        = EXCLUDED.category,
  display_name    = EXCLUDED.display_name,
  description     = EXCLUDED.description,
  edge_function   = EXCLUDED.edge_function,
  config_schema   = EXCLUDED.config_schema,
  updated_at      = now();

-- Workflow definition + pg_cron schedule.
-- Drains the social inbox every 10 minutes. Connectors can also enqueue runs
-- explicitly via enqueue_workflow('social-media-ingestion', ...) for lower
-- latency on high-priority items.
INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload,
   schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds,
   is_enabled, priority, tags)
VALUES (
  'social-media-ingestion',
  'Social Media Ingestion',
  'Drain pending community_submissions from social platforms (Telegram, TikTok, admin, manual) through media OCR/vision + safety/relevance + review-gate.',
  'pipeline-executor',
  'scheduled_jobs',
  '{"action":"start","pipeline_name":"social-media-ingestion","triggered_by":"cron"}'::jsonb,
  '*/10 * * * *',
  2, 300, 1, 600, true, 4,
  ARRAY['social','ingestion','community']
)
ON CONFLICT (name) DO UPDATE SET
  edge_function   = EXCLUDED.edge_function,
  default_payload = EXCLUDED.default_payload,
  schedule        = EXCLUDED.schedule,
  is_enabled      = EXCLUDED.is_enabled,
  description     = EXCLUDED.description,
  tags            = EXCLUDED.tags;

DO $$ BEGIN
  PERFORM cron.unschedule('wf-social-media-ingestion')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-social-media-ingestion');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'wf-social-media-ingestion',
  '*/10 * * * *',
  $$SELECT public.enqueue_workflow('social-media-ingestion', '{"action":"start","pipeline_name":"social-media-ingestion","triggered_by":"cron"}'::jsonb)$$
);
