# System Map & Trust Boundaries

_Audit date: 2026-06-01. Built from live Cloudflare + Supabase config and a full codebase sweep._

## Components

| Layer | Component | Home | Notes |
|---|---|---|---|
| Frontend | React 19 + Vite SPA | **Cloudflare Pages** (`queer.guide`) | auto-deploy on push to `main` |
| Edge compute | 18 Workers | **Cloudflare** | search-proxy, ingest, assistant, submit, geo, image-ingest, image-cdn, protomaps-tiles, trip-inbox, snapshot-archiver, email-ingest, telegram-ingest, operator-notify-inbound, geo-boundaries (+ stale: scraper-api ×2, broken-bar-05d3-nlweb) |
| Backend | Postgres 17.6 (5.7 GB) | **Supabase eu-central-2 (Zürich)** | system of record |
| Backend | 261 Edge Functions (Deno) | **Supabase** | ingestion pipelines, AI enrichment, trips, payments, email |
| Auth | email + magic-link + passkey | **Supabase Auth** | |
| Object storage | R2 ×8, Supabase Storage | **Cloudflare + Supabase** | images, snapshots, plane backups, map tiles |
| Cache/state | KV ×5, D1 ×1 | **Cloudflare** | embed cache, sessions, rate-limit, ingest state; D1 `operator_notify` = `env.DB` of the active operator-notify-inbound mail Worker (NOT stale) |
| Search | Meilisearch | **Infomaniak VPS (CH)** `s.queer.guide` | prod default; PG cutover mid-validation |
| Geocoding | Nominatim | **Infomaniak VPS (CH)** `nominatim.queer.guide` | self-hosted, no per-query egress |
| Issue tracker | Plane (Django) | **Infomaniak VPS (CH)** `plane.queer.guide` | own redis/mq; R2-backed |
| Inference | Gemma vLLM | **Infomaniak VPS (CH)** `ai.queer.guide` | EU-residency fallback for cms-ai |

## Trust boundary

```
┌──────────────────────── OURS (trust boundary) ─────────────────────────┐
│  Cloudflare (acct 7aa3765cc5f50f2b681b782eb4a8d296)                     │
│    DNS zone queer.guide · Pages SPA · 18 Workers · R2×8 · KV×5 · D1×1   │
│    AI Gateway "qg-search" · Workers AI · Turnstile                      │
│                                                                         │
│  Supabase (Zürich, eu-central-2)                                        │
│    Postgres 17.6 (5.7 GB) · Auth · Storage · 261 Edge Functions         │
│    pgvector HNSW ×5 tables · pgmq · pg_cron · Realtime                  │
│                                                                         │
│  Infomaniak VPS (Switzerland) ── Caddy:443 TLS, NOT CF-proxied ──       │
│    Meilisearch · Nominatim · Plane · Gemma vLLM                         │
└─────────────────────────────────────────────────────────────────────────┘
   │ outbound egress (leaves EU/CH)
   ├─ AI:    OpenAI gpt-4o-mini (US) · Workers AI (CF global GPUs) · Anthropic* (US)
   ├─ Comms: Resend email (US) · GitHub feedback (US) · WhatsApp/Meta (US, mostly disabled)
   ├─ Money: Stripe (US)
   ├─ Errors: Sentry (US)
   ├─ Geo:   Mapbox geocoding (US)
   └─ Ingestion (read-only fetch, no user PII): Foursquare, Google Places, TomTom,
             Ticketmaster, Eventbrite, TripAdvisor, Awin, Shopify, Etsy, Pexels,
             Unsplash, GeoNames, Wikipedia, REST Countries, Refuge Restrooms, RSS, OSM
```

## Request flow (end to end)

1. **DNS/TLS** — `queer.guide` authoritative on Cloudflare; CF terminates TLS for app + Workers/Pages.
   `s./plane./nominatim./ai.queer.guide` resolve **directly to the Infomaniak VPS** (Caddy TLS, **CF proxy
   bypassed → origin IP exposed, no WAF/cache**).
2. **App** — SPA on Pages → calls Supabase (PostgREST/RPC, Auth) and Workers (`search.`, `submit.`, `assistant.`, `/api/geo`).
3. **Search** — `search-proxy` Worker embeds query (Workers AI bge-m3, cached in KV) → Meilisearch (`s.queer.guide`)
   today, or Postgres `search_hybrid` in shadow/pg mode.
4. **AI** — inference originates in **two places**: Supabase edge functions (OpenAI direct + Workers AI REST,
   mostly **not** gatewayed) and CF Workers (Workers AI, **gatewayed** via `qg-search`). Sensitive cms-ai path
   falls back to the EU vLLM.
5. **Data of record** — all entities/users in Supabase Postgres (Zürich).

## Where the sensitive bits sit

- **DNS:** Cloudflare. **TLS:** Cloudflare (app) + Caddy (Infomaniak services).
- **Origin:** Supabase (Zürich) for data; Infomaniak (CH) for search/geocode/AI-fallback; CF edge for compute.
- **AI calls:** split — US (OpenAI), CF-global (Workers AI), CH (vLLM). Only ~4 Workers route through AI Gateway.
