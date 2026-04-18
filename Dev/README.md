# Queer Guide Scraper

A production-grade LGBTQ+ data pipeline that collects venues, events, stays, and places from multiple sources into a single, normalised PostgreSQL schema.

---

## Architecture overview

```
sources/                  connectors (one per site)
  wikipedia/              ← static HTML, Cheerio
  iglta/                  ← semi-static, Cheerio + JSON-LD
  outsavvy/               ← React SPA, Playwright
  travelgay/              ← React SPA, Playwright
  patroc/                 ← Playwright
  misterbandb/            ← BLOCKED (requires login)

normalize/                raw → canonical mapping
  schema.ts               Zod schemas for all entity types
  venue / event / place / stay normalizers

db/
  migrations/001_core_schema.sql
  queries/                typed query functions per entity

jobs/
  orchestrator.ts         runs connectors → normalise → dedupe → persist
  scheduler.ts            node-cron (local alternative to GitHub Actions)
  cli.ts                  npm run scrape -- [options]

utils/
  robots.ts               robots.txt compliance checker
  rateLimit.ts            per-domain rate limiter with jitter
  fetch.ts                HTTP fetch with exponential back-off
  dedupe.ts               strong + fuzzy deduplication (Jaro-Winkler)
  snapshot.ts             raw HTML/JSON snapshot storage
  text.ts                 slug, normalise, extractDomain, stripHtml…
  date.ts                 date parsing, timezone inference
```

---

## Entity schema

| Table | Description |
|-------|-------------|
| `places` | Gay villages, neighbourhoods, districts |
| `venues` | Bars, clubs, cafés, saunas, shops |
| `events` | Pride, parties, festivals |
| `stays` | BnBs, accommodations |
| `source_snapshots` | Raw HTML/JSON for debugging |
| `source_entity_maps` | Maps source IDs → canonical entity IDs |
| `ingest_runs` | Run log with counts and errors |
| `dedupe_decisions` | Deduplication decision audit trail |

---

## Quick start

```bash
# 1. Install
npm install
npx playwright install chromium --with-deps

# 2. Configure
cp .env.example .env
# edit .env – set DATABASE_URL

# 3. Migrate
npm run migrate

# 4. Scrape
npm run scrape -- --source=wikipedia
npm run scrape -- --source=all
npm run scrape -- --source=travelgay --type=venue
npm run scrape -- --source=iglta --type=event --since=24h

# 5. Test
npm test
```

See [docs/how-to-run.md](docs/how-to-run.md) for the full guide.

---

## Sources

| Source | Types | Method | Notes |
|--------|-------|--------|-------|
| [Wikipedia – gay villages](https://en.wikipedia.org/wiki/List_of_gay_villages) | place | Cheerio | Static; reliable |
| [IGLTA Pride Calendar](https://www.iglta.org/events/pride-calendar/) | event | Cheerio + JSON-LD | Semi-static |
| [Outsavvy Guide](https://www.outsavvy.com/guide) | venue, event | Playwright | React SPA |
| [TravelGay](https://www.travelgay.com/) | venue, event | Playwright | React SPA; may have anti-bot |
| [Patroc](https://www.patroc.com/) | venue, event | Playwright | Checks robots.txt |
| [MisterBnB](https://www.misterbandb.com/) | stay | — | **Blocked** – login required |

---

## Compliance

- `robots.txt` is checked before every domain is scraped (cached 1 hr per domain).
- Polite mode enforces ≥ 3 s delays between requests + jitter.
- `robots.txt` `Crawl-delay` is respected.
- No anti-bot bypassing, no CAPTCHA solving, no login-wall access.
- Kill switches: `DISABLE_SOURCE_<NAME>=true` disables a source instantly.
- MisterBnB is permanently blocked in CI (`DISABLE_SOURCE_MISTERBANDB=true`).

See [docs/compliance.md](docs/compliance.md) for full details.

---

## Adding a new source

See [docs/add-a-source.md](docs/add-a-source.md).

---

## GitHub Actions

The workflow at `.github/workflows/scrape.yml` runs:

- **Daily at 03:15 UTC** – full refresh of all sources
- **Hourly** – events only

Required secrets: `DATABASE_URL`, `SCRAPER_USER_AGENT`.

---

## Sample output

```
INFO: Starting scrape { sources: ['wikipedia'], types: ['place'] }
INFO: Parsed gay villages from Wikipedia { count: 147 }
INFO: Ingest run complete { source: 'wikipedia', pagesFetched: 1, inserted: 147, updated: 0, failed: 0 }
INFO: Orchestration complete {
  totalPagesFetched: 1,
  totalEntitiesParsed: 147,
  totalInserted: 147,
  totalUpdated: 0,
  totalBlocked: 0,
  totalFailed: 0,
  durationMs: 2341
}
```

---

## Tech stack

| Tool | Purpose |
|------|---------|
| TypeScript + Node 22 | Language + runtime |
| Cheerio | Static HTML parsing |
| Playwright | JS-heavy site rendering |
| postgres.js | PostgreSQL client |
| Zod | Schema validation |
| Pino | Structured logging |
| node-cron | Local scheduling |
| Vitest | Unit testing |
| GitHub Actions | CI/CD + cron scheduling |
