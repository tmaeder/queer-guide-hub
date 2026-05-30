-- P0 — News full-text extraction node.
-- Inserts `pipeline-extract-fulltext` between normalize and sanitize in the
-- news-ingestion DAG. RSS feeds deliver truncated stubs; this node fetches the
-- source URL and recovers the full article body + metadata, so every downstream
-- stage (sanitize, AI enrich, quality-enhance, validate, score) reasons over
-- full text. Idempotent + replay-safe.
--
-- Companion edge function: supabase/functions/pipeline-extract-fulltext
-- Roadmap: docs/plans / "News Data Quality — Closed-Loop Intelligence" (Pillar 1).

-- 1. Register the node type.
INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, edge_function, is_enabled, config_schema, input_ports, output_ports)
VALUES
  ('pipeline-extract-fulltext', 'processor', 'Extract Full Text',
   'Fetches the source URL and recovers full article body + author/date/image/lang that RSS truncates. Runs before sanitize. Idempotent, never blanks on failure.',
   'pipeline-extract-fulltext', TRUE,
   '{}'::jsonb,
   '[{"id":"in","label":"In"}]'::jsonb,
   '[{"id":"out","label":"Out"}]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  edge_function = EXCLUDED.edge_function,
  is_enabled    = TRUE,
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  updated_at    = now();

-- 2. Rewire the active news-ingestion DAG: source → normalize → EXTRACT → sanitize → …
--    Shifts sanitize and everything downstream one slot right (x += 210).
UPDATE public.pipeline_definitions
   SET version    = version + 1,
       updated_at = now(),
       nodes = '[
  {"id":"source","type":"source-rss-news","data":{"label":"Fetch RSS/News","config":{"sinceHours":24,"entity_type":"news_articles","maxArticles":100,"use_eligibility_rpc":true},"nodeTypeSlug":"source-rss-news"},"position":{"x":50,"y":200}},
  {"id":"normalize","type":"pipeline-normalize","data":{"label":"Normalize","config":{"entity_type":"news_articles"},"nodeTypeSlug":"pipeline-normalize"},"position":{"x":260,"y":200}},
  {"id":"extract","type":"pipeline-extract-fulltext","data":{"label":"Extract Full Text","config":{"batch_size":15},"nodeTypeSlug":"pipeline-extract-fulltext"},"position":{"x":470,"y":200}},
  {"id":"sanitize","type":"pipeline-sanitize-news","data":{"label":"Sanitize","config":{"batch_size":100},"nodeTypeSlug":"pipeline-sanitize-news"},"position":{"x":680,"y":200}},
  {"id":"enrich","type":"pipeline-enrich-news","data":{"label":"AI Enrich","config":{"max_per_run":25},"nodeTypeSlug":"pipeline-enrich-news"},"position":{"x":890,"y":200}},
  {"id":"quality_enhance","type":"pipeline-quality-enhance","data":{"label":"Quality Enhance","config":{"batch_size":10},"nodeTypeSlug":"pipeline-quality-enhance"},"position":{"x":1100,"y":200}},
  {"id":"validate","type":"pipeline-validate","data":{"label":"Validate","config":{"entityType":"news_article","min_content_length":120,"reject_below_score":60},"nodeTypeSlug":"pipeline-validate"},"position":{"x":1310,"y":200}},
  {"id":"dedup","type":"pipeline-deduplicate","data":{"label":"Deduplicate","config":{"strategy":"fingerprint","review_min":0.75,"entity_type":"news_articles","auto_merge_min":0.9},"nodeTypeSlug":"pipeline-deduplicate"},"position":{"x":1520,"y":200}},
  {"id":"quality","type":"pipeline-quality-score","data":{"label":"Quality Score","config":{"min_pass":60,"entity_type":"news_article"},"nodeTypeSlug":"pipeline-quality-score"},"position":{"x":1730,"y":200}},
  {"id":"review","type":"pipeline-review-gate","data":{"label":"Review Gate","config":{"auto_approve_above":0.85},"nodeTypeSlug":"pipeline-review-gate"},"position":{"x":1940,"y":200}},
  {"id":"commit","type":"pipeline-commit","data":{"label":"Commit","config":{"use_rpc":"news_commit_staging_batch","entity_type":"news_articles"},"nodeTypeSlug":"pipeline-commit"},"position":{"x":2150,"y":200}}
]'::jsonb,
       edges = '[
  {"id":"e1","source":"source","target":"normalize"},
  {"id":"e1b","source":"normalize","target":"extract"},
  {"id":"e2","source":"extract","target":"sanitize"},
  {"id":"e2b","source":"sanitize","target":"enrich"},
  {"id":"e3","source":"enrich","target":"quality_enhance"},
  {"id":"e3b","source":"quality_enhance","target":"validate"},
  {"id":"e4","source":"validate","target":"dedup"},
  {"id":"e5","source":"dedup","target":"quality"},
  {"id":"e6","source":"quality","target":"review"},
  {"id":"e7","source":"review","target":"commit"}
]'::jsonb
 WHERE name = 'news-ingestion'
   -- Replay-safety: only rewrite if the extract node isn't already wired in.
   AND NOT (nodes @> '[{"id":"extract"}]'::jsonb);
