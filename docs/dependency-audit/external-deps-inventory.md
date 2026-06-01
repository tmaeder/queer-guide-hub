# External Dependency Inventory

_Every external vendor with call sites, data direction, and purpose. Audit date 2026-06-01._

## AI / inference

| Vendor | Where (call site) | Direction | Purpose | Gatewayed | Key |
|---|---|---|---|---|---|
| OpenAI | `_shared/openai-client.ts`; `pipeline-enrich-{news,events,venue,city,country,village}`, `pipeline-quality-enhance`, `event-agentic-enrich`, `pipeline-safety-relevance`, `news-quality-backfill` | outbound | content enrichment, relevance/quality, agentic page extraction | **No** | `OPENAI_API_KEY` + OAuth (`chatgpt_oauth_tokens`) |
| Cloudflare Workers AI | Workers: assistant, submit, ingest, search-proxy, trip-inbox; edge fns: `story-narrate`, `translate-*`, `cms-ai`, `generate-usernames`, `pipeline-image-vision`, `bulk-create-*` | outbound | chat/RAG, query rewrite, embeddings (bge-m3), translation, vision, rerank | Workers: **yes**; edge fns: **no** | `CF_AI_API_TOKEN`, `CF_ACCOUNT_ID` |
| Anthropic (shim) | `_shared/anthropic-shim.ts`; `trip-concierge`, `packing-suggestions-llm`, `trip-recap`, `trip-safety-narrative`, guide-drafts | outbound | trip/safety/guide generation; default routed to Workers AI unless `USE_ANTHROPIC=1` | via shim | `ANTHROPIC_API_KEY` (opt) |
| Self-hosted Gemma vLLM | `_shared/llm-client.ts`; `cms-ai` | outbound (CH) | EU-residency CMS ops fallback | No | `QG_LLM_BASE_URL`, `QG_LLM_API_KEY` |
| Wolfram | `_shared/wolfram-client.ts` | — | present, **not active** | — | `WOLFRAM_APPID` |

## Vendors that receive user PII

| Vendor | Where | Direction | Data | Key |
|---|---|---|---|---|
| Resend (US) | `_shared/email.ts`; `send-templated-email`, `send-bulk-email`, `send-welcome-email`, `notify-*`, `resend-webhook` | outbound | name, email, message body | `RESEND_API_KEY` |
| Stripe (US) | `create-checkout-session`, `stripe-webhook`, `create-donation*` | outbound | name, email, amount | `STRIPE_SECRET_KEY` |
| Sentry (US) | `src` `@sentry/react`; `_shared` `@sentry/deno`; `sentry-webhook` | outbound | stack traces, user/session context | `VITE_SENTRY_DSN`, `SENTRY_DSN` |
| GitHub (US) | `forward-feedback-to-github`, `push-feedback-to-github`, `github-webhook` | bidirectional | community feedback content | `GITHUB_PAT` |
| Mapbox (US) | `mapbox-geocoding`, `secure-mapbox-proxy` | outbound | user-typed location text | `MAPBOX_ACCESS_TOKEN` |
| WhatsApp/Meta (US) | `whatsapp-webhook` | bidirectional | inbound messages (mostly disabled) | `WHATSAPP_*` |

## Read-only ingestion sources (no user PII egress)

Foursquare, Google Places, TomTom, TripAdvisor (`source-*`, `import-*`, `enrich-venue`); Ticketmaster,
Eventbrite (`source-ticketmaster/eventbrite`); Awin, Shopify, Etsy (`source-awin/shopify/etsy`, marketplace);
Pexels, Unsplash (`get-pexels-images`, `fetch-images`); GeoNames, REST Countries, Wikipedia, Refuge Restrooms,
RSS news, OpenStreetMap/Geofabrik (Nominatim import). All outbound *fetch* of third-party catalog data.
Keys: `FOURSQUARE_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TOMTOM_API_KEY`, `TRIPADVISOR_API_KEY`,
`TICKETMASTER_API_KEY`, `EVENTBRITE_OAUTH_TOKEN`, `AWIN_API_KEY`, `SHOPIFY_ADMIN_TOKEN`, `PEXELS_API_KEY`,
`UNSPLASH_ACCESS_KEY`, etc.

## Self-hosted / EU services (Infomaniak CH)

| Service | URL | Purpose | Egress? |
|---|---|---|---|
| ~~Meilisearch~~ | ~~`s.queer.guide`~~ | **decommissioned (#1405)** — search moved to Postgres `search_hybrid` | — |
| Nominatim | `nominatim.queer.guide` | reverse geocoding | none (self-hosted) |
| Plane | `plane.queer.guide` | internal issue tracker | none |
| Gemma vLLM | `ai.queer.guide` | EU inference fallback | none |

## Cloudflare-native (inside boundary)

DNS zone, Pages, 18 Workers, R2×8, KV×5, D1×1, AI Gateway `qg-search`, Workers AI, Turnstile. Account
`7aa3765cc5f50f2b681b782eb4a8d296`.

## Analytics

- **Umami** — self-hosted in Supabase Postgres (`umami-analytics`, `umami-dashboard`). No external egress.
- Cloudflare Web Analytics — implicit via Pages.

## Resolved

- `redis-get/set/keys/delete` edge functions → **Upstash Redis REST API** (`UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`, see `_shared/redis-client.ts`). External vendor (US/global), browser-callable
  from `queer.guide` origins. **Not on Infomaniak** → does NOT block VPS teardown. Overlaps Cloudflare KV →
  **consolidation candidate** (migrate Upstash usage → CF KV to drop a vendor; or move to Upstash EU region).
  Note: these functions are not in the repo checkout (deployed from CI) — pulled live via Supabase MCP.
