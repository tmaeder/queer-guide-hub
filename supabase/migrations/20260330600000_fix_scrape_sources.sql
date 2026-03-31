-- ============================================================
-- Fix scrape_sources configs based on live site testing
-- Applied: 2026-03-30
-- ============================================================

-- 1. Equaldex Timeline: fix selectors (underscore not hyphen)
UPDATE public.scrape_sources
SET scrape_config = '{"extract": "timeline_items", "selectors": {"item": ".timeline_item", "title": ".timeline_info a", "date": ".timeline_date", "description": ".timeline_info"}}'::jsonb,
    updated_at = now()
WHERE slug = 'equaldex-timeline';

-- 2. Equaldex API: disable — no public API exists (returns 403/404)
UPDATE public.scrape_sources
SET is_enabled = false,
    consecutive_failures = 0,
    updated_at = now()
WHERE slug = 'equaldex-api';

-- 3. WNBR: change from wiki_table to wiki_list (page has no tables)
UPDATE public.scrape_sources
SET scrape_config = '{"extract": "wiki_list", "event_type": "World Naked Bike Ride", "selectors": {"heading": "h3 span.mw-headline, h3", "list_item": "ul > li", "city_link": "a[href*=\"/wiki/\"]"}}'::jsonb,
    updated_at = now()
WHERE slug = 'wnbr-events';

-- 4. Display Magazin: events are in JSON-LD, so use that extraction mode
UPDATE public.scrape_sources
SET scrape_config = '{"extract": "event_cards", "selectors": {"card": "article, .event-item, .type-tribe_events", "title": "h2, h3, .tribe-events-list-event-title", "date": "time, .tribe-event-schedule-details", "location": ".tribe-venue, .event-location"}}'::jsonb,
    updated_at = now()
WHERE slug = 'display-magazin';

-- 5. Eventfrog: JS-rendered SPA, disable until headless browser available
UPDATE public.scrape_sources
SET is_enabled = false,
    updated_at = now()
WHERE slug = 'eventfrog-lgbtiq';

-- 6. GayCities Events: Cloudflare 403, disable
UPDATE public.scrape_sources
SET is_enabled = false,
    updated_at = now()
WHERE slug = 'gaycities-events';

-- 7. GayCities Places: Cloudflare 403, disable
UPDATE public.scrape_sources
SET is_enabled = false,
    updated_at = now()
WHERE slug = 'gaycities-places';

-- 8. TravelGay Pride Calendar: Cloudflare 403, disable
UPDATE public.scrape_sources
SET is_enabled = false,
    updated_at = now()
WHERE slug = 'travelgay-pride';

-- 9. Wikipedia Gay Villages: fix to use per-country-table extraction
-- Country is from section heading, not table column 3
UPDATE public.scrape_sources
SET scrape_config = '{"extract": "wiki_country_tables", "selectors": {"heading": "h2 .mw-headline, h3 .mw-headline", "table": "table.wikitable", "name_col": 0, "city_col": 1}}'::jsonb,
    updated_at = now()
WHERE slug = 'wikipedia-gay-villages';

-- 10. MisterBnB: site behind CF managed challenge, disable native_crawl
UPDATE public.scrape_sources
SET is_enabled = false,
    updated_at = now()
WHERE slug = 'mister-bnb';

-- Reset consecutive failures for sources we just fixed
UPDATE public.scrape_sources
SET consecutive_failures = 0
WHERE slug IN ('equaldex-timeline', 'wnbr-events', 'display-magazin', 'wikipedia-gay-villages');
