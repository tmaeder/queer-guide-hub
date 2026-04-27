# Architecture

## Pipeline Overview

```
discover() → fetchDetail() → normalize() → dedupe() → upsert()
     ↓              ↓              ↓           ↓          ↓
  URL lists    Raw HTML/JSON   Canonical   Match check  DB write
               + Snapshots      schema    + confidence   + map
```

## Directory Structure

```
src/
├── cli.ts                    # CLI entry point (commander)
├── config.ts                 # Environment config + source configs
├── types/
│   ├── schemas.ts            # Zod schemas for all entities
│   └── connector.ts          # SourceConnector interface
├── sources/
│   ├── base.ts               # BaseConnector abstract class
│   ├── wikipedia.ts          # Wikipedia List_of_gay_villages
│   ├── iglta.ts              # IGLTA Pride Calendar (API + browser)
│   ├── outsavvy.ts           # Outsavvy events (sitemap + JSON-LD)
│   ├── travelgay.ts          # TravelGay venues (blocked-aware)
│   ├── patroc.ts             # Patroc city guides
│   ├── misterbnb.ts          # MisterBnB stays (browser + block-aware)
│   └── index.ts              # Connector registry
├── normalize/
│   └── normalize.ts          # Raw → canonical entity mapping
├── db/
│   ├── pool.ts               # pg Pool wrapper
│   ├── queries.ts            # Upsert, snapshot, ingest run queries
│   ├── migrate.ts            # Migration runner
│   └── migrations/
│       └── 001_initial_schema.sql
├── jobs/
│   ├── orchestrator.ts       # Full pipeline: discover→persist
│   └── scheduler.ts          # node-cron scheduler
└── utils/
    ├── logger.ts             # pino structured logger
    ├── robots.ts             # robots.txt checker (cached)
    ├── fetch.ts              # HTTP fetch with retry/backoff/rate-limit
    ├── browser.ts            # Playwright browser pool
    ├── text.ts               # Slugify, normalize, similarity
    ├── dates.ts              # Date parsing, timezone inference
    └── dedupe.ts             # Deduplication engine
```

## Entity Flow

### 1. Discovery
Each connector's `discover()` yields batches of `DiscoveredUrl` objects — URLs to scrape with their entity type.

### 2. Fetching
`fetchDetail()` fetches the URL, checks robots.txt, applies rate limiting with jitter, and retries on 429/5xx.

### 3. Raw Entity
Parsed data is wrapped in a `SourceRawEntity` with source name, source ID, and raw data.

### 4. Normalization
`normalizeEntity()` maps raw data to canonical fields, validates with Zod, cleans text, parses dates, and normalizes URLs.

### 5. Deduplication
Before insertion, the system checks for existing entities with matching:
- Name + city + website domain (strong, >0.85 confidence)
- Name + address (strong, >0.85 confidence)
- Fuzzy name in same city (weak, stored as "pending" for review)

### 6. Persistence
`upsertEntity()` either inserts a new record or updates an existing one, tracked via `scraper_entity_map`.

## Database Schema

### Core Entities
- `scraper_places` — Gay villages/neighborhoods (from Wikipedia)
- `scraper_venues` — Bars, clubs, saunas, etc.
- `scraper_events` — Pride events, parties, performances
- `scraper_stays` — BnB/accommodation listings

### Infrastructure
- `scraper_snapshots` — Raw HTML/JSON for debugging (3 retained per URL)
- `scraper_entity_map` — Maps source_name+source_id → canonical entity UUID
- `scraper_ingest_runs` — Run logs with counts and errors
- `scraper_dedupe_decisions` — Dedup match records with confidence scores
- `scraper_migrations` — Applied migration tracker

## Rate Limiting

- Per-domain tracking with configurable delay
- Jitter ±25% on all delays to avoid request patterns
- Polite mode (default: on) doubles all crawl delays
- Exponential backoff on 429/5xx: base 2s, doubling per retry, max 3 retries
- Max 2 concurrent Playwright browsers (semaphore)

## Resilience

- **Kill switches**: `DISABLE_SOURCE_*` env vars immediately disable any source
- **Block detection**: TravelGay and MisterBnB connectors detect 403s, CAPTCHAs, and login walls
- **Snapshot retention**: Last 3 snapshots per URL kept for debugging
- **Error tracking**: Every failed request logged with URL, status code, and stack trace
- **Ingest runs**: Complete audit trail of every scrape run
