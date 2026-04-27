# External Dependencies Inventory

**Audit date:** 2026-03-04

## Legend

- **Direction:** OUT = data sent to vendor, IN = data received, BI = bidirectional
- **PII likely:** Whether personally identifiable information is plausibly included
- **Status:** Working, Broken, Missing key, Unused

---

## 1. Core Infrastructure

### Supabase (Database, Auth, Storage, Edge Functions)
- **Type:** BaaS (Backend-as-a-Service)
- **Direction:** BI
- **Data:** ALL application data — users, venues, events, groups, messages, profiles, check-ins
- **PII:** Yes (email, location, profile data, group memberships, messages)
- **Call sites:** `web/src/integrations/supabase/client.ts`, all 86 edge functions
- **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **Status:** Working
- **Notes:** Primary infrastructure. EU-hosted (eu-central-2). All user data resides here.

### Cloudflare (Pages, Workers, R2, DNS)
- **Type:** Hosting / CDN / Edge compute
- **Direction:** BI
- **Data:** All HTTP traffic (IP addresses, request headers), static assets, email content
- **PII:** Yes (visitor IPs, email content via email-ingest worker)
- **Call sites:** CF Pages hosting, 2 Workers, `cloudflare-api` edge function
- **Env vars:** `CLOUDFLARE_API_TOKEN`
- **Status:** Working
- **Notes:** Also used for Workers AI embeddings (BGE-base, 768d vectors)

### Upstash Redis
- **Type:** Serverless cache
- **Direction:** BI
- **Data:** Cached API responses, potentially user-related data
- **PII:** Depends on what's cached (review cache keys)
- **Call sites:** Edge functions `redis-get`, `redis-set`, `redis-delete`, `redis-keys`
- **Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Status:** Working

---

## 2. AI / LLM Services

### OpenAI
- **Type:** AI API
- **Direction:** OUT (prompts with content) → IN (completions)
- **Data:** Tag names, venue descriptions, personality bios, content for auto-tagging
- **PII:** Potentially (personality names, venue data that may include user-submitted content)
- **Call sites:** `auto-tag-content`, `categorize-tags`, `bulk-create-ai-tags`, `fetch-personality-data`, `content-automation`, `automation-ai-enhancer`
- **Env vars:** `OPENAI_API_KEY`
- **Status:** Working

### Anthropic (Claude)
- **Type:** AI API
- **Direction:** OUT (prompts with content) → IN (completions)
- **Data:** RAG queries (user questions + context from DB), ingestion pipeline content
- **PII:** Potentially (user search queries, content being processed)
- **Call sites:** `intelligent-rag`, `ingestion-pipeline`, `_shared/ai-validator.ts`
- **Env vars:** `ANTHROPIC_API_KEY`
- **Status:** Working

### Cloudflare Workers AI
- **Type:** AI inference (embeddings)
- **Direction:** OUT (text) → IN (vectors)
- **Data:** Tag names, content text for embedding generation
- **PII:** Low (content text, not user identifiers)
- **Call sites:** `populate-embeddings`, `compute-tag-similarities`
- **Env vars:** Via `CLOUDFLARE_API_TOKEN`
- **Status:** Working
- **Notes:** `@cf/baai/bge-base-en-v1.5` model, 768-dim vectors. Also AI binding in email-ingest worker.

---

## 3. Maps & Geolocation

### Google Maps / Google Places
- **Type:** Maps, geocoding, places autocomplete
- **Direction:** OUT (search queries, coordinates) → IN (map tiles, place data)
- **Data:** User location search terms, coordinates
- **PII:** Yes (user search queries reveal intent/location)
- **Call sites:** `web/src/hooks/useSecureGoogleMaps.tsx`, edge functions `secure-google-maps-key`, `enrich-venue`, `import-google-places-venues`
- **Env vars:** `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY`
- **Status:** Maps working, Places key missing

### Mapbox
- **Type:** Geocoding
- **Direction:** OUT (search queries) → IN (coordinates, place names)
- **Data:** Location search queries from users
- **PII:** Yes (location searches can be identifying)
- **Call sites:** `web/src/components/ui/location-autocomplete.tsx`, edge function `mapbox-geocoding`, `secure-mapbox-token`
- **Env vars:** `MAPBOX_TOKEN`
- **Status:** Working

