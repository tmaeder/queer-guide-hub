# Queer Guide

LGBTQ+ travel & community platform at queer.guide

## Commands

| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev | `npm run dev` (port 8080) |
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Format | `npm run format` |

The scraper has its own `package.json` under `scraper/` — `cd scraper && npm install`, then `npm test` etc. there. Workers each from their own directory: `wrangler dev` / `wrangler deploy`.

## Architecture

```
queer-guide-hub/
├── src/                  # React 19 + Vite + TS + Tailwind + MUI + shadcn/ui (frontend)
├── scraper/              # Node.js scraping pipeline (Cheerio + Playwright) — own package.json,
│                         # has its own src/, tests/, docs/, scripts/ inside
├── supabase/
│   ├── functions/        # Deno edge functions
│   └── migrations/       # PostgreSQL migrations
├── workers/
│   ├── ingest/           # CF Worker: search-intelligence ingest pipeline
│   ├── search-proxy/     # CF Worker: Meilisearch proxy with Postgres-driven synonyms
│   ├── snapshot-archiver/ # CF Worker: archives admin/editorial snapshots
│   └── submit/           # CF Worker: extension submissions → ingestion_staging
├── docs/                 # Project-wide docs (a11y-audit, architecture, search-intelligence, …)
├── scripts/              # One-shot operator scripts (configure-meili.sh, …)
└── e2e/                  # Playwright e2e specs
```

**Frontend stack:** React 19, Vite 6, TypeScript 5.8, Tailwind, MUI 7, TanStack Query/Router/Table, MapLibre GL, Tiptap editor, i18next (11 langs), Recharts, react-force-graph-2d

**Backend:** Supabase (PostgreSQL 17.4, Auth, Storage, Edge Functions), Cloudflare Pages + Workers, GitHub Actions (scraper cron)

**Workflow orchestration:** pgmq v1.4.4 + `workflow-dispatcher` edge function. Tables: `workflow_definitions` (24 workflows), `workflow_runs`. Queues: scheduled_jobs, import_jobs, content_processing, dead_letter. Exponential backoff retry, concurrency limits, idempotency keys.

**Ingestion pipeline:** `source-*` edge functions (data fetchers) feed into `pipeline-*` functions (normalize, validate, deduplicate, quality-score, review-gate). Each source maps to a workflow definition.

