-- Hotel ingestion pipeline: visual DAG definition + node-type registrations.
-- Replays prod state applied via mcp on 2026-04-15.
-- Result: hotel-ingestion-pipeline appears in /admin/pipelines Builder tab
-- with 14 nodes, 16 edges, and is selected by default.

INSERT INTO public.pipeline_node_types (slug, category, display_name, description, icon, color, edge_function, config_schema, input_ports, output_ports, is_enabled)
VALUES
  ('source-airbnb', 'source', 'Airbnb (sitemap)',
   'Discover Airbnb listings from sub-sitemaps. Detail enrichment requires Playwright.',
   'Home', '#ff5a5f', 'source-airbnb',
   '{"type":"object","properties":{"limit":{"type":"integer","default":200},"sitemaps":{"type":"array","items":{"type":"string"},"description":"Uncompressed sub-sitemap URLs from sitemap-master-index.xml.gz"}},"required":["sitemaps"]}'::jsonb,
   '[]'::jsonb,
   '[{"id":"items","type":"venue","label":"Listings"}]'::jsonb,
   true),
  ('source-booking', 'source', 'Booking.com',
   'Demand API (when BOOKING_DEMAND_API_KEY set) or sitemap fallback.',
   'Bed', '#003580', 'source-booking',
   '{"type":"object","properties":{"limit":{"type":"integer","default":200},"sitemaps":{"type":"array","items":{"type":"string"},"description":"Sitemap fallback URLs"}}}'::jsonb,
   '[]'::jsonb,
   '[{"id":"items","type":"venue","label":"Hotels"}]'::jsonb,
   true),
  ('source-misterbnb', 'source', 'MisterB&B (sitemap)',
   'Sitemap discovery only; detail enrichment requires Playwright run.',
   'Hotel', '#ff385c', 'source-misterbnb',
   '{"type":"object","properties":{"limit":{"type":"integer","default":200},"cities":{"type":"array","items":{"type":"string"}}}}'::jsonb,
   '[]'::jsonb,
   '[{"id":"items","type":"venue","label":"Stays"}]'::jsonb,
   true),
  ('pipeline-dlq-consumer', 'control', 'DLQ Consumer',
   'Re-invokes failed pipeline stages with exponential backoff (1m/5m/30m/2h/12h).',
   'AlertTriangle', '#f59e0b', 'pipeline-dlq-consumer',
   '{"type":"object","properties":{"limit":{"type":"integer","default":50}}}'::jsonb,
   '[]'::jsonb,
   '[]'::jsonb,
   true)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  edge_function= EXCLUDED.edge_function,
  config_schema= EXCLUDED.config_schema,
  is_enabled   = true,
  updated_at   = now();

-- Helper to assemble node JSON with full metadata pulled from pipeline_node_types.
CREATE OR REPLACE FUNCTION pg_temp.mk_pipe_node(p_id TEXT, p_slug TEXT, p_label TEXT, p_x INT, p_y INT, p_config JSONB)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', p_id, 'type', 'baseNode',
    'position', jsonb_build_object('x', p_x, 'y', p_y),
    'data', jsonb_build_object(
      'label', p_label, 'icon', t.icon, 'color', t.color,
      'category', t.category, 'description', t.description,
      'nodeTypeSlug', t.slug, 'inputPorts', t.input_ports, 'outputPorts', t.output_ports,
      'config', p_config
    )
  )
  FROM public.pipeline_node_types t WHERE t.slug = p_slug;
$$;

