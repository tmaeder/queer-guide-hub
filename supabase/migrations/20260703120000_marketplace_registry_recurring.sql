-- ============================================================================
-- Marketplace registry-driven recurring ingestion
-- ----------------------------------------------------------------------------
-- The marketplace had ~46 vendors imported ONCE (ad-hoc source-shopify-public /
-- source-woocommerce-public calls) and never refreshed. The marketplace_merchants
-- registry was dormant (nothing read it; last_sync_* always NULL) and 40 vendors
-- with listings weren't even in it.
--
-- This migration makes the registry the live source of truth for a recurring
-- engine (edge fn marketplace-sync-merchants, added alongside this migration):
--   1. Seeds/upserts EVERY vendor into marketplace_merchants with detected
--      provider + storefront currency. slug == existing marketplace_listings
--      source_type so the commit RPC's (source_type, source_entity_id) refresh
--      path updates existing listings.
--   2. merchants_due_for_sync(limit) — oldest-first work-list selector.
--   3. Registers the marketplace-sync-merchants workflow + hourly cron.
--
-- Providers: shopify-public / woocommerce-public are enabled (public JSON feeds);
-- 'crawl' vendors (no public product API; some Cloudflare-protected) are seeded
-- is_enabled=false — tracked but skipped until a crawler is built (Phase 2).
-- ============================================================================

