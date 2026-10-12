-- GARÇON is Magento with Product microdata, not a Shopify public feed.
UPDATE public.marketplace_merchants SET provider='crawl',
config=config || '{"strategy":"microdata","sitemap":"https://garconmodel.com/sitemap.xml","url_include":"^https://garconmodel[.]com/(underwear|swimwear|activewear|harness)/[^/?]+$","business_name":"GARÇON","brand_name":"GARÇON","category":"Apparel","product_type":"Underwear","subcategory":"Underwear","concurrency":1,"crawl_delay_ms":500,"lookahead":10}'::jsonb
WHERE slug='garconmodel';

-- The original domain redirects our region to the European store. Its
-- Storefront API returns EUR even with US context; use the verified EUR market.
UPDATE public.marketplace_merchants SET config=config ||
'{"storefront_domain":"eu.abuniverse.com","currency":"EUR","market_country":"DE"}'::jsonb
WHERE slug='abuniverse';
