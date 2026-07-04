-- ============================================================================
-- Register 6 more marketplace vendors (batch 2)
-- ----------------------------------------------------------------------------
-- Adds these owner-requested storefronts to the marketplace_merchants registry
-- so the recurring engine (marketplace-sync-merchants hourly driver + staging
-- drain) keeps them synced. Products flow through the LGBTQ+ relevance gate
-- (owner chose relevance-gated for this batch, given the large mainstream
-- catalogs), so only queer-relevant items go live.
--
-- Providers/currency detected via public probes (products.json + cart.json):
-- all Shopify public feeds. ontracks.studio returns 403 to automated fetches
-- (bot-protected, like latexas/steelwerks) → registered as `crawl` disabled,
-- deferred until a crawler exists.
--
-- slug == the source_type stamped on staging/listings so refresh + dedup match.
-- ============================================================================

INSERT INTO public.marketplace_merchants (provider, slug, display_name, shop_domain, config, is_enabled) VALUES
  ('shopify-public', 'dernholt',          'Dernholt',        'dernholt.com',               '{"currency":"SEK"}'::jsonb, true),
  ('shopify-public', 'nattaup',           'Natta Up',        'nattaup.com',                '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'rsscsports',        'RSSC Sports',     'rsscsports.com',             '{"currency":"USD"}'::jsonb, true),
  ('shopify-public', 'dfranklincreation', 'D. Franklin',     'www.dfranklincreation.com',  '{"currency":"EUR"}'::jsonb, true),
  ('shopify-public', 'cherrykitten',      'Cherry Kitten',   'www.cherrykitten.com',       '{"currency":"USD"}'::jsonb, true),
  ('crawl',          'ontracks',          'OnTracks Studio', 'ontracks.studio',            '{}'::jsonb,                 false)
ON CONFLICT (provider, slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  shop_domain  = EXCLUDED.shop_domain,
  config       = marketplace_merchants.config || EXCLUDED.config,
  is_enabled   = EXCLUDED.is_enabled,
  updated_at   = now();