-- 1. Seed / reconcile the merchant registry ---------------------------------
INSERT INTO public.marketplace_merchants (provider, slug, display_name, shop_domain, config, is_enabled) VALUES
  ('shopify-public', 'abuniverse', 'ABUniverse', 'abuniverse.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'adamssceptre', 'Adam''s Sceptre', 'adamssceptre.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'androgynousfox', 'Androgynous Fox', 'androgynousfox.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'ashandchess', 'Ash + Chess', 'ashandchess.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'automicgold', 'Automic Gold', 'automicgold.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'autostraddle', 'For Them (Autostraddle)', 'shop.autostraddle.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'backroomgear', 'BackRoomGear', 'backroomgear.store', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'barcodeberlin', 'BARCODE Berlin', 'barcodeberlin.com', '{}'::jsonb, false),
  ('shopify-public', 'beefcakeswimwear', 'Beefcake Swimwear', 'beefcakeswimwear.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'bigbudpress', 'Big Bud Press', 'bigbudpress.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'breedwell', 'Breedwell', 'breedwell.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'carrara-designs', 'Carrara Designs', 'www.carrara-designs.com', '{}'::jsonb, false),
  ('shopify-public', 'cellblock13', 'CellBlock 13', 'cellblock13.net', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'charliebymz', 'Charlie by Matthew Zink', 'charliebymz.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'creamteamberlin', 'Cream Team Berlin', 'creamteamberlin.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'cuffed', 'Cuffed', 'cuffed.store', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'dapperboi', 'Dapper Boi', 'www.dapperboi.com', '{"currency":"USD"}'::jsonb, true),
  ('woocommerce-public', 'demask', 'DeMask', 'demask.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'effenberger', 'Effenberger Couture', 'effenberger-couture.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'fetchshop', 'Fetch Shop', 'fetchshop.co.uk', '{"currency":"GBP"}'::jsonb, true),
  ('shopify-public', 'flavnt', 'FLAVNT Streetwear', 'flavnt.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'forttroff', 'Fort Troff', 'forttroff.com', '{}'::jsonb, false),
  ('shopify-public', 'friend-of-dorothy', 'Friend of Dorothy', 'friend-of-dorothy.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'garconmodel', 'Garçon Model', 'garconmodel.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'gc2b', 'gc2b', 'gc2b.co', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'gfwclothing', 'GFW Clothing', 'gfwclothing.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'goodboyunderwear', 'Good Boy Underwear', 'goodboyunderwear.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'invinciblerubber', 'Invincible Rubber', 'www.invinciblerubber.com', '{}'::jsonb, false),
  ('shopify-public', 'kink3d', 'KINK3D', 'kink3d.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'kinkstar', 'Kinkstar', 'kinkstar.store', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'kirrinfinch', 'Kirrin Finch', 'kirrinfinch.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'latexas', 'Latexas', 'www.latexas.com', '{}'::jsonb, false),
  ('shopify-public', 'latexforever', 'Latex Forever', 'latexforever.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'lorandlajos', 'Lor & Lajos', 'lorandlajos.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'marekrichard', 'Marek+Richard', 'marekrichard.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'misterb', 'MisterB', 'misterb.com', '{}'::jsonb, false),
  ('shopify-public', 'mr-riegillio', 'MR. Riegillio', 'mr-riegillio.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'nastypig', 'Nasty Pig', 'nastypig.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'newyorktoycollective', 'New York Toy Collective', 'newyorktoycollective.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'nothosaur', 'Nothosaur', 'nothosaur.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'ohmyfantasy', 'OH MY! FANTASY', 'ohmyfantasy.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'origamicustoms', 'Origami Customs', 'origamicustoms.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'orttu', 'ORTTU', 'orttu.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'paxsies', 'Paxsies', 'paxsies.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'peaudeloup', 'Peau de Loup', 'peaudeloup.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'pridesocks', 'Pride Socks', 'pridesocks.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'provocateur', 'Provocateur', 'provocateur.shop', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'prowlerred', 'Prowler RED', 'prowlerred.com', '{"currency":"GBP"}'::jsonb, true),
  ('woocommerce-public', 'puppyplayexpert', 'Puppy Play Expert', 'puppyplayexpert.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'pvc-up', 'PVC-UP', 'pvc-up.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'regulation', 'Regulation', 'regulation.store', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'rodeoh', 'RodeoH', 'rodeoh.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'rubaddiction', 'Rubaddiction', 'www.rubaddiction.com', '{}'::jsonb, false),
  ('shopify-public', 'rubbertwunk', 'Rubber Twunk', 'rubbertwunk.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'rufskin', 'RUFSKIN', 'rufskin.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'ryvkstudio', 'RYVKstudio', 'ryvkstudio.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'spectrumoutfitters', 'Spectrum Outfitters', 'spectrumoutfitters.co.uk', '{"currency":"GBP"}'::jsonb, true),
  ('shopify-public', 'spitfireleather', 'Spitfire Leather', 'spitfireleather.com', '{"currency":"USD"}'::jsonb, true),
  ('crawl', 'steelwerksextreme', 'Steelwerks Extreme', 'www.steelwerksextreme.com', '{}'::jsonb, false),
  ('shopify-public', 'strappmetal', 'Strapp Metal', 'strappmetal.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'supergayunderwear', 'Super Gay Underwear', 'supergayunderwear.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'teamm8', 'Teamm8', 'teamm8.com', '{"currency":"AUD"}'::jsonb, true),
  ('shopify-public', 'tomboyx', 'TomboyX', 'tomboyx.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'twink-x', 'Twink-X', 'twink-x.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'untitledrubber', 'Untitled Rubber', 'untitledrubber.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'vilaingarcon', 'Vilain Garçon', 'vilaingarcon.com', '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'wegan', 'WeGan', 'wegan.eu', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'wetforher', 'Wet For Her', 'wetforher.com', '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'wildfang', 'Wildfang', 'wildfang.com', '{"currency":"USD"}'::jsonb, true)
ON CONFLICT (provider, slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  shop_domain  = EXCLUDED.shop_domain,
  config       = marketplace_merchants.config || EXCLUDED.config,
  is_enabled   = EXCLUDED.is_enabled,
  updated_at   = now();

-- 2. Work-list selector: enabled public-feed merchants, oldest sync first ----
CREATE OR REPLACE FUNCTION public.merchants_due_for_sync(p_limit int DEFAULT 6)
RETURNS TABLE (provider text, slug text, display_name text, shop_domain text, config jsonb)
LANGUAGE sql STABLE AS $$
  SELECT m.provider, m.slug, m.display_name, m.shop_domain, m.config
  FROM public.marketplace_merchants m
  WHERE m.is_enabled
    AND m.provider IN ('shopify-public', 'woocommerce-public')
    AND m.shop_domain IS NOT NULL
  ORDER BY m.last_sync_at ASC NULLS FIRST, m.created_at ASC
  LIMIT greatest(1, coalesce(p_limit, 6));
$$;

COMMENT ON FUNCTION public.merchants_due_for_sync(int) IS
  'Marketplace recurring sync work-list: enabled shopify/woo public-feed merchants, least-recently-synced first. Driven by edge fn marketplace-sync-merchants.';

-- 3. Register the driver workflow + node type + hourly cron ------------------
INSERT INTO public.pipeline_node_types (slug, display_name, edge_function, category, description, icon, color) VALUES
  ('marketplace-sync-merchants', 'Merchant Sync', 'marketplace-sync-merchants', 'source',
   'Registry-driven recurring vendor sync (fans out to shopify/woo public feeds)', 'RefreshCw', '#95bf47')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name, edge_function = EXCLUDED.edge_function,
  category = EXCLUDED.category, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color;

INSERT INTO public.workflow_definitions (name, display_name, description, edge_function, queue_name, default_payload, schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds, is_enabled, priority, tags) VALUES
  ('marketplace-sync-merchants', 'Marketplace Merchant Sync',
   'Recurring registry-driven vendor refresh: syncs the least-recently-synced enabled merchants via their public product feeds into ingestion_staging.',
   'marketplace-sync-merchants', 'scheduled_jobs', '{"limit":6}'::jsonb, '20 * * * *', 2, 120, 1, 300, true, 4, ARRAY['marketplace','ingestion','recurring'])
ON CONFLICT (name) DO UPDATE SET
  edge_function = EXCLUDED.edge_function, default_payload = EXCLUDED.default_payload,
  schedule = EXCLUDED.schedule, is_enabled = EXCLUDED.is_enabled,
  description = EXCLUDED.description, tags = EXCLUDED.tags;

DO $$ BEGIN
  PERFORM cron.unschedule('wf-marketplace-sync-merchants') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-marketplace-sync-merchants');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('wf-marketplace-sync-merchants', '20 * * * *',
  $$SELECT public.enqueue_workflow('marketplace-sync-merchants', '{"limit":6}'::jsonb)$$);
