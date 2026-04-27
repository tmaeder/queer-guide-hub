# System Map — Queer Guide

**Audit date:** 2026-03-04
**Domain:** queer.guide
**Stack:** Vite+React+TS+Tailwind, Supabase (PostgreSQL 17.4), Cloudflare Pages/Workers

## Architecture Diagram

```
┌───────────────────────── Trust Boundary ──────────────────────────────┐
│                                                                       │
│  ┌─────────────────┐     ┌──────────────────────────────────────┐    │
│  │  CF Pages        │     │  Supabase (eu-central-2)             │    │
│  │  (Frontend SPA)  │◄───►│  ├─ PostgreSQL 17.4 (115 tables)    │    │
│  │  queer.guide     │     │  ├─ Auth (JWT, email)                │    │
│  └─────────────────┘     │  ├─ 86 Edge Functions (Deno)         │    │
│                           │  ├─ Storage (11 buckets)             │    │
│  ┌─────────────────┐     │  ├─ Realtime                         │    │
│  │  CF Worker       │     │  └─ pgmq (workflow orchestration)    │    │
│  │  email-ingest    │────►│                                      │    │
│  └─────────────────┘     └──────────────────────────────────────┘    │
│                                                                       │
│  ┌─────────────────┐     ┌─────────────────┐                        │
│  │  CF Worker       │     │  GitHub Actions  │                        │
│  │  pmtiles-server  │     │  (Scraper cron)  │                        │
│  └─────────────────┘     └─────────────────┘                        │
│                                                                       │
│  ┌─────────────────┐                                                 │
│  │  Upstash Redis   │ ← managed cache (serverless, external)         │
│  └─────────────────┘                                                 │
└───────────────────────────────────────────────────────────────────────┘
        │              │              │              │            │
   ┌────┴───┐    ┌─────┴─────┐  ┌────┴────┐   ┌────┴───┐  ┌────┴────┐
   │ Maps & │    │ AI / LLM  │  │ Travel  │   │ Images │  │  Data   │
   │ Geo    │    │           │  │         │   │        │  │ Import  │
   ├────────┤    ├───────────┤  ├─────────┤  ├────────┤  ├─────────┤
   │Mapbox  │    │OpenAI     │  │Travelpay│  │Pexels  │  │Foursqr  │
   │Google  │    │Anthropic  │  │Aviasales│  │Unsplash│  │TripAdv  │
   │Protomps│    │CF Wrkrs AI│  │Booking  │  │Wikimd  │  │TomTom   │
   │ipapi.co│    │           │  │GetYrGd  │  │DiceBear│  │Ticketm  │
   └────────┘    └───────────┘  │Ticketm  │  │Gravatar│  │Eventbr  │
                                └─────────┘  └────────┘  │ILGA     │
        │              │                                  │RESTCtry │
   ┌────┴───┐    ┌─────┴─────┐                           │Wikipedia│
   │  Email │    │ Security  │                            │Newsapis │
   ├────────┤    ├───────────┤                            │Firecrawl│
   │Resend  │    │CF Turnstl │                            └─────────┘
   └────────┘    │URLScan.io │
                 └───────────┘
```

## Components

| Component | Role | Location | Runtime |
|-----------|------|----------|---------|
| Frontend SPA | React UI | CF Pages `queer-guide.pages.dev` | Browser |
| Edge Functions (86) | API layer, imports, AI | Supabase `xqeacpakadqfxjxjcewc` | Deno |
| PostgreSQL | Primary database | Supabase eu-central-2 | PG 17.4 |
| Supabase Auth | Authentication | Supabase | JWT, email |
| Supabase Storage | File storage (11 buckets) | Supabase | S3-compat |
| email-ingest Worker | Inbound email processing | CF Workers | V8 isolate |
| pmtiles-server Worker | Vector map tiles | CF Workers | V8 isolate |
| Scraper | Venue/event data pipeline | GitHub Actions (Node 22) | Node.js |
| iOS App | PWA wrapper | App Store | Swift/UIKit |
| Upstash Redis | Caching layer | Upstash (serverless) | Redis protocol |

## Storage

| Store | Type | Data Residency | Encryption |
|-------|------|----------------|------------|
| Supabase PostgreSQL | Relational DB | eu-central-2 (Frankfurt) | At-rest (AES-256) |
| Supabase Storage | Object storage | eu-central-2 | At-rest |
| Upstash Redis | Key-value cache | Unknown (check config) | TLS in transit |
| CF R2 | PMTiles storage | EU (inferred from CF) | At-rest |

## Build & CI/CD

| Pipeline | Trigger | Target |
|----------|---------|--------|
| `npm run build` → `wrangler pages deploy` | Manual | CF Pages |
| GitHub Actions `scrape.yml` | Daily 03:15 UTC, Hourly :30 | Supabase DB |
| Supabase Dashboard | Manual deploy per function | Edge Functions |
| `wrangler deploy` | Manual | CF Workers |

## Cron Jobs (8 active)

| Schedule | Function | External Vendor Hit |
|----------|----------|-------------------|
| Hourly :00 | fetch-news | News APIs (4 providers) |
| Hourly :30 | geo-link-content | None (internal) |
| Daily 2am | import-foursquare-venues | Foursquare (BROKEN) |
| Daily 2am | import-ilga-data | ILGA database |
| Daily 3am | run-automated-reviews | None (internal) |
| Weekly Sun 4am | sync-content-links | None (internal) |
| Weekly Sun 4:30am | validate-links | URLScan.io |
| Every 6h | validate-links (recheck) | URLScan.io |

## Compliance Context

- **Primary jurisdiction:** Switzerland (CH) — FADP/nDSG applies alongside GDPR
- **Infrastructure hosting:** EU (Supabase eu-central-2, Cloudflare EU)
- **User base:** Global LGBTQ+ community (sensitive personal data under GDPR Art. 9 — sexual orientation)
- **Special consideration:** User data reveals sexual orientation/identity by nature of the platform. This elevates ALL data handling to "special category" under GDPR.
