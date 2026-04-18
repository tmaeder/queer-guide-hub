# Queer Guide

LGBTQ+ travel & community platform at queer.guide

## Commands

| Task | Root (scraper) | Web (frontend) |
|------|---------------|----------------|
| Install | `npm install` | `npm install --legacy-peer-deps` |
| Dev | `npm run server` | `npm run dev` (port 8080) |
| Build | — | `npm run build` |
| Test | `npm test` | `cd web && npm test` |
| Lint | `npm run lint` | `cd web && npm run lint` |
| Typecheck | `npm run typecheck` | `cd web && npm run typecheck` |
| Format | — | `cd web && npm run format` |

Workers (each from their own directory): `wrangler dev` / `wrangler deploy`

## Architecture

```
Dev/
├── web/                  # React 19 + Vite + TS + Tailwind + MUI + shadcn/ui
├── scraper/              # Node.js scraping pipeline (Cheerio + Playwright)
├── supabase/
│   ├── functions/        # 118 Deno edge functions
│   └── migrations/       # 435+ PostgreSQL migrations
├── workers/
│   ├── email-ingest/     # CF Worker: email processing
│   └── scraper-api/      # CF Worker: scraper orchestration
├── geo-boundaries-worker/ # CF Worker: GeoJSON from R2
├── tiles-worker/          # CF Worker: PMTiles map tiles (git submodule)
├── src/                   # Scraper source code
├── tests/                 # Scraper tests (vitest)
└── docs/                  # Scraper documentation
```

**Frontend stack:** React 19, Vite 6, TypeScript 5.8, Tailwind, MUI 7, TanStack Query/Router/Table, MapLibre GL, Tiptap editor, i18next (11 langs), Recharts, react-force-graph-2d

**Backend:** Supabase (PostgreSQL 17.4, Auth, Storage, Edge Functions), Cloudflare Pages + Workers, GitHub Actions (scraper cron)

**Workflow orchestration:** pgmq v1.4.4 + `workflow-dispatcher` edge function. Tables: `workflow_definitions` (24 workflows), `workflow_runs`. Queues: scheduled_jobs, import_jobs, content_processing, dead_letter. Exponential backoff retry, concurrency limits, idempotency keys.

**Ingestion pipeline:** `source-*` edge functions (data fetchers) feed into `pipeline-*` functions (normalize, validate, deduplicate, quality-score, review-gate). Each source maps to a workflow definition.

**News pipeline (hardened, 2026-04-15):** Single canonical path — old `fetch-news` direct-upsert is disabled. Cron `0 * * * *` (`wf-news-pipeline`) → `pipeline-executor` → `news-ingestion` DAG (7 nodes: `source-rss-news` → `pipeline-normalize` → `pipeline-enrich-news` (LLM tags + summary + geo, circuit-broken) → `pipeline-validate` → `pipeline-deduplicate` → `pipeline-review-gate` → `pipeline-commit`). Idempotent commit via `news_commit_staging_batch` RPC, UNIQUE on `news_articles.fingerprint` (SHA-256 of normalized_title + published_day + source_id, URL fallback). Source health auto-managed: exp backoff (5min × 2ⁿ, cap 24h), auto-pause at 8 consecutive failures, eligibility via `news_sources_eligible()` RPC. Full audit in `news_dedup_audit`. Visible / editable / observable at `/admin/pipelines?pipeline=news-ingestion` (Builder) and `/admin/pipelines?tab=news` (Sources / Staging / Dedup audit).

