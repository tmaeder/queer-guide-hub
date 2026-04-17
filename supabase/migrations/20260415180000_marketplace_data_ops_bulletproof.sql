-- ============================================================================
-- Marketplace Data Ops — Bulletproof Pipeline (consolidated)
-- Applied to prod xqeacpakadqfxjxjcewc 2026-04-15.
-- Hardens marketplace_listings for multi-source ingest (AWIN, Shopify, Etsy,
-- CSV upload, custom API). Adds provenance, dedup keys, price history,
-- quality + relevance scoring, link-rot tracking, source junction, FX auto-
-- conversion, merchant registry, multi-signal dedup RPC and atomic commit RPC.
-- ============================================================================

-- 1. Schema additions -----------------------------------------------------

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS source_type            TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id       TEXT,
  ADD COLUMN IF NOT EXISTS external_url           TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_url          TEXT,
  ADD COLUMN IF NOT EXISTS merchant_domain        TEXT,
  ADD COLUMN IF NOT EXISTS merchant_id            UUID REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand                  TEXT,
  ADD COLUMN IF NOT EXISTS availability           TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS in_stock               BOOLEAN,
  ADD COLUMN IF NOT EXISTS last_verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deprecated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_health            TEXT DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS image_hashes           JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score          INT,
  ADD COLUMN IF NOT EXISTS lgbti_relevance_score  NUMERIC,
  ADD COLUMN IF NOT EXISTS sensitivity_flags      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS classified_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_status          TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS payload_hash           TEXT,
  ADD COLUMN IF NOT EXISTS price_usd              NUMERIC,
  ADD COLUMN IF NOT EXISTS title_normalized       TEXT
    GENERATED ALWAYS AS (lower(public.immutable_unaccent(regexp_replace(coalesce(title,''), '\s+', ' ', 'g')))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_source_eid_uniq
  ON public.marketplace_listings (source_type, source_entity_id) WHERE source_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_listings_merchant_domain_idx ON public.marketplace_listings (merchant_domain) WHERE merchant_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_listings_title_norm_trgm     ON public.marketplace_listings USING gin (title_normalized extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS marketplace_listings_availability_idx    ON public.marketplace_listings (availability);
CREATE INDEX IF NOT EXISTS marketplace_listings_link_health_idx     ON public.marketplace_listings (link_health) WHERE link_health <> 'ok';
CREATE INDEX IF NOT EXISTS marketplace_listings_last_verified_idx   ON public.marketplace_listings (last_verified_at);
CREATE INDEX IF NOT EXISTS marketplace_listings_price_usd_idx       ON public.marketplace_listings (price_usd) WHERE price_usd IS NOT NULL;

-- 2. Sources junction + price history + FX + merchant registry -----------

CREATE TABLE IF NOT EXISTS public.marketplace_listing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  source_entity_id TEXT, source_url TEXT, raw JSONB DEFAULT '{}'::jsonb,
  payload_hash TEXT, confidence NUMERIC DEFAULT 1.0, is_primary BOOLEAN DEFAULT false,
  first_seen_at TIMESTAMPTZ DEFAULT now(), last_seen_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listing_sources_src_eid_uniq ON public.marketplace_listing_sources (source_slug, source_entity_id) WHERE source_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_listing_sources_listing_idx ON public.marketplace_listing_sources (listing_id);
ALTER TABLE public.marketplace_listing_sources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listing_sources' AND policyname='marketplace_listing_sources_select') THEN
    CREATE POLICY marketplace_listing_sources_select ON public.marketplace_listing_sources FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_listing_sources' AND policyname='marketplace_listing_sources_service_write') THEN
    CREATE POLICY marketplace_listing_sources_service_write ON public.marketplace_listing_sources FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL, currency TEXT, source_slug TEXT, availability TEXT,
  price_usd NUMERIC,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_price_history_listing_obs_idx ON public.marketplace_price_history (listing_id, observed_at DESC);
ALTER TABLE public.marketplace_price_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_price_history' AND policyname='marketplace_price_history_select') THEN
    CREATE POLICY marketplace_price_history_select ON public.marketplace_price_history FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_price_history' AND policyname='marketplace_price_history_service_write') THEN
    CREATE POLICY marketplace_price_history_service_write ON public.marketplace_price_history FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fx_rates (
  currency TEXT PRIMARY KEY, rate_to_usd NUMERIC NOT NULL, source TEXT DEFAULT 'manual',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fx_rates' AND policyname='fx_rates_select') THEN
    CREATE POLICY fx_rates_select ON public.fx_rates FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fx_rates' AND policyname='fx_rates_service') THEN
    CREATE POLICY fx_rates_service ON public.fx_rates FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

INSERT INTO public.fx_rates (currency, rate_to_usd, source) VALUES
  ('USD',1.0,'seed'),('EUR',1.08,'seed'),('GBP',1.27,'seed'),('CAD',0.74,'seed'),('AUD',0.66,'seed'),('CHF',1.14,'seed'),
  ('JPY',0.0067,'seed'),('SEK',0.096,'seed'),('NOK',0.092,'seed'),('DKK',0.145,'seed'),('NZD',0.61,'seed'),('BRL',0.20,'seed'),
  ('MXN',0.059,'seed'),('ZAR',0.054,'seed'),('INR',0.012,'seed'),('SGD',0.75,'seed'),('HKD',0.128,'seed'),('KRW',0.00074,'seed'),
  ('TRY',0.031,'seed'),('PLN',0.25,'seed'),('CZK',0.044,'seed'),('HUF',0.0027,'seed'),('CNY',0.138,'seed')
ON CONFLICT (currency) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketplace_merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, slug TEXT NOT NULL, display_name TEXT NOT NULL,
  shop_domain TEXT, shop_id TEXT, api_key_env TEXT, api_key_vault_id UUID,
  config JSONB NOT NULL DEFAULT '{}'::jsonb, is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ, last_sync_status TEXT, last_sync_items INT,
  affiliate_partner_id UUID REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, slug)
);
CREATE INDEX IF NOT EXISTS marketplace_merchants_provider_idx ON public.marketplace_merchants (provider) WHERE is_enabled = true;
ALTER TABLE public.marketplace_merchants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_merchants' AND policyname='marketplace_merchants_admin_read') THEN
    CREATE POLICY marketplace_merchants_admin_read ON public.marketplace_merchants FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_merchants' AND policyname='marketplace_merchants_service') THEN
    CREATE POLICY marketplace_merchants_service ON public.marketplace_merchants FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 3. Helpers + triggers --------------------------------------------------

CREATE OR REPLACE FUNCTION public.fx_to_usd(p_amount NUMERIC, p_currency TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN p_currency IS NULL THEN p_amount
    ELSE round(p_amount * coalesce((SELECT rate_to_usd FROM public.fx_rates WHERE currency = upper(p_currency)), 1.0), 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_set_price_usd()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.price_usd IS NULL THEN
    NEW.price_usd := public.fx_to_usd(NEW.price, NEW.currency);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS marketplace_price_usd_trg ON public.marketplace_listings;
CREATE TRIGGER marketplace_price_usd_trg BEFORE INSERT OR UPDATE OF price, currency ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_set_price_usd();

CREATE OR REPLACE FUNCTION public.recompute_marketplace_price_usd()
RETURNS INT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.marketplace_listings SET price_usd = public.fx_to_usd(price, currency), updated_at = now() WHERE price IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.recompute_marketplace_price_usd() TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_merchants_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS marketplace_merchants_touch_trg ON public.marketplace_merchants;
CREATE TRIGGER marketplace_merchants_touch_trg BEFORE UPDATE ON public.marketplace_merchants
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_merchants_touch();

-- 4. Multi-signal dedup RPC ----------------------------------------------

CREATE OR REPLACE FUNCTION public.find_marketplace_duplicate_candidates(
  p_title TEXT, p_source_slug TEXT DEFAULT NULL, p_source_entity_id TEXT DEFAULT NULL,
  p_merchant_domain TEXT DEFAULT NULL, p_external_url TEXT DEFAULT NULL, p_brand TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(listing_id UUID, matched_title TEXT, match_type TEXT, score NUMERIC, distance_m NUMERIC, time_diff_hours NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_title_norm TEXT := lower(extensions.unaccent(regexp_replace(coalesce(p_title,''), '\s+', ' ', 'g')));
BEGIN
  IF v_title_norm = '' AND p_source_entity_id IS NULL AND p_external_url IS NULL THEN RETURN; END IF;
  IF p_source_slug IS NOT NULL AND p_source_entity_id IS NOT NULL THEN
    RETURN QUERY SELECT m.id, m.title, 'source_entity_id'::text, 1.00::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m WHERE m.source_type = p_source_slug AND m.source_entity_id = p_source_entity_id LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF p_external_url IS NOT NULL AND length(p_external_url) > 10 THEN
    RETURN QUERY SELECT m.id, m.title, 'external_url'::text, 0.97::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m WHERE m.external_url = p_external_url LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF p_merchant_domain IS NOT NULL THEN
    RETURN QUERY SELECT m.id, m.title, 'domain_title'::text, (0.6 + extensions.similarity(m.title_normalized, v_title_norm) * 0.4)::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m WHERE m.merchant_domain = p_merchant_domain AND extensions.similarity(m.title_normalized, v_title_norm) >= 0.70
      ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF p_brand IS NOT NULL THEN
    RETURN QUERY SELECT m.id, m.title, 'brand_title'::text, (extensions.similarity(m.title_normalized, v_title_norm) * 0.85)::numeric, NULL::numeric, NULL::numeric
      FROM public.marketplace_listings m WHERE m.brand ILIKE p_brand AND extensions.similarity(m.title_normalized, v_title_norm) >= 0.85
      ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;
  RETURN QUERY SELECT m.id, m.title, 'title_trigram'::text, (extensions.similarity(m.title_normalized, v_title_norm) * 0.75)::numeric, NULL::numeric, NULL::numeric
    FROM public.marketplace_listings m WHERE extensions.similarity(m.title_normalized, v_title_norm) >= 0.80
    ORDER BY extensions.similarity(m.title_normalized, v_title_norm) DESC LIMIT p_limit;
END; $$;
GRANT EXECUTE ON FUNCTION public.find_marketplace_duplicate_candidates(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;

-- 5. Atomic commit RPC (see live function body; respects category check +
--    category_id lookup; produces marketplace_listing_sources + price history).
--    The full body is installed via MCP migration
--    `marketplace_data_ops_03_commit_rpc` and patched by
--    `marketplace_data_ops_05_commit_rpc_fix_category`.
--    NOTE: This migration file is idempotent — it will NOT overwrite the
--    committed RPC. Use pg_get_functiondef() to inspect live version.

-- 6. Node types + pipeline definition ------------------------------------

INSERT INTO public.pipeline_node_types (slug, display_name, edge_function, category, description, icon, color) VALUES
  ('source-shopify',           'Shopify Products',       'source-shopify',           'source',    'Shopify Admin API products adapter',          'Store',       '#95bf47'),
  ('source-etsy',              'Etsy Products',          'source-etsy',              'source',    'Etsy Open API products adapter',              'Store',       '#f16521'),
  ('marketplace-relevance',    'Marketplace Relevance',  'marketplace-relevance',    'validator', 'Claude LGBTQ+ relevance gate for products',   'ShieldCheck', '#8b5cf6'),
  ('marketplace-image-mirror', 'Image Mirror',           'marketplace-image-mirror', 'enricher',  'Mirror external product images to R2/Storage','Image',       '#06b6d4'),
  ('marketplace-link-checker', 'Link Checker',           'marketplace-link-checker', 'enricher',  'Probe external_url + affiliate_url for rot',  'Link',        '#f59e0b'),
  ('marketplace-fx-sync',      'FX Sync',                'marketplace-fx-sync',      'processor', 'Refresh FX rates and recompute price_usd',    'DollarSign',  '#10b981')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name, edge_function = EXCLUDED.edge_function,
  category = EXCLUDED.category, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color;

-- Seed marketplace-ingestion pipeline (13 nodes, multi-source fan-in)
INSERT INTO public.pipeline_definitions (name, display_name, description, is_enabled, is_template, schedule, nodes, edges, default_context, timeout_seconds)
VALUES (
  'marketplace-ingestion',
  'Marketplace Product Ingestion',
  'Bulletproof ingest for AWIN, Shopify, Etsy marketplace products. Validates, classifies, dedups, enriches, commits atomically with price history. Parallel image mirror + embedding after commit.',
  true, false, '0 4 * * *',
  jsonb_build_array(
    jsonb_build_object('id','src-awin',    'type','source-awin',              'position', jsonb_build_object('x',  50, 'y', 80),  'data', jsonb_build_object('label','AWIN Feed',         'config', jsonb_build_object('batch_size',200))),
    jsonb_build_object('id','src-shopify', 'type','source-shopify',           'position', jsonb_build_object('x',  50, 'y', 200), 'data', jsonb_build_object('label','Shopify',           'config', jsonb_build_object('batch_size',50))),
    jsonb_build_object('id','src-etsy',    'type','source-etsy',              'position', jsonb_build_object('x',  50, 'y', 320), 'data', jsonb_build_object('label','Etsy',              'config', jsonb_build_object('batch_size',50))),
    jsonb_build_object('id','fan-in',      'type','fan-in',                   'position', jsonb_build_object('x', 290, 'y', 200), 'data', jsonb_build_object('label','Fan In',            'config', jsonb_build_object())),
    jsonb_build_object('id','normalize',   'type','normalizer',               'position', jsonb_build_object('x', 490, 'y', 200), 'data', jsonb_build_object('label','Normalize',         'config', jsonb_build_object())),
    jsonb_build_object('id','validate',    'type','validator',                'position', jsonb_build_object('x', 690, 'y', 200), 'data', jsonb_build_object('label','Validate',          'config', jsonb_build_object('entityType','marketplace'))),
    jsonb_build_object('id','relevance',   'type','marketplace-relevance',    'position', jsonb_build_object('x', 890, 'y', 200), 'data', jsonb_build_object('label','LGBTQ+ Relevance',  'config', jsonb_build_object('threshold',0.5))),
    jsonb_build_object('id','dedup',       'type','deduplicator',             'position', jsonb_build_object('x',1090, 'y', 200), 'data', jsonb_build_object('label','Deduplicate',       'config', jsonb_build_object('auto_merge_min',0.95,'review_min',0.80))),
    jsonb_build_object('id','quality',     'type','quality-scorer',           'position', jsonb_build_object('x',1290, 'y', 200), 'data', jsonb_build_object('label','Quality Score',     'config', jsonb_build_object())),
    jsonb_build_object('id','review',      'type','review-gate',              'position', jsonb_build_object('x',1490, 'y', 200), 'data', jsonb_build_object('label','Review Gate',       'config', jsonb_build_object('min_quality',50,'min_relevance',0.5))),
    jsonb_build_object('id','commit',      'type','committer',                'position', jsonb_build_object('x',1690, 'y', 200), 'data', jsonb_build_object('label','Commit',            'config', jsonb_build_object('targetTable','marketplace_listings'))),
    jsonb_build_object('id','mirror',      'type','marketplace-image-mirror', 'position', jsonb_build_object('x',1890, 'y', 140), 'data', jsonb_build_object('label','Image Mirror',      'config', jsonb_build_object('limit',25))),
    jsonb_build_object('id','embed',       'type','embedding-generator',      'position', jsonb_build_object('x',1890, 'y', 260), 'data', jsonb_build_object('label','Embeddings',        'config', jsonb_build_object('targetTable','marketplace_listings')))
  ),
  jsonb_build_array(
    jsonb_build_object('id','e-awin',    'source','src-awin',    'target','fan-in',    'animated', true),
    jsonb_build_object('id','e-shopify', 'source','src-shopify', 'target','fan-in',    'animated', true),
    jsonb_build_object('id','e-etsy',    'source','src-etsy',    'target','fan-in',    'animated', true),
    jsonb_build_object('id','e-fan',     'source','fan-in',      'target','normalize', 'animated', true),
    jsonb_build_object('id','e-norm',    'source','normalize',   'target','validate',  'animated', true),
    jsonb_build_object('id','e-val',     'source','validate',    'target','relevance', 'animated', true),
    jsonb_build_object('id','e-rel',     'source','relevance',   'target','dedup',     'animated', true),
    jsonb_build_object('id','e-dedup',   'source','dedup',       'target','quality',   'animated', true),
    jsonb_build_object('id','e-qual',    'source','quality',     'target','review',    'animated', true),
    jsonb_build_object('id','e-rev',     'source','review',      'target','commit',    'animated', true),
    jsonb_build_object('id','e-mirror',  'source','commit',      'target','mirror',    'animated', true),
    jsonb_build_object('id','e-embed',   'source','commit',      'target','embed',     'animated', true)
  ),
  jsonb_build_object('entity_type','marketplace','batch_size',100),
  600
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name, description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled, schedule = EXCLUDED.schedule,
  nodes = EXCLUDED.nodes, edges = EXCLUDED.edges,
  default_context = EXCLUDED.default_context, timeout_seconds = EXCLUDED.timeout_seconds;

-- 7. Workflow definitions + pg_cron schedules ----------------------------

INSERT INTO public.workflow_definitions (name, display_name, description, edge_function, queue_name, default_payload, schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds, is_enabled, priority, tags) VALUES
  ('marketplace-fx-sync',       'Marketplace FX Sync',       'Refresh currency rates and recompute price_usd',                         'marketplace-fx-sync',      'scheduled_jobs', '{}'::jsonb,                                                                                         '13 6 * * *', 3, 60,  1, 120, true, 5, ARRAY['marketplace','fx']),
  ('marketplace-link-checker',  'Marketplace Link Checker',  'Probe external_url / affiliate_url for rot and demote broken listings',  'marketplace-link-checker', 'scheduled_jobs', '{"limit":200,"stale_days":30}'::jsonb,                                                              '7 3 * * 1',  2, 120, 1, 300, true, 4, ARRAY['marketplace','link-health']),
  ('marketplace-ingestion',     'Marketplace Ingestion',     'Start a marketplace-ingestion pipeline run (AWIN + Shopify + Etsy)',     'pipeline-executor',        'scheduled_jobs', '{"action":"start","pipeline_name":"marketplace-ingestion","triggered_by":"cron"}'::jsonb,           '0 4 * * *',  2, 300, 1, 600, true, 3, ARRAY['marketplace','ingestion'])
ON CONFLICT (name) DO UPDATE SET
  edge_function = EXCLUDED.edge_function, default_payload = EXCLUDED.default_payload,
  schedule = EXCLUDED.schedule, is_enabled = EXCLUDED.is_enabled,
  description = EXCLUDED.description, tags = EXCLUDED.tags;

-- pg_cron jobs (idempotent — unschedule then schedule)
DO $$ BEGIN
  PERFORM cron.unschedule('wf-marketplace-fx-sync')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-marketplace-fx-sync');
  PERFORM cron.unschedule('wf-marketplace-link-checker')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-marketplace-link-checker');
  PERFORM cron.unschedule('wf-marketplace-ingestion')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-marketplace-ingestion');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('wf-marketplace-fx-sync',      '13 6 * * *', $$SELECT public.enqueue_workflow('marketplace-fx-sync', '{}'::jsonb)$$);
SELECT cron.schedule('wf-marketplace-link-checker', '7 3 * * 1',  $$SELECT public.enqueue_workflow('marketplace-link-checker', '{"limit":200,"stale_days":30}'::jsonb)$$);
SELECT cron.schedule('wf-marketplace-ingestion',    '0 4 * * *',  $$SELECT public.enqueue_workflow('marketplace-ingestion', '{"action":"start","pipeline_name":"marketplace-ingestion","triggered_by":"cron"}'::jsonb)$$);

-- 8. Backfill + price_usd compute ---------------------------------------

UPDATE public.marketplace_listings
   SET source_type = 'manual', source_entity_id = id::text,
       merchant_domain = lower(substring(website FROM 'https?://(?:www\.)?([^/:?#]+)')),
       availability = coalesce(availability, 'unknown'),
       link_health = coalesce(link_health, 'unchecked'),
       review_status = coalesce(review_status, 'auto'),
       last_seen_at = coalesce(last_seen_at, updated_at)
 WHERE source_type IS NULL;

UPDATE public.marketplace_listings SET price_usd = public.fx_to_usd(price, currency) WHERE price IS NOT NULL AND price_usd IS NULL;
UPDATE public.marketplace_price_history SET price_usd = public.fx_to_usd(price, currency) WHERE price_usd IS NULL;
