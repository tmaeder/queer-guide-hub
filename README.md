# Queer Guide

**[🌐 Live → queer.guide](https://queer.guide)**

![queer.guide](docs/screenshot.png)

The global platform for LGBTQ+ travel, community, and safe spaces at [queer.guide](https://queer.guide).

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, Vite 8, TypeScript 6.0, Tailwind CSS, shadcn/ui |
| **Routing & Data** | TanStack Router + Query + Table |
| **Backend** | Supabase (PostgreSQL 17.4, Auth, Storage, Edge Functions) |
| **Hosting** | Cloudflare Pages + Cloudflare Workers |
| **Search** | Postgres hybrid search (`search_documents` tsvector + pgvector HNSW + PostGIS), RRF keyword/vector fusion in SQL, CF Workers AI embeddings via AI Gateway. Served by the `search-proxy` Worker. (Meilisearch decommissioned code-side 2026-06-07; remains only as a `SEARCH_BACKEND` fallback flag pending the external node shutdown.) |
| **Maps** | MapLibre GL, Protomaps basemaps, Mapbox geocoding |
| **AI** | Anthropic Claude (Haiku — relevance gating), OpenAI GPT-4o-mini (tagging, enrichment) |
| **Workflows** | pgmq + workflow-dispatcher (24 workflow definitions) |
| **Payments** | Stripe |
| **i18n** | i18next — 11 languages (ar, de, en, es, fr, it, ja, ko, pt, ru, zh) |
| **Editor** | Tiptap |
| **Analytics** | Umami (self-hosted) |

## Project Structure

```
src/                       # React app (~90 pages, feature-grouped components)
supabase/
├── functions/             # 212 Deno Edge Functions (+ _shared, _tests)
└── migrations/            # 597 PostgreSQL migrations
workers/
├── geo/                   # CF Worker: geocoding proxy
├── image-cdn/             # CF Worker: image transform + cache layer
├── image-ingest/          # CF Worker: image mirror/dedup → R2
├── ingest/                # CF Worker: search-intelligence ingest pipeline
├── search-proxy/          # CF Worker: Postgres search proxy (RPC-backed, synonym injection)
├── snapshot-archiver/     # CF Worker: admin/editorial snapshot archival
├── submit/                # CF Worker: extension submissions → ingestion_staging
└── trip-inbox/            # CF Worker: trip-planning inbox ingestion
scraper/                   # Node.js scraping pipeline (Cheerio + Playwright)
extension/                 # Chrome extension (MV3, React 19) — user venue/event submissions
e2e/                       # Playwright E2E tests
scripts/                   # Operational scripts
docs/                      # Architecture docs, ADRs, runbooks
.github/workflows/         # 36 GitHub Actions (CI, scraper crons, e2e nightly)
```

## Local Development

Requirements: Node.js 18+, npm.

```sh
npm install --legacy-peer-deps
npm run dev                       # port 8080
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (port 8080) |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run typecheck` | tsc --noEmit |

A root `Makefile` provides cross-package convenience targets (`make install`, `make build`, `make test`, `make lint`).

Sub-packages have their own `package.json`:
- `scraper/` — `cd scraper && npm install && npm test`
- `extension/` — `cd extension && npm install && npm run build`
- `workers/*` — each uses `wrangler dev` / `wrangler deploy`

## Architecture

### Search

Hybrid (keyword + semantic) personalized search with reranking. Full design in [SEARCH_SYSTEM.md](SEARCH_SYSTEM.md).

```
Frontend ──► search-proxy (CF Worker)
                ├── AI Gateway → Workers AI (embeddings)
                └── Supabase RPC: search_hybrid (RRF keyword + vector fusion,
                    facets, geo, target-group filter, recency decay)

Supabase ──entity + content_embeddings triggers──► search_documents (kept fresh in-DB)
```

Entity types: venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages.

### Ingestion Pipelines

Workflow orchestration via pgmq + `workflow-dispatcher` edge function. All pipeline/source functions wrapped with `withErrorReporting` (Sentry + internal feedback).

```
source-* (data fetchers)
  → pipeline-normalize
  → pipeline-validate
  → pipeline-deduplicate
  → pipeline-quality-score
  → pipeline-review-gate
  → pipeline-commit
```

Queues: `scheduled_jobs`, `import_jobs`, `content_processing`, `dead_letter`. Exponential backoff retry, concurrency limits, idempotency keys.

**News** (hourly): RSS sources → LLM enrichment (tags, summary, geo) → fingerprint dedup → commit. Source health auto-managed with exponential backoff and auto-pause at 8 consecutive failures.

**Marketplace** (daily, multi-source fan-in): Awin + Shopify + Etsy → Claude Haiku LGBTQ+ relevance gate → dedup → price-history tracking → image mirroring → embeddings. Weekly link-rot sweeper.

**User submissions** (Chrome extension): extracts structured data from any webpage via JSON-LD/microdata/OpenGraph/DOM heuristics → CF Worker stages into `ingestion_staging` → flows through standard pipeline.

Observable at `/admin/pipelines` (Builder, Monitor, Sources, Staging, Dedup audit).

### Auth & Security

- Supabase Auth (email/password, OAuth, passkeys)
- Row-Level Security on all tables; admin via `admin_roles.canManageContent`
- Cloudflare Turnstile on public forms
- Audit logging for admin actions
- CSP / HSTS / X-Frame-Options

## Deployment

| Component | How |
|-----------|-----|
| Frontend | Push to `main` → Cloudflare Pages auto-deploys |
| Edge functions | `supabase functions deploy <name> --project-ref xqeacpakadqfxjxjcewc` |
| Workers | `wrangler deploy` from each worker directory |
| DB migrations | Supabase CLI (`supabase db push`) |
| Scraper | GitHub Actions cron — daily full refresh + hourly events |

See `docs/runbooks/` for operational procedures (deploy, rollback, secret rotation, reindex, failed pipelines).

## Testing

| Type | Tool | Run |
|------|------|-----|
| Unit/component | Vitest + testing-library | `npm test` |
| E2E | Playwright | `npm run test:e2e` |
| Types | tsc | `npm run typecheck` |
| Scraper | Vitest | `cd scraper && npm test` |

E2E nightly run at 03:00 UTC via GitHub Actions. i18n smoke tests on PRs touching i18n code.

## Design

Monochrome design system. Black/white + grayscale only. No shadows, no gradients in public UI. Inter typeface. Icons from lucide-react. Full light + dark mode.

**Shape:** semantic 3-tier radius — `rounded-container` (16px, cards/sheets/dialogs), `rounded-element` (8px, buttons/inputs/list rows), `rounded-badge` (4px, chips/tags). Tokens defined in `src/index.css` `@theme`. `rounded-full` permitted for avatars only.

**Spacing:** strict 8 pt grid. Even-step Tailwind utilities only (`p-{0,2,4,6,8,10,12,16,20,24}`). Odd-step utilities banned in new code.

**Exceptions:** muted `--destructive` red for hard errors, traffic-light colors on the trip safety briefing, functional categorical scales (maps, equality scores, password strength). Crisis/safety pages are animation-free.

Components: 58 shadcn/ui primitives in `src/components/ui/`. ESLint enforces color, radius, spacing, and shadow constraints — error in public tree, warn in admin.

## Compliance (Scraper)

`robots.txt` checked per domain (1h cache), `Crawl-delay` honored, ≥3s polite delays + jitter. No anti-bot bypassing, no CAPTCHA solving, no login-walled sources. Per-source kill switches via `DISABLE_SOURCE_<NAME>=true`.