**Marketplace pipeline (hardened, 2026-04-15):** Cron `0 4 * * *` → `marketplace-ingestion` DAG (13 nodes, multi-source fan-in): `source-awin` + `source-shopify` + `source-etsy` → `fan-in` → `pipeline-normalize` → `pipeline-validate` (marketplace branch: title/price/URL/image/currency/availability) → `marketplace-relevance` (Claude Haiku LGBTQ+ gate, rejects < 0.5 confidence) → `pipeline-deduplicate` (marketplace branch: source_entity_id → external_url → domain+title → brand+title → title trigram) → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit` (marketplace branch) → parallel `marketplace-image-mirror` (→ `marketplace-images` R2/Storage bucket, SHA-256 dedup) + `embedding-generator`. Atomic commit via `commit_marketplace_staging_batch` RPC with advisory lock + price-history delta + source-junction upsert. UNIQUE on `(source_type, source_entity_id)`. `price_usd` auto-computed from `fx_rates` (23 currencies, refreshed daily via `marketplace-fx-sync`). Affiliate links resolved to `affiliate_partners` via `merchant_domain`. Link-rot sweeper `marketplace-link-checker` (weekly) updates `link_health`, demotes broken listings to `status='inactive'`. Multi-merchant registry `marketplace_merchants` (provider, shop_domain/shop_id, api_key_env, last_sync_*). Visible at `/admin/pipelines?pipeline=marketplace-ingestion` (Builder).

**Payments:** Stripe via `create-checkout-session` + `stripe-webhook` edge functions.

**Note:** `web/supabase/` is the canonical location for functions and migrations. Root `supabase/` is a symlink/submodule — always work in `web/supabase/`.

## Infrastructure

- **Supabase:** project `xqeacpakadqfxjxjcewc` (eu-central-2)
- **Cloudflare Pages:** project `queer-guide` at `queer-guide.pages.dev`
- **CF Account:** `7aa3765cc5f50f2b681b782eb4a8d296`
- **Search:** Meilisearch (self-hosted, Infomaniak) — hybrid search (keyword + semantic via OpenAI embeddings)
  - **CF Worker:** `search-proxy` proxies frontend → Meilisearch, holds API key
  - **Sync:** `meilisearch-sync` edge function (full sync + incremental via pg_net triggers)
  - **Indexes:** venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages
  - **Config:** `meilisearch/` directory (Docker Compose, Caddy, index config scripts)
  - **Legacy:** PostgreSQL FTS `universal_search()` and `algolia-sync` are deprecated

## Environment

- Root: see `.env.example` (DATABASE_URL, scraper config)
- Web: Supabase URL + anon key, Mapbox token, service API keys
- Workers: each has `.dev.vars` for local dev

## Deployment

- **Frontend:** push to `main` → Cloudflare Pages auto-deploys
- **Edge functions:** `supabase functions deploy <function-name>`
- **Workers:** `wrangler deploy` from each worker directory
- **Scraper:** GitHub Actions — daily full refresh (03:15 UTC) + hourly events
- **DB migrations:** applied via Supabase CLI or dashboard

## Testing

- **Scraper:** `npm test` — vitest, `tests/**/*.test.ts`, 30s timeout, v8 coverage
- **Web unit:** `cd web && npm test` — vitest + jsdom, `src/**/*.{test,spec}.{ts,tsx}`
- **Web E2E:** Playwright config exists (`web/playwright.config.ts`) but tests are not actively maintained

## Gotchas

### iCloud & Git
The repo lives in an iCloud-synced folder. `.git` objects get evicted. If git commands hang or fail, run `brctl download .git` first.

### Install
`npm install --legacy-peer-deps` is required in `web/` (date-fns v4 vs react-day-picker v8 peer conflict).

### DB Column Names (common traps)
- `news_articles.is_featured` (NOT `featured`) — but `venues.featured` and `events.featured` ARE correct
- `personalities.birth_date` / `death_date` (date type, NOT `birth_year` / `death_year` int)
- `news_sources.source_type` (NOT `type`), `.last_fetched_at` (NOT `last_fetch_at`)
- `countries.code` (NOT `iso_code`)
- `events.title` (NOT `name`)
- Table is `unified_tags` (NOT `tags`), has NO `is_active` column
- `personalities` has NO `known_for` column — use `profession` + `lgbti_connection`

### Migrations
- Cannot use `CONCURRENTLY` (migrations run inside transactions)
- `web/supabase/migrations/` has 435+ files — check for conflicts before adding new ones

### Frontend
- Path alias: `@/*` → `src/*`
- Large chunk warning for useSecureMapbox (~1.5MB) — pre-existing, ignore
- Vite manual chunks configured for: vendor, router, MUI, utils, graph, exceljs, maplibre, tiptap, HLS, PDF, mammoth

## Design

LGBTQ+ travelers, locals, activists, researchers, allies. Warm, trusted, empowering. Safety-first, inclusive by default, content is the hero.

- Brand: magenta `#b60d3d` (light) / `#ff7386` (dark), monochrome + single accent
- Typography: Inter (body + headings), self-hosted
- Strict flat: 0 radius, 0 borders, 0 shadows, 0 underlines. Full-width fluid layout.
- Icons inline in text flow, never in separate containers. Minimal UI labeling.
- Links by color/opacity only. Clean hover (0.85) and active (0.7) states.
- Full light + dark mode (system preference + manual toggle)

### Design System Files
- Tokens: `web/src/index.css` (CSS variables), `web/src/theme/muiTheme.ts` (MUI theme)
- Animation: `web/src/lib/animation.ts` (durations, easings, distances)
- Layout: `web/src/lib/sx.ts` (container, center, pageWrapper, stack, row)
- Components: MUI 7 + 50 shadcn/ui components in `web/src/components/ui/`
