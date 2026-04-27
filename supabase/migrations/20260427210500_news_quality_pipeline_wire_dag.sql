-- Wire pipeline-sanitize-news + pipeline-quality-enhance into the news-ingestion DAG.
-- Companion to 20260427200000_news_quality_pipeline.sql — that one added schema,
-- this one threads the new edge functions into the active pipeline graph.
--
-- Idempotent: ON CONFLICT for node-type registration; targets the news-ingestion
-- definition by name (not id) so it works on any environment that has the
-- standard hardened news pipeline.
--
-- Already applied to prod (xqeacpakadqfxjxjcewc) on 2026-04-27 via Supabase MCP;
-- this file records the change for source-of-truth + replay on staging/CI.

-- 1. Register the two new node types
INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, edge_function, is_enabled, config_schema, input_ports, output_ports)
VALUES
  ('pipeline-sanitize-news', 'processor', 'Sanitize News',
   'Deterministic junk-phrase removal + truncation detection. Runs before AI enrichment. Idempotent.',
   'pipeline-sanitize-news', TRUE,
   '{}'::jsonb,
   '[{"id":"in","label":"In"}]'::jsonb,
   '[{"id":"out","label":"Out"}]'::jsonb),
  ('pipeline-quality-enhance', 'enricher', 'News Quality Enhance',
   'AI relevance + rewrite + entity-link review + image probe. Sets quality_status / publish gate.',
   'pipeline-quality-enhance', TRUE,
   '{}'::jsonb,
   '[{"id":"in","label":"In"}]'::jsonb,
   '[{"id":"out","label":"Out"}]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  edge_function = EXCLUDED.edge_function,
  is_enabled    = TRUE,
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  updated_at    = now();

-- 2. Rewire the active news-ingestion DAG.
-- Inserts `sanitize` between normalize and enrich, and `quality_enhance` between
-- enrich and validate. Bumps version, shifts downstream x positions.
UPDATE public.pipeline_definitions
   SET version    = version + 1,
       updated_at = now(),
       nodes = '[
  {"id":"source","type":"source-rss-news","data":{"label":"Fetch RSS/News","config":{"sinceHours":24,"entity_type":"news_articles","maxArticles":100,"use_eligibility_rpc":true},"nodeTypeSlug":"source-rss-news"},"position":{"x":50,"y":200}},
  {"id":"normalize","type":"pipeline-normalize","data":{"label":"Normalize","config":{"entity_type":"news_articles"},"nodeTypeSlug":"pipeline-normalize"},"position":{"x":260,"y":200}},
  {"id":"sanitize","type":"pipeline-sanitize-news","data":{"label":"Sanitize","config":{"batch_size":100},"nodeTypeSlug":"pipeline-sanitize-news"},"position":{"x":470,"y":200}},
  {"id":"enrich","type":"pipeline-enrich-news","data":{"label":"AI Enrich","config":{"max_per_run":25},"nodeTypeSlug":"pipeline-enrich-news"},"position":{"x":680,"y":200}},
  {"id":"quality_enhance","type":"pipeline-quality-enhance","data":{"label":"Quality Enhance","config":{"batch_size":10},"nodeTypeSlug":"pipeline-quality-enhance"},"position":{"x":890,"y":200}},
  {"id":"validate","type":"pipeline-validate","data":{"label":"Validate","config":{"entityType":"news_article","min_content_length":120,"reject_below_score":60},"nodeTypeSlug":"pipeline-validate"},"position":{"x":1100,"y":200}},
  {"id":"dedup","type":"pipeline-deduplicate","data":{"label":"Deduplicate","config":{"strategy":"fingerprint","review_min":0.75,"entity_type":"news_articles","auto_merge_min":0.9},"nodeTypeSlug":"pipeline-deduplicate"},"position":{"x":1310,"y":200}},
  {"id":"quality","type":"pipeline-quality-score","data":{"label":"Quality Score","config":{"min_pass":60,"entity_type":"news_article"},"nodeTypeSlug":"pipeline-quality-score"},"position":{"x":1520,"y":200}},
  {"id":"review","type":"pipeline-review-gate","data":{"label":"Review Gate","config":{"auto_approve_above":0.85},"nodeTypeSlug":"pipeline-review-gate"},"position":{"x":1730,"y":200}},
  {"id":"commit","type":"pipeline-commit","data":{"label":"Commit","config":{"use_rpc":"news_commit_staging_batch","entity_type":"news_articles"},"nodeTypeSlug":"pipeline-commit"},"position":{"x":1940,"y":200}}
]'::jsonb,
       edges = '[
  {"id":"e1","source":"source","target":"normalize"},
  {"id":"e2","source":"normalize","target":"sanitize"},
  {"id":"e2b","source":"sanitize","target":"enrich"},
  {"id":"e3","source":"enrich","target":"quality_enhance"},
  {"id":"e3b","source":"quality_enhance","target":"validate"},
  {"id":"e4","source":"validate","target":"dedup"},
  {"id":"e5","source":"dedup","target":"quality"},
  {"id":"e6","source":"quality","target":"review"},
  {"id":"e7","source":"review","target":"commit"}
]'::jsonb
 WHERE name = 'news-ingestion'
   -- Replay-safety: only rewrite if the new nodes aren't already wired in.
   AND NOT (nodes @> '[{"id":"sanitize"}]'::jsonb AND nodes @> '[{"id":"quality_enhance"}]'::jsonb);
