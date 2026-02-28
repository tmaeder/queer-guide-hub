-- ============================================================
-- Seed scrape_sources with all target websites
-- Applied: 2026-02-28
-- ============================================================

INSERT INTO public.scrape_sources
  (slug, name, url, content_type, target_table, scrape_method, scrape_config, schedule_interval_hours, priority, rate_limit_ms, max_pages_per_run)
VALUES
  -- ═══════════════════════════════════════════════════════════
  -- PRODUCT SHOPS (→ marketplace_products)
  -- ═══════════════════════════════════════════════════════════
  ('mr-s-leather', 'Mr. S Leather', 'https://www.mr-s-leather.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/products/*", "/collections/*"], "extract": "products", "selectors": {"name": "h1.product-title", "price": ".product-price", "image": ".product-image img", "description": ".product-description"}}',
   168, 5, 3000, 500),

  ('addicted-es', 'Addicted', 'https://addicted.es',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/*/products/*", "/*/collections/*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('supergay-underwear', 'Super Gay Underwear', 'https://supergayunderwear.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('regulation-store', 'Regulation', 'https://regulation.store',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('es-collection', 'ES Collection', 'https://escollection.es',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/*/products/*", "/*/collections/*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('unapologaytic', 'Unapologaytic', 'https://unapologaytic.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 200, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 200),

  ('tomboyx', 'TomboyX', 'https://tomboyx.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('joy-lgbt', 'JOY LGBT', 'https://www.joylgbt.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 200, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 200),

  ('gay-pride-apparel', 'Gay Pride Apparel', 'https://gayprideapparel.com/en-in',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('amorana-ch', 'Amorana', 'https://www.amorana.ch/en/',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/en/products/*", "/en/*/products/*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('lelo', 'LELO', 'https://www.lelo.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/*/*-massager*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('dildoking', 'Dildoking', 'https://dildoking.de/de/',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/de/*/", "/de/produkt/*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('shebop-shop', 'She Bop', 'https://www.sheboptheshop.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('early2bed', 'Early to Bed', 'https://www.early2bed.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('boyzshop', 'Boyzshop', 'https://www.boyzshop.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/products/*", "/collections/*", "/*-p-*"], "extract": "products"}',
   168, 5, 3000, 500),

  ('extreme-restraints', 'Extreme Restraints', 'https://www.extremerestraints.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 500, "include_paths": ["/products/*", "/*/"], "extract": "products"}',
   168, 5, 3000, 500),

  ('boneyard-toys', 'Boneyard Toys', 'https://boneyardtoys.com/collections/new-1',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 200, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 200),

  ('higher-desire', 'Higher Desire', 'https://www.higherdesire.co.uk/shop/',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 200, "include_paths": ["/shop/*", "/product/*"], "extract": "products"}',
   168, 5, 3000, 200),

  ('kink3d', 'Kink3D', 'https://kink3d.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 100, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 100),

  ('cockblock-toys', 'Cockblock Toys', 'https://cockblocktoys.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 100, "include_paths": ["/products/*", "/collections/*"], "extract": "products"}',
   168, 5, 3000, 100),

  ('nasty-pig', 'Nasty Pig', 'https://store.nastypig.com/en-ch',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/en-ch/products/*", "/en-ch/collections/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('libidex', 'Libidex', 'https://libidex.com',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 300, "include_paths": ["/product/*", "/product-category/*"], "extract": "products"}',
   168, 5, 3000, 300),

  ('amorelie-ch', 'Amorelie (Gay)', 'https://www.amorelie.ch/sextoys-fuer-mann-und-mann',
   'products', 'marketplace_products', 'firecrawl',
   '{"limit": 200, "include_paths": ["/sextoys-fuer-mann-und-mann*", "/product/*"], "extract": "products"}',
   168, 5, 3000, 200),

  -- ═══════════════════════════════════════════════════════════
  -- ACCOMMODATIONS (→ venues)
  -- ═══════════════════════════════════════════════════════════
  ('mister-bnb', 'misterb&b', 'https://www.misterbandb.com',
   'accommodations', 'venues', 'firecrawl',
   '{"limit": 500, "include_paths": ["/rooms/*", "/destinations/*"], "extract": "accommodations", "category": "accommodation"}',
   168, 4, 3000, 500),

  -- ═══════════════════════════════════════════════════════════
  -- EVENTS (→ events)
  -- ═══════════════════════════════════════════════════════════
  ('wnbr-events', 'World Naked Bike Ride', 'https://wiki.worldnakedbikeride.org/wiki/List_of_rides',
   'events', 'events', 'html_fetch',
   '{"extract": "wiki_table", "event_type": "World Naked Bike Ride", "selectors": {"table": "table.wikitable", "title_col": 0, "city_col": 1, "country_col": 2, "date_col": 3}}',
   720, 6, 5000, 5),

  ('eventfrog-lgbtiq', 'Eventfrog LGBTIQ', 'https://eventfrog.ch/de/events/ch/lgbtiq-partys.html?c=ALL',
   'events', 'events', 'html_fetch',
   '{"extract": "event_cards", "selectors": {"card": ".event-card, .event-item, article", "title": "h2, h3, .event-title", "date": ".event-date, time", "location": ".event-location, .venue"}}',
   24, 3, 2000, 20),

  ('display-magazin', 'Display Magazin Agenda', 'https://www.display-magazin.ch/agenda/',
   'events', 'events', 'html_fetch',
   '{"extract": "event_cards", "selectors": {"card": "article, .event-item, .agenda-item", "title": "h2, h3, .event-title", "date": ".event-date, time, .date", "location": ".event-location, .venue, .location"}}',
   24, 3, 2000, 20),

  ('gaycities-events', 'GayCities Events', 'https://www.gaycities.com/events',
   'events', 'events', 'html_fetch',
   '{"extract": "event_cards", "selectors": {"card": "article, .event-item, .card", "title": "h2, h3, a", "date": ".date, time", "location": ".city, .location"}}',
   48, 4, 3000, 50),

  ('travelgay-pride', 'Travel Gay Pride Calendar', 'https://www.travelgay.com/gay-pride-calendar',
   'events', 'events', 'html_fetch',
   '{"extract": "event_cards", "event_type": "Pride", "selectors": {"card": "article, .event-item, .pride-event", "title": "h2, h3, a", "date": ".date, time", "location": ".city, .country, .location"}}',
   168, 5, 3000, 20),

  -- ═══════════════════════════════════════════════════════════
  -- CITIES & PLACES (→ cities)
  -- ═══════════════════════════════════════════════════════════
  ('gaycities-places', 'GayCities Places', 'https://www.gaycities.com/places',
   'cities', 'cities', 'html_fetch',
   '{"extract": "city_list", "selectors": {"card": "a.city-card, .city-item, article", "name": "h2, h3, .city-name", "country": ".country", "description": ".description, p"}}',
   720, 7, 3000, 20),

  -- ═══════════════════════════════════════════════════════════
  -- QUEER VILLAGES (→ cities)
  -- ═══════════════════════════════════════════════════════════
  ('wikipedia-gay-villages', 'Wikipedia Gay Villages', 'https://en.wikipedia.org/wiki/List_of_gay_villages',
   'queer_villages', 'cities', 'html_fetch',
   '{"extract": "wiki_table", "selectors": {"table": "table.wikitable", "name_col": 0, "city_col": 1, "country_col": 2}}',
   720, 7, 5000, 5),

  -- ═══════════════════════════════════════════════════════════
  -- NEWS (→ news_articles)
  -- ═══════════════════════════════════════════════════════════
  ('equaldex-timeline', 'Equaldex Timeline', 'https://www.equaldex.com/timeline/',
   'news', 'news_articles', 'html_fetch',
   '{"extract": "timeline_items", "selectors": {"item": ".timeline-item, article, .event", "title": "h2, h3, .title", "date": ".date, time", "description": "p, .description"}}',
   24, 3, 3000, 50),

  -- ═══════════════════════════════════════════════════════════
  -- COUNTRIES / API (→ countries)
  -- ═══════════════════════════════════════════════════════════
  ('equaldex-api', 'Equaldex API', 'https://www.equaldex.com/api',
   'countries', 'countries', 'api',
   '{"api_base": "https://www.equaldex.com/api", "api_key_env": "EQUALDEX_API_KEY", "endpoints": ["/regions"], "extract": "equaldex_regions", "widget_url": "https://equaldex.stoplight.io/docs/equaldex/ZG9jOjE3NTQ2MTMw-equaldex-widget"}',
   168, 4, 1000, 300)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  content_type = EXCLUDED.content_type,
  target_table = EXCLUDED.target_table,
  scrape_method = EXCLUDED.scrape_method,
  scrape_config = EXCLUDED.scrape_config,
  schedule_interval_hours = EXCLUDED.schedule_interval_hours,
  priority = EXCLUDED.priority,
  rate_limit_ms = EXCLUDED.rate_limit_ms,
  max_pages_per_run = EXCLUDED.max_pages_per_run,
  updated_at = now();

-- Register scraping workflows in workflow_definitions
INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, default_payload,
   schedule, max_retries, retry_backoff_base, max_concurrency, timeout_seconds,
   is_enabled, priority, tags)
VALUES
  ('scrape-web-sources', 'Scrape Web Sources',
   'Unified web scraper: crawls registered scrape_sources, extracts products/events/content, stages into ingestion pipeline',
   'scrape-web-sources', 'scheduled_jobs',
   '{"mode": "scheduled"}',
   '0 3 * * 0',   -- every Sunday 03:00 UTC
   3, 60, 2, 300, true, 4,
   ARRAY['cron', 'import', 'scraper', 'products', 'events']),

  ('scrape-events-daily', 'Scrape Events (Daily)',
   'Daily scrape of high-priority event sources (Eventfrog, Display Magazin, Equaldex)',
   'scrape-web-sources', 'scheduled_jobs',
   '{"mode": "scheduled", "content_types": ["events", "news"]}',
   '0 6 * * *',   -- every day 06:00 UTC
   3, 60, 1, 150, true, 3,
   ARRAY['cron', 'import', 'scraper', 'events'])
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  edge_function = EXCLUDED.edge_function,
  default_payload = EXCLUDED.default_payload,
  schedule = EXCLUDED.schedule,
  tags = EXCLUDED.tags,
  updated_at = now();