**News pipeline (cut over, 2026-04-30):** Canonical path is cron `0 * * * *` (`wf-news-pipeline`) → `pipeline-executor` → `news-ingestion` DAG (10 nodes: `source-rss-news` → `pipeline-normalize` → `pipeline-sanitize-news` → `pipeline-enrich-news` (LLM tags + summary + geo, circuit-broken) → `pipeline-quality-enhance` → `pipeline-validate` → `pipeline-deduplicate` → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit`). Idempotent commit via `news_commit_staging_batch` RPC, UNIQUE on `news_articles.fingerprint` (SHA-256 of normalized_title + published_day + source_id, URL fallback). Source health auto-managed: exp backoff (5min × 2ⁿ, cap 24h), auto-pause at 8 consecutive failures, eligibility via `news_sources_eligible()` RPC. Full audit in `news_dedup_audit`. Visible / editable / observable at `/admin/pipelines?pipeline=news-ingestion` (Builder) and `/admin/pipelines?tab=news` (Sources / Staging / Dedup audit). Manual admin triggers from NewsSourcesManager now also enqueue this canonical pipeline. The legacy `fetch-news` edge function has been removed from the codebase; deploy with `supabase functions deploy --prune` to remove from the project. Migration `20260429310000` already disabled its cron + workflow-dispatcher trigger.

**Marketplace pipeline (hardened, 2026-04-15):** Cron `0 4 * * *` → `marketplace-ingestion` DAG (13 nodes, multi-source fan-in): `source-awin` + `source-shopify` + `source-etsy` → `fan-in` → `pipeline-normalize` → `pipeline-validate` (marketplace branch: title/price/URL/image/currency/availability) → `marketplace-relevance` (Claude Haiku LGBTQ+ gate, rejects < 0.5 confidence) → `pipeline-deduplicate` (marketplace branch: source_entity_id → external_url → domain+title → brand+title → title trigram) → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit` (marketplace branch) → parallel `marketplace-image-mirror` (→ `marketplace-images` R2/Storage bucket, SHA-256 dedup) + `embedding-generator`. Atomic commit via `commit_marketplace_staging_batch` RPC with advisory lock + price-history delta + source-junction upsert. UNIQUE on `(source_type, source_entity_id)`. `price_usd` auto-computed from `fx_rates` (23 currencies, refreshed daily via `marketplace-fx-sync`). Affiliate links resolved to `affiliate_partners` via `merchant_domain`. Link-rot sweeper `marketplace-link-checker` (weekly) updates `link_health`, demotes broken listings to `status='inactive'`. Multi-merchant registry `marketplace_merchants` (provider, shop_domain/shop_id, api_key_env, last_sync_*). Visible at `/admin/pipelines?pipeline=marketplace-ingestion` (Builder).

**Payments:** Stripe via `create-checkout-session` + `stripe-webhook` edge functions.

**User submissions (Chrome extension):** `extension/` (MV3, React 19) extracts venues/events/hotels/marketplace/news from any webpage via JSON-LD/microdata/OpenGraph/DOM heuristics. `workers/submit/` (CF Worker) verifies user Supabase JWTs and stages into the same `ingestion_staging` table the scraper uses, with `source_type='user_submission'` — submissions flow through the existing normalize → dedupe → quality-score → review-gate → commit pipeline. Migration `Dev/src/db/migrations/002_user_submissions.sql` adds submitter columns + RLS.

**Note:** `supabase/functions/` and `supabase/migrations/` at the repo root are the canonical locations.

## Repo stats

- **Edge functions:** 194
- **Migrations:** 268

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

- Frontend (root): see `.env.example` — Supabase URL + anon key, Mapbox token, feature flags
- Scraper (`scraper/`): `DATABASE_URL`, source-specific API keys (see `scraper/.env.example`)
- Workers: each has `.dev.vars` for local dev

## Deployment

- **Frontend:** push to `main` → Cloudflare Pages auto-deploys
- **Edge functions:** `supabase functions deploy <function-name>`
- **Workers:** `wrangler deploy` from each worker directory
- **Scraper:** GitHub Actions — daily full refresh (03:15 UTC) + hourly events
- **DB migrations:** applied via Supabase CLI or dashboard

## Testing

- **Frontend unit (root):** `npm test` — vitest + jsdom, `src/**/*.{test,spec}.{ts,tsx}`
- **Scraper:** `cd scraper && npm test` — vitest, `tests/**/*.test.ts`, 30s timeout, v8 coverage
- **E2E:** Playwright config at `playwright.config.ts`; specs in `e2e/`. Run via `npm run test:e2e` (or `test:e2e:ui` for the Playwright UI). Full suite runs nightly at 03:00 UTC via `.github/workflows/e2e-nightly.yml`; an `e2e-i18n.yml` smoke job runs on PRs touching i18n / trip-planner code.

## Gotchas

### iCloud & Git
The repo lives in an iCloud-synced folder. `.git` objects get evicted. If git commands hang or fail, run `brctl download .git` first.

### DB Column Names (common traps)
- All entity tables use `is_featured` (boolean). The legacy `featured` column on `venues` and `events` was dropped in PR #312; codebase migrated to `is_featured` end-to-end.
- `personalities.birth_date` / `death_date` (date type, NOT `birth_year` / `death_year` int)
- `news_sources.source_type` (NOT `type`), `.last_fetched_at` (NOT `last_fetch_at`)
- `countries.code` (NOT `iso_code`)
- `events.title` (NOT `name`)
- Table is `unified_tags` (NOT `tags`), has NO `is_active` column
- `personalities` has NO `known_for` column — use `profession` + `lgbti_connection`

### Migrations
- Cannot use `CONCURRENTLY` (migrations run inside transactions)
- `supabase/migrations/` is large — check for conflicts before adding new ones (see Repo stats for current count)

### Frontend
- Path alias: `@/*` → `src/*`
- Vite manual chunks configured for: vendor, router, MUI, utils, graph, exceljs, maplibre, tiptap, HLS, PDF, mammoth

## Design

LGBTQ+ travelers, locals, activists, researchers, allies. Warm, trusted, empowering. Safety-first, inclusive by default, content is the hero.

- Brand: magenta `#b60d3d` (light) / `#ff7386` (dark), monochrome + single accent. Reach for the brand color via `theme.palette.brand.main` or `hsl(var(--brand))`, never as a hex literal — ESLint warns on color literals outside `src/theme/` and `src/config/`.
- Typography: Inter (body + most headings) + Plus Jakarta Sans (display only — homepage stats, personality cards, home widgets). Both self-hosted. See `docs/design-system/typography.md`.
- Strict flat: 0 radius, 0 borders, 0 shadows, 0 underlines. Enforced by `src/components/ui/__tests__/flat-compliance.test.tsx`.
- Icons inline in text flow, never in separate containers. Minimal UI labeling.
- Links by color/opacity only. Clean hover (0.85) and active (0.7) states.
- Full light + dark mode (system preference + header toggle).
- Components: shadcn-as-MUI wrappers in `src/components/ui/` — read `src/components/ui/README.md` before adding new ones.

### Documented exceptions
- **Error / warning** colors (`--destructive`, `--warning`) are visually distinct red, not brand magenta — semantic clarity wins over strict monochrome.
- **Admin chromatic palette** (`--cat-*` tokens, content-type accents) is the only place where multiple hues appear. Stay monochrome anywhere a normal user can see.

### Design System Files
- Tokens: `src/index.css` (CSS variables), `src/theme/muiTheme.ts` (MUI theme)
- Animation: `src/lib/animation.ts` (durations, easings, distances)
- Layout: `src/lib/sx.ts` (container, center, pageWrapper, stack, row)
- Components: MUI 7 + 50 shadcn/ui components in `src/components/ui/`