WITH nodes_arr AS (
  SELECT jsonb_agg(node ORDER BY ord) AS nodes FROM (
    SELECT 1  AS ord, pg_temp.mk_pipe_node('src-google', 'source-google-places','Google Places (hotels)',  50, 50,  '{"limit":30,"mode":"hotels"}'::jsonb) AS node UNION ALL
    SELECT 2,         pg_temp.mk_pipe_node('src-fsq',    'source-foursquare',    'Foursquare (hotels)',     50, 150, '{"limit":30,"mode":"hotels"}'::jsonb) UNION ALL
    SELECT 3,         pg_temp.mk_pipe_node('src-sparta', 'source-spartacus',     'Spartacus Guide',         50, 250, '{}'::jsonb) UNION ALL
    SELECT 4,         pg_temp.mk_pipe_node('src-mister', 'source-misterbnb',     'MisterB&B (sitemap)',     50, 350, '{"limit":200}'::jsonb) UNION ALL
    SELECT 5,         pg_temp.mk_pipe_node('src-air',    'source-airbnb',        'Airbnb (sitemap)',        50, 450, '{"limit":200}'::jsonb) UNION ALL
    SELECT 6,         pg_temp.mk_pipe_node('src-book',   'source-booking',       'Booking.com',             50, 550, '{"limit":200}'::jsonb) UNION ALL
    SELECT 10,        pg_temp.mk_pipe_node('normalize',  'pipeline-normalize',   'Normalize (hotel-aware)', 300,300, '{"entityType":"venue","batch_size":100}'::jsonb) UNION ALL
    SELECT 11,        pg_temp.mk_pipe_node('validate',   'pipeline-validate',    'Validate (hotel rules)',  500,300, '{"entityType":"venue","batch_size":100}'::jsonb) UNION ALL
    SELECT 12,        pg_temp.mk_pipe_node('dedup',      'pipeline-deduplicate', 'Dedup (platform/url/addr)',700,300,'{"batch_size":100,"auto_merge_min":0.90,"review_min":0.75}'::jsonb) UNION ALL
    SELECT 13,        pg_temp.mk_pipe_node('geo',        'geo-linker',           'Geo-Link',                900,300, '{"contentType":"venues"}'::jsonb) UNION ALL
    SELECT 14,        pg_temp.mk_pipe_node('quality',    'quality-scorer',       'Quality Score',          1100,300, '{"entityType":"venue"}'::jsonb) UNION ALL
    SELECT 15,        pg_temp.mk_pipe_node('review',     'pipeline-review-gate', 'Review Gate',            1300,300, '{"minConfidence":0.85}'::jsonb) UNION ALL
    SELECT 16,        pg_temp.mk_pipe_node('commit',     'pipeline-commit',      'Commit (atomic upsert)', 1500,300, '{"targetTable":"venues","batch_size":200}'::jsonb) UNION ALL
    SELECT 20,        pg_temp.mk_pipe_node('dlq',        'pipeline-dlq-consumer','DLQ Consumer (retry)',    900,600, '{"limit":50}'::jsonb)
  ) s
),
edges_arr AS (
  SELECT jsonb_agg(jsonb_build_object('id','e-'||src||'-'||tgt,'source',src,'target',tgt,'animated',true,
    'label', CASE WHEN tgt='dlq' THEN 'on failure' ELSE NULL END,
    'style', CASE WHEN tgt='dlq' THEN jsonb_build_object('stroke','#f59e0b','strokeDasharray','5,5') ELSE NULL END
  ) ORDER BY ord) AS edges FROM (
    SELECT 1 ord,'src-google' src,'normalize' tgt UNION ALL
    SELECT 2,'src-fsq',   'normalize' UNION ALL
    SELECT 3,'src-sparta','normalize' UNION ALL
    SELECT 4,'src-mister','normalize' UNION ALL
    SELECT 5,'src-air',   'normalize' UNION ALL
    SELECT 6,'src-book',  'normalize' UNION ALL
    SELECT 7,'normalize', 'validate'  UNION ALL
    SELECT 8,'validate',  'dedup'     UNION ALL
    SELECT 9,'dedup',     'geo'       UNION ALL
    SELECT 10,'geo',      'quality'   UNION ALL
    SELECT 11,'quality',  'review'    UNION ALL
    SELECT 12,'review',   'commit'    UNION ALL
    SELECT 13,'normalize','dlq'       UNION ALL
    SELECT 14,'validate', 'dlq'       UNION ALL
    SELECT 15,'dedup',    'dlq'       UNION ALL
    SELECT 16,'commit',   'dlq'
  ) e
)
INSERT INTO public.pipeline_definitions (name, display_name, description, nodes, edges, default_context, max_concurrency, timeout_seconds, is_enabled)
SELECT 'hotel-ingestion-pipeline',
  'Hotel & B&B Ingestion (Bulletproof)',
  'End-to-end hotel/B&B pipeline. 6 sources → normalize (hotel-aware) → validate (booking_url, amenities, LGBTQ markers) → dedup (platform IDs, booking URL, address proximity) → geo-link → quality scoring → review-gate → atomic commit. Failed items at any stage land in DLQ for exponential-backoff retry (1m/5m/30m/2h/12h).',
  n.nodes, e.edges,
  '{"entityType":"venue","accommodation_focus":true}'::jsonb,
  3, 600, true
FROM nodes_arr n CROSS JOIN edges_arr e
ON CONFLICT (name) DO UPDATE SET
  display_name=EXCLUDED.display_name, description=EXCLUDED.description,
  nodes=EXCLUDED.nodes, edges=EXCLUDED.edges,
  default_context=EXCLUDED.default_context, updated_at=now();
