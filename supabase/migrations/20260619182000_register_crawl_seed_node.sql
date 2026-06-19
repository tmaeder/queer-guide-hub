-- Phase 3 — register the source-crawl-seed node type.
-- Given a seed URL, discovers same-origin links via the extract worker and stages
-- each candidate page (cleaned markdown + title + metadata) for the standard
-- pipeline. Companion edge function: supabase/functions/source-crawl-seed.

INSERT INTO public.pipeline_node_types
  (slug, category, display_name, description, edge_function, is_enabled, config_schema, input_ports, output_ports)
VALUES
  ('source-crawl-seed', 'source', 'Crawl Seed',
   'Discovers same-origin links from a seed URL (depth-1) and stages each page (markdown + title + metadata) for the pipeline. Config: seed_url, target_table, entity_type, max_candidates, path_prefix, render.',
   'source-crawl-seed', TRUE,
   '{"seed_url":"","target_table":"news_articles","entity_type":"news_article","max_candidates":25}'::jsonb,
   '[]'::jsonb,
   '[{"id":"out","label":"Out"}]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  edge_function = EXCLUDED.edge_function,
  is_enabled    = TRUE,
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  updated_at    = now();