### Protomaps (self-hosted tiles)
- **Type:** Map tile server
- **Direction:** IN only (tile data)
- **Data:** Tile coordinates requested (z/x/y)
- **PII:** No (tile requests don't identify users when proxied through own worker)
- **Call sites:** `web/src/config/mapStyle.ts` → `protomaps-tiles.maeder-tobiassimon.workers.dev`
- **Status:** Working
- **Notes:** Self-hosted via CF Worker + R2. Also loads glyphs/sprites from `protomaps.github.io`.

### ipapi.co
- **Type:** IP geolocation
- **Direction:** OUT (visitor IP) → IN (coordinates, city, country)
- **Data:** Visitor's IP address (sent automatically by browser)
- **PII:** Yes (IP address is PII under GDPR)
- **Call sites:** `RegionalEventsCalendar.tsx:30`, `WeeklyEventsSlider.tsx:34`, `FrontPageVenueMap.tsx:52`
- **Status:** Working
- **Notes:** Called directly from browser — vendor sees user IP, UA, referrer

### TomTom
- **Type:** Venue search / geocoding
- **Direction:** OUT (search queries) → IN (venue data)
- **Data:** Location names, coordinates
- **PII:** Low (venue queries, not user-specific)
- **Call sites:** Edge function `import-tomtom-venues`, `enrich-venue`
- **Env vars:** `TOMTOM_API_KEY`
- **Status:** Working

---

## 4. Travel & Affiliate Services

### Travelpayouts API
- **Type:** Flight price data
- **Direction:** OUT (origin/dest airports, dates) → IN (prices, airlines)
- **Data:** Airport codes, travel dates
- **PII:** Low (airport pairs, no user identity)
- **Call sites:** Edge functions `travel-deals`, `search-flights`
- **Env vars:** `TRAVELPAYOUTS_API_TOKEN`
- **Status:** Working (200 req/hour limit, 30min cache)
- **Affiliate:** marker=452012

### Aviasales (booking redirect)
- **Type:** Affiliate link (no API call)
- **Direction:** OUT (user clicks affiliate link)
- **Data:** Origin/dest IATA codes, dates in URL params
- **PII:** Low (travel intent, no identity)
- **Call sites:** `web/src/utils/aviasalesUrl.ts`, `TravelDealCard.tsx`
- **Notes:** User navigates to aviasales.com with affiliate params

### GetYourGuide
- **Type:** Activity booking affiliate
- **Direction:** OUT (widget script loaded, user clicks)
- **Data:** Destination names, partner_id, user browser data (via widget script)
- **PII:** Yes (widget JS loaded client-side — vendor gets IP, UA, cookies)
- **Call sites:** `web/src/components/activities/ActivitiesWidget.tsx`
- **Script:** `https://widget.getyourguide.com/dist/pa.umd.production.min.js`
- **Affiliate:** partner_id=2PBDXWH

### Booking.com
- **Type:** Affiliate link (no API call)
- **Direction:** OUT (user clicks link)
- **Data:** Destination in URL
- **PII:** Low (travel intent only)
- **Call sites:** `search-hotels` edge function
- **Notes:** No AID configured yet. Deep links only.

### Ticketmaster
- **Type:** Event data import
- **Direction:** OUT (search params) → IN (event listings)
- **Data:** Location, event categories
- **PII:** No (server-side import, no user data sent)
- **Call sites:** Edge function `import-ticketmaster-events`
- **Env vars:** `TICKETMASTER_API_KEY`
- **Status:** Working

### Eventbrite
- **Type:** Event data import
- **Direction:** OUT (search params) → IN (event listings)
- **Data:** Location, event categories
- **PII:** No (server-side import)
- **Call sites:** Edge function `import-eventbrite-events`
- **Env vars:** `EVENTBRITE_OAUTH_TOKEN`
- **Status:** Working

---

## 5. Image & Media Services

### Pexels
- **Type:** Stock photo API
- **Direction:** OUT (search query) → IN (image URLs)
- **Data:** Location/entity names as search terms
- **PII:** No (server-side via edge function)
- **Call sites:** `get-pexels-images`, `store-tag-images`, `fetch-city-images`, `ingestion-pipeline`
- **Env vars:** `PEXELS_API_KEY`
- **Status:** Working

### Unsplash
- **Type:** Stock photo API
- **Direction:** OUT (search query) → IN (image URLs)
- **Data:** Entity names as search terms
- **PII:** No (server-side via edge function)
- **Call sites:** `store-tag-images`, `fetch-city-images`, `get-pexels-images` (fallback), `bulk-create-ai-tags`
- **Env vars:** `UNSPLASH_ACCESS_KEY`
- **Status:** Working
- **Notes:** Also used as static fallback URL in `DirectoryCard.tsx` (client-side)

### Gravatar
- **Type:** Avatar service
- **Direction:** OUT (MD5 hash of email) → IN (avatar image)
- **Data:** MD5 hash of user email addresses
- **PII:** Yes (MD5 is reversible for common emails via rainbow tables)
- **Call sites:** `web/src/lib/gravatar.ts:20,35`
- **Status:** Working
- **Notes:** Called from browser — Gravatar sees user IP + email hash

### DiceBear
- **Type:** Avatar generation
- **Direction:** OUT (group name as seed) → IN (SVG avatar)
- **Data:** Group names
- **PII:** No (group names, not user data)
- **Call sites:** `web/src/components/groups/GroupCard.tsx:40`
- **Notes:** Called from browser

### Wikimedia Commons
- **Type:** Image search
- **Direction:** OUT (search query) → IN (image metadata)
- **Data:** Location/entity names
- **PII:** No (server-side or browser with location names only)
- **Call sites:** `web/src/hooks/useExternalImageSearch.ts:125`

---

## 6. Email & Messaging

### Resend
- **Type:** Transactional email
- **Direction:** OUT (email content, recipient addresses)
- **Data:** User email addresses, email bodies, notification content
- **PII:** Yes (email addresses, message content)
- **Call sites:** `send-templated-email`, `send-bulk-email`, `send-mailbox-email`, `send-group-notifications`
- **Env vars:** `RESEND_API_KEY`
- **Status:** Working

---

## 7. Analytics & Monitoring

### Umami Analytics
- **Type:** Web analytics
- **Direction:** OUT (page views, events) → IN (dashboard data)
- **Data:** Page URLs, custom events (travel clicks, errors), visitor metadata
- **PII:** Low (Umami is privacy-focused, no cookies, no PII by default)
- **Call sites:** `umami-analytics` (tracking), `umami-dashboard` (retrieval), `web/src/hooks/useUmamiAnalytics.tsx`
- **Status:** Working
- **Notes:** Proxied through edge function (good — hides user IP from Umami)

---

## 8. Security & Verification

### Cloudflare Turnstile
- **Type:** CAPTCHA / bot protection
- **Direction:** BI (challenge token verification)
- **Data:** Challenge tokens, verification results
- **PII:** Low (no user-identifying data beyond what CF already sees)
- **Call sites:** Edge function `verify-turnstile`, `get-turnstile-config`
- **Env vars:** `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`
- **Status:** Working

### URLScan.io
- **Type:** Link security scanning
- **Direction:** OUT (URLs to scan) → IN (scan results)
- **Data:** URLs found in content
- **PII:** Low (URLs being scanned, not user data)
- **Call sites:** Edge function `scan-links`, `validate-links`; `web/src/components/admin/ScanResultDialog.tsx`
- **Env vars:** `URLSCAN_API_KEY`
- **Status:** Working

---

## 9. Data Import Sources (server-side only)

### Foursquare
- **Direction:** IN (venue data)
- **Env vars:** `FOURSQUARE_API_KEY`
- **Status:** BROKEN (401)

### TripAdvisor
- **Direction:** IN (venue/review data)
- **Env vars:** `TRIPADVISOR_API_KEY`
- **Status:** BROKEN (403)

### ILGA Database
- **Direction:** IN (LGBTQ+ rights data)
- **Status:** Working

### REST Countries API
- **Direction:** IN (country reference data)
- **Status:** Working (no key needed)

### Wikipedia
- **Direction:** IN (encyclopedia data)
- **Status:** Working (no key needed)

### News APIs (4 providers)
- **Providers:** NEWS_API_KEY, NEWSDATA_API_KEY, GNEWS_API_KEY, THENEWSAPI_API_KEY
- **Direction:** IN (news articles)
- **Status:** Working

### OpenWeather
- **Direction:** IN (weather forecasts)
- **Env vars:** `OPENWEATHER_API_KEY`
- **Status:** Working

### Firecrawl
- **Type:** Web scraping service
- **Direction:** OUT (URLs to scrape) → IN (scraped content)
- **Env vars:** `FIRECRAWL_API_KEY`
- **Status:** Configured

### API Ninjas
- **Direction:** IN (personality data)
- **Env vars:** `API_NINJAS_KEY`
- **Status:** Configured

---

## 10. Payment (Incomplete)

### Stripe
- **Type:** Payment processing
- **Direction:** BI
- **Data:** Payment session IDs (in `donations` table)
- **PII:** Yes (financial data if fully implemented)
- **Call sites:** Edge function `get-stripe-publishable-key`, `web/src/hooks/useSecureCredentials.tsx`
- **Status:** Partially configured (publishable key fetch exists, no full checkout)

---

## 11. Client-Side Third-Party Scripts

| Script | Loaded From | User Data Exposed |
|--------|-------------|-------------------|
| GetYourGuide widget | `widget.getyourguide.com` | IP, UA, referrer, cookies |
| Protomaps glyphs/sprites | `protomaps.github.io` | IP, referrer (low risk) |
| OpenWeather icons | `openweathermap.org` | IP, referrer (low risk) |
| Gravatar images | `gravatar.com` | IP, referrer, email hash |
| DiceBear SVGs | `api.dicebear.com` | IP, referrer (low risk) |
| Unsplash fallback images | `images.unsplash.com` | IP, referrer (low risk) |
| ipapi.co geolocation | `ipapi.co` | Full IP address |

---

## Summary

| Category | Count | With PII | Client-side |
|----------|-------|----------|-------------|
| Core infrastructure | 3 | 3 | 1 |
| AI / LLM | 3 | 1 | 0 |
| Maps & geo | 5 | 3 | 3 |
| Travel & affiliate | 6 | 1 | 2 |
| Image & media | 5 | 1 | 3 |
| Email | 1 | 1 | 0 |
| Analytics | 1 | 0 | 0 |
| Security | 2 | 0 | 0 |
| Data import | 9 | 0 | 0 |
| Payment | 1 | 1 | 0 |
| **Total** | **36** | **11** | **9** |
